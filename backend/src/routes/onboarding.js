import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { TRIAL_DAYS } from '../lib/plans.js';

export const onboardingRouter = Router();

// Organizações a que o usuário logado pertence. O painel usa isso para montar
// o seletor de org e para saber para onde redirecionar depois do login.
onboardingRouter.get('/me/organizations', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('id, role, organization_id, organizations(id, name)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json(
      (data || [])
        .filter((a) => a.organizations)
        .map((a) => ({
          id: a.organizations.id,
          name: a.organizations.name,
          role: a.role,
          agentId: a.id,
        })),
    );
  } catch (err) {
    next(err);
  }
});

// Cria a organização do usuário recém-cadastrado, com trial de 3 dias.
// Idempotente por usuário: se ele já é dono de alguma org, devolve a existente
// em vez de criar outra (evita org duplicada em duplo clique no cadastro).
onboardingRouter.post('/bootstrap', async (req, res, next) => {
  try {
    const { organizationName, name } = req.body;
    if (!organizationName?.trim()) {
      return res.status(400).json({ error: 'Informe o nome da organização' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('agents')
      .select('organization_id, organizations(id, name)')
      .eq('user_id', req.user.id)
      .eq('role', 'owner')
      .limit(1);
    if (existingError) throw existingError;

    if (existing?.[0]?.organizations) {
      return res.json({
        organization: existing[0].organizations,
        alreadyExisted: true,
      });
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: organizationName.trim(), owner_user_id: req.user.id })
      .select('id, name')
      .single();
    if (orgError) throw orgError;

    // A partir daqui, qualquer falha deixaria uma org órfã — por isso o
    // rollback manual (o Supabase JS não expõe transação).
    try {
      const { error: agentError } = await supabase.from('agents').insert({
        user_id: req.user.id,
        organization_id: org.id,
        name: (name || req.user.email || 'Você').trim(),
        email: req.user.email,
        role: 'owner',
      });
      if (agentError) throw agentError;

      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const { error: subError } = await supabase.from('subscriptions').insert({
        organization_id: org.id,
        plan_id: 'trial',
        status: 'trialing',
        trial_ends_at: trialEndsAt.toISOString(),
      });
      if (subError) throw subError;

      // Funil inicial, para o Kanban não abrir vazio
      const { error: stagesError } = await supabase.from('funnel_stages').insert(
        ['Novo', 'Em atendimento', 'Negociação', 'Ganho', 'Perdido'].map((n, i) => ({
          organization_id: org.id,
          name: n,
          position: i,
        })),
      );
      if (stagesError) throw stagesError;
    } catch (err) {
      await supabase.from('organizations').delete().eq('id', org.id);
      throw err;
    }

    res.status(201).json({ organization: org, alreadyExisted: false });
  } catch (err) {
    next(err);
  }
});
