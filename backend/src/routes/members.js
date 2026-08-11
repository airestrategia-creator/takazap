import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { findOwned } from '../lib/tenancy.js';
import { effectiveLimits } from '../lib/plans.js';

export const membersRouter = Router();

const ROLES = ['admin', 'agent'];

// Lista a equipe da organização.
membersRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, email, role, status, created_at')
      .eq('organization_id', req.agent.organization_id)
      .order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Convida um membro. Só owner/admin. O papel 'owner' nunca é atribuído aqui —
// dono é quem criou a conta.
membersRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { email, name, role } = req.body;
    const orgId = req.agent.organization_id;

    if (!email?.trim()) return res.status(400).json({ error: 'Informe o e-mail do membro.' });
    const wantedRole = ROLES.includes(role) ? role : 'agent';

    // Limite de membros do plano.
    const { data: subscription } = await supabase
      .from('subscriptions').select('*').eq('organization_id', orgId).single();
    const limits = effectiveLimits(subscription ?? {});
    const { count } = await supabase
      .from('agents').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
    if ((count ?? 0) >= limits.members) {
      return res.status(402).json({
        error: `Seu plano permite ${limits.members} membro(s). Faça upgrade para "Completo + Equipe" para convidar mais.`,
        code: 'MEMBER_LIMIT',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Acha o usuário no Supabase Auth ou cria um novo. Como o backend usa a
    // service_role, conseguimos criar — o membro define a senha depois via
    // "esqueci a senha". (createUser falha se o e-mail já existir; nesse caso
    // procuramos o usuário existente.)
    let userId;
    const created = await supabase.auth.admin.createUser({
      email: cleanEmail,
      email_confirm: true,
    });
    if (created.data?.user) {
      userId = created.data.user.id;
    } else {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (!found) throw new Error(created.error?.message || 'Não foi possível criar o usuário.');
      userId = found.id;
    }

    // Já é membro desta organização?
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'Esse e-mail já faz parte da equipe.' });
    }

    const { data: member, error } = await supabase
      .from('agents')
      .insert({
        user_id: userId,
        organization_id: orgId,
        name: (name || cleanEmail).trim(),
        email: cleanEmail,
        role: wantedRole,
      })
      .select('id, name, email, role, status')
      .single();
    if (error) throw error;

    res.status(201).json({
      member,
      aviso: 'O membro precisa definir a senha em "Esqueci a senha" na tela de login antes do primeiro acesso.',
    });
  } catch (err) {
    next(err);
  }
});

// Muda o papel de um membro. Só owner. Não permite mexer no próprio owner nem
// promover alguém a owner por aqui.
membersRouter.patch('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Papel inválido. Use admin ou agent.' });
    }

    const alvo = await findOwned('agents', req.params.id, req.agent.organization_id, 'id, role, user_id');
    if (alvo.role === 'owner') {
      return res.status(403).json({ error: 'O dono da conta não pode ter o papel alterado.' });
    }

    const { data, error } = await supabase
      .from('agents')
      .update({ role })
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .select('id, name, email, role, status')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Remove um membro. Só owner. Nunca remove o próprio owner.
membersRouter.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const alvo = await findOwned('agents', req.params.id, req.agent.organization_id, 'id, role');
    if (alvo.role === 'owner') {
      return res.status(403).json({ error: 'O dono da conta não pode ser removido.' });
    }

    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
