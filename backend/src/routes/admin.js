import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { calculateAmountCents, getPlan, PLANS, TRIAL_DAYS } from '../lib/plans.js';

// Acha o usuário no Supabase Auth pelo e-mail, ou cria um novo. O membro
// define a senha depois via "Esqueci a senha". Reaproveitado ao criar org e
// ao adicionar membro.
async function findOrCreateUser(email) {
  const clean = email.trim().toLowerCase();
  const created = await supabase.auth.admin.createUser({ email: clean, email_confirm: true });
  if (created.data?.user) return created.data.user.id;
  const { data: list } = await supabase.auth.admin.listUsers();
  const found = list?.users?.find((u) => u.email?.toLowerCase() === clean);
  if (!found) throw new Error(created.error?.message || 'Não foi possível criar o usuário.');
  return found.id;
}

// Painel de controle global do dono do produto (super admin).
// Todas as rotas aqui ENXERGAM TODAS as organizações de propósito — por isso
// ficam atrás de requireSuperAdmin no server.js. Nunca monte sem essa trava.
export const adminRouter = Router();

// O frontend chama isto para saber se mostra o link do painel de controle.
// Como toda esta rota está atrás de requireSuperAdmin, um 200 já confirma.
adminRouter.get('/me', (req, res) => res.json({ superAdmin: true }));

// Lista todas as organizações com um resumo de uso e o e-mail do dono.
adminRouter.get('/organizations', async (req, res, next) => {
  try {
    const { search } = req.query;

    let q = supabase
      .from('organizations')
      .select('id, name, admin_status, created_at, owner_user_id')
      .order('created_at', { ascending: false });
    if (search) q = q.ilike('name', `%${search}%`);

    const { data: orgs, error } = await q;
    if (error) throw error;
    if (!orgs.length) return res.json([]);

    const ids = orgs.map((o) => o.id);

    // Assinaturas e donos numa tacada, depois junta em memória.
    const [{ data: subs }, { data: owners }] = await Promise.all([
      supabase.from('subscriptions').select('*').in('organization_id', ids),
      supabase.from('agents').select('organization_id, name, email, role').in('organization_id', ids).eq('role', 'owner'),
    ]);
    const subByOrg = Object.fromEntries((subs || []).map((s) => [s.organization_id, s]));
    const ownerByOrg = Object.fromEntries((owners || []).map((a) => [a.organization_id, a]));

    // Contagens por organização (uma consulta por tabela, agrupada em memória).
    const counts = await countByOrg(ids);

    const rows = orgs.map((o) => {
      const sub = subByOrg[o.id];
      return {
        id: o.id,
        name: o.name,
        adminStatus: o.admin_status,
        createdAt: o.created_at,
        owner: ownerByOrg[o.id] ? { name: ownerByOrg[o.id].name, email: ownerByOrg[o.id].email } : null,
        plan: sub ? getPlan(sub.plan_id).name : '—',
        planId: sub?.plan_id ?? null,
        subscriptionStatus: sub?.status ?? '—',
        amountCents: sub ? calculateAmountCents(sub) : 0,
        usage: counts[o.id] || emptyCounts(),
      };
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Cria uma organização já com dono, assinatura e funil. O super admin faz o
// cadastro no lugar do cliente.
adminRouter.post('/organizations', async (req, res, next) => {
  try {
    const { name, ownerEmail, ownerName, planId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Informe o nome da organização.' });
    if (!ownerEmail?.trim()) return res.status(400).json({ error: 'Informe o e-mail do dono.' });

    const plan = planId && PLANS[planId] && planId !== 'trial' ? planId : 'trial';
    const userId = await findOrCreateUser(ownerEmail);

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: name.trim(), owner_user_id: userId, admin_status: 'approved' })
      .select('id, name')
      .single();
    if (orgError) throw orgError;

    try {
      const { error: agentError } = await supabase.from('agents').insert({
        user_id: userId,
        organization_id: org.id,
        name: (ownerName || ownerEmail).trim(),
        email: ownerEmail.trim().toLowerCase(),
        role: 'owner',
      });
      if (agentError) throw agentError;

      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const isTrial = plan === 'trial';
      const { error: subError } = await supabase.from('subscriptions').insert({
        organization_id: org.id,
        plan_id: plan,
        status: isTrial ? 'trialing' : 'active',
        trial_ends_at: isTrial ? trialEndsAt : null,
      });
      if (subError) throw subError;

      const { error: stagesError } = await supabase.from('funnel_stages').insert(
        ['Novo', 'Em atendimento', 'Negociação', 'Ganho', 'Perdido'].map((n, i) => ({
          organization_id: org.id,
          name: n,
          position: i,
        })),
      );
      if (stagesError) throw stagesError;
    } catch (err) {
      // rollback manual: não deixa organização órfã
      await supabase.from('organizations').delete().eq('id', org.id);
      throw err;
    }

    res.status(201).json({
      organization: org,
      aviso: 'O dono precisa definir a senha em "Esqueci a senha" na tela de login antes do primeiro acesso.',
    });
  } catch (err) {
    next(err);
  }
});

// Adiciona um usuário a QUALQUER organização (papel admin ou agent).
adminRouter.post('/organizations/:id/members', async (req, res, next) => {
  try {
    const { email, name, role } = req.body;
    const orgId = req.params.id;
    if (!email?.trim()) return res.status(400).json({ error: 'Informe o e-mail.' });
    const wantedRole = ['admin', 'agent', 'owner'].includes(role) ? role : 'agent';

    const { data: org } = await supabase.from('organizations').select('id').eq('id', orgId).maybeSingle();
    if (!org) return res.status(404).json({ error: 'Organização não encontrada.' });

    const userId = await findOrCreateUser(email);
    const { data: existing } = await supabase
      .from('agents').select('id').eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Esse e-mail já faz parte dessa organização.' });

    const { data: member, error } = await supabase
      .from('agents')
      .insert({
        user_id: userId,
        organization_id: orgId,
        name: (name || email).trim(),
        email: email.trim().toLowerCase(),
        role: wantedRole,
      })
      .select('id, name, email, role')
      .single();
    if (error) throw error;

    res.status(201).json({
      member,
      aviso: 'O usuário define a senha em "Esqueci a senha" antes do primeiro acesso.',
    });
  } catch (err) {
    next(err);
  }
});

// Detalhe de uma organização (dados + membros).
adminRouter.get('/organizations/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const [{ data: org, error }, { data: sub }, { data: members }, { data: sessions }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', id).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('organization_id', id).maybeSingle(),
      supabase.from('agents').select('name, email, role, status, created_at').eq('organization_id', id),
      supabase.from('whatsapp_sessions').select('label, phone_number, status').eq('organization_id', id),
    ]);
    if (error) throw error;
    if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

    const counts = await countByOrg([id]);

    res.json({
      organization: { id: org.id, name: org.name, adminStatus: org.admin_status, createdAt: org.created_at },
      subscription: sub
        ? { plan: getPlan(sub.plan_id).name, planId: sub.plan_id, status: sub.status, amountCents: calculateAmountCents(sub), trialEndsAt: sub.trial_ends_at, currentPeriodEnd: sub.current_period_end }
        : null,
      members: members || [],
      devices: sessions || [],
      usage: counts[id] || emptyCounts(),
    });
  } catch (err) {
    next(err);
  }
});

