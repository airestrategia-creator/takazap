import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { findOwned, assertOwned } from '../lib/tenancy.js';

export const contactsRouter = Router();

contactsRouter.get('/', async (req, res, next) => {
  try {
    const { stage, tag, search } = req.query;
    let query = supabase
      .from('contacts')
      .select('*, contact_tags(tag_id, tags(*)), funnel_stages(*)')
      .eq('organization_id', req.agent.organization_id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (stage) query = query.eq('funnel_stage_id', stage);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = tag
      ? data.filter((c) => c.contact_tags.some((t) => t.tag_id === tag))
      : data;

    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

contactsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, funnel_stage_id, assigned_agent_id } = req.body;
    const orgId = req.agent.organization_id;

    // funnel_stage_id e assigned_agent_id vêm do cliente. Sem validar, dava
    // para apontar o contato para uma etapa ou atendente de OUTRA organização.
    if (funnel_stage_id) await assertOwned('funnel_stages', funnel_stage_id, orgId);
    if (assigned_agent_id) await assertOwned('agents', assigned_agent_id, orgId);

    const { data, error } = await supabase
      .from('contacts')
      .update({ name, funnel_stage_id, assigned_agent_id })
      .eq('id', req.params.id)
      .eq('organization_id', orgId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/:id/tags', async (req, res, next) => {
  try {
    const { tagId } = req.body;
    const orgId = req.agent.organization_id;
    // Sem estas duas checagens, dava para marcar o contato de outra conta, ou
    // colar no meu contato uma tag que pertence a outra organização.
    await findOwned('contacts', req.params.id, orgId, 'id');
    await findOwned('tags', tagId, orgId, 'id');

    const { error } = await supabase
      .from('contact_tags')
      .upsert({ contact_id: req.params.id, tag_id: tagId });
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

contactsRouter.delete('/:id/tags/:tagId', async (req, res, next) => {
  try {
    await findOwned('contacts', req.params.id, req.agent.organization_id, 'id');
    const { error } = await supabase
      .from('contact_tags')
      .delete()
      .eq('contact_id', req.params.id)
      .eq('tag_id', req.params.tagId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Tags e estágios do funil (CRM) ----

export const tagsRouter = Router();

tagsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('tags').select('*').eq('organization_id', req.agent.organization_id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

tagsRouter.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const { data, error } = await supabase
      .from('tags')
      .insert({ organization_id: req.agent.organization_id, name, color })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

export const funnelStagesRouter = Router();

funnelStagesRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('funnel_stages')
      .select('*')
      .eq('organization_id', req.agent.organization_id)
      .order('position');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

funnelStagesRouter.post('/', async (req, res, next) => {
  try {
    const { name, position, color } = req.body;
    const { data, error } = await supabase
      .from('funnel_stages')
      .insert({ organization_id: req.agent.organization_id, name, position, color })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});