// Números para os gráficos: totais e séries por dia (últimos 30 dias).
adminRouter.get('/stats', async (req, res, next) => {
  try {
    const [orgs, subs, msgs, convos, contacts, campaigns] = await Promise.all([
      supabase.from('organizations').select('created_at, admin_status'),
      supabase.from('subscriptions').select('plan_id, status'),
      supabase.from('messages').select('created_at, direction'),
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('campaigns').select('id', { count: 'exact', head: true }),
    ]);

    const orgRows = orgs.data || [];
    const msgRows = msgs.data || [];

    // Série de mensagens por dia (30 dias)
    const days = lastNDays(30);
    const msgByDay = Object.fromEntries(days.map((d) => [d, { in: 0, out: 0 }]));
    for (const m of msgRows) {
      const d = (m.created_at || '').slice(0, 10);
      if (msgByDay[d]) msgByDay[d][m.direction === 'inbound' ? 'in' : 'out'] += 1;
    }

    // Organizações novas por dia
    const orgByDay = Object.fromEntries(days.map((d) => [d, 0]));
    for (const o of orgRows) {
      const d = (o.created_at || '').slice(0, 10);
      if (orgByDay[d] !== undefined) orgByDay[d] += 1;
    }

    // Distribuição por plano e por status de aprovação
    const byPlan = {};
    for (const s of subs.data || []) {
      const name = getPlan(s.plan_id).name;
      byPlan[name] = (byPlan[name] || 0) + 1;
    }
    const byAdminStatus = { pending: 0, approved: 0, suspended: 0 };
    for (const o of orgRows) byAdminStatus[o.admin_status] = (byAdminStatus[o.admin_status] || 0) + 1;

    res.json({
      totals: {
        organizations: orgRows.length,
        conversations: convos.count ?? 0,
        contacts: contacts.count ?? 0,
        campaigns: campaigns.count ?? 0,
        messages: msgRows.length,
      },
      pendingApproval: byAdminStatus.pending || 0,
      byPlan,
      byAdminStatus,
      series: {
        days,
        messagesIn: days.map((d) => msgByDay[d].in),
        messagesOut: days.map((d) => msgByDay[d].out),
        newOrganizations: days.map((d) => orgByDay[d]),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Renomear a organização. Faltava: dava para criar, aprovar e suspender, mas
// um nome digitado errado ficava para sempre.
adminRouter.patch('/organizations/:id', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Informe o nome da organização.' });

    const { data, error } = await supabase
      .from('organizations')
      .update({ name: name.trim() })
      .eq('id', req.params.id)
      .select('id, name, admin_status')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Organização não encontrada' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Exclusão definitiva: apaga a conta inteira — contatos, conversas, campanhas,
// dispositivos, equipe. Exige o nome digitado por extenso porque não há
// desfazer nem lixeira, e é o tipo de ação que não pode acontecer por clique
// errado numa lista.
adminRouter.delete('/organizations/:id', async (req, res, next) => {
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

    if (req.body?.confirmName?.trim() !== org.name) {
      return res.status(400).json({
        error: `Para excluir, digite exatamente o nome da organização: ${org.name}`,
      });
    }

    const orgId = org.id;

    // As tabelas filhas não têm cascade, então a ordem importa: primeiro o que
    // aponta para conversas e campanhas, depois elas próprias.
    const { data: conversas } = await supabase
      .from('conversations').select('id').eq('organization_id', orgId);
    for (const c of conversas ?? []) {
      await supabase.from('internal_notes').delete().eq('conversation_id', c.id);
    }

    const { data: campanhas } = await supabase
      .from('campaigns').select('id').eq('organization_id', orgId);
    for (const c of campanhas ?? []) {
      await supabase.from('campaign_messages').delete().eq('campaign_id', c.id);
    }

    const { data: fluxos } = await supabase
      .from('chatbot_flows').select('id').eq('organization_id', orgId);
    for (const f of fluxos ?? []) {
      await supabase.from('flow_node_stats').delete().eq('flow_id', f.id);
    }

    const { data: contatos } = await supabase
      .from('contacts').select('id').eq('organization_id', orgId);
    for (const c of contatos ?? []) {
      await supabase.from('contact_tags').delete().eq('contact_id', c.id);
    }

    for (const tabela of [
      'messages', 'conversations', 'campaigns', 'chatbot_flows',
      'prospecting_leads', 'prospecting_searches', 'contacts', 'tags',
      'funnel_stages', 'companies', 'whatsapp_sessions', 'payments',
      'subscriptions', 'agents',
    ]) {
      const { error } = await supabase.from(tabela).delete().eq('organization_id', orgId);
      if (error) throw new Error(`Falha ao limpar ${tabela}: ${error.message}`);
    }

    const { error } = await supabase.from('organizations').delete().eq('id', orgId);
    if (error) throw error;

    res.json({ ok: true, deleted: org.name });
  } catch (err) {
    next(err);
  }
});

// Aprovar / suspender / reativar uma organização.
adminRouter.post('/organizations/:id/:action', async (req, res, next) => {
  try {
    const map = { approve: 'approved', suspend: 'suspended', reactivate: 'approved' };
    const status = map[req.params.action];
    if (!status) return res.status(400).json({ error: 'Ação inválida' });

    const { data, error } = await supabase
      .from('organizations')
      .update({ admin_status: status })
      .eq('id', req.params.id)
      .select('id, name, admin_status')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Organização não encontrada' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------- helpers ----------

function emptyCounts() {
  return { members: 0, devices: 0, contacts: 0, conversations: 0, messages: 0, campaigns: 0 };
}

// Conta por organização em poucas queries (agrupando em memória), evitando
// uma consulta por org.
async function countByOrg(ids) {
  const result = Object.fromEntries(ids.map((id) => [id, emptyCounts()]));
  const tables = [
    ['agents', 'members'],
    ['whatsapp_sessions', 'devices'],
    ['contacts', 'contacts'],
    ['conversations', 'conversations'],
    ['messages', 'messages'],
    ['campaigns', 'campaigns'],
  ];
  for (const [table, key] of tables) {
    const { data } = await supabase.from(table).select('organization_id').in('organization_id', ids);
    for (const row of data || []) {
      if (result[row.organization_id]) result[row.organization_id][key] += 1;
    }
  }
  return result;
}

function lastNDays(n) {
  // Sem Date.now()? Aqui é backend normal (não workflow), Date funciona.
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
