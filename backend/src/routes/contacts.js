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

// Cadastro manual de contato. Sem isto, só entra no CRM quem mandou mensagem
// primeiro — o lead que veio por indicação ou de uma lista ficava de fora.
contactsRouter.post('/', async (req, res, next) => {
  try {
    const { name, phone, funnel_stage_id, assigned_agent_id, deal_value } = req.body;
    const orgId = req.agent.organization_id;

    const somenteDigitos = String(phone || '').replace(/\D/g, '');
    if (somenteDigitos.length < 10) {
      return res.status(400).json({ error: 'Informe um telefone com DDD.' });
    }

    if (funnel_stage_id) await assertOwned('funnel_stages', funnel_stage_id, orgId);
    if (assigned_agent_id) await assertOwned('agents', assigned_agent_id, orgId);

    // O jid é a identidade do contato no WhatsApp e é único por organização.
    // Montamos aqui para o contato criado à mão já casar com a conversa que
    // chegar depois, em vez de virar um registro duplicado.
    const jid = `${somenteDigitos}@s.whatsapp.net`;

    const { data: existente } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('whatsapp_jid', jid)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ error: 'Já existe um contato com esse telefone.' });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,
        whatsapp_jid: jid,
        phone: somenteDigitos,
        name: name?.trim() || null,
        funnel_stage_id: funnel_stage_id || null,
        assigned_agent_id: assigned_agent_id || null,
        deal_value: deal_value ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

contactsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, funnel_stage_id, assigned_agent_id, deal_value, lost_reason } = req.body;
    const orgId = req.agent.organization_id;

    // funnel_stage_id e assigned_agent_id vêm do cliente. Sem validar, dava
    // para apontar o contato para uma etapa ou atendente de OUTRA organização.
    if (funnel_stage_id) await assertOwned('funnel_stages', funnel_stage_id, orgId);
    if (assigned_agent_id) await assertOwned('agents', assigned_agent_id, orgId);

    // Só mexe no que veio no corpo: mandar a coluna inteira apagaria o valor
    // do negócio toda vez que o Kanban salvasse apenas a mudança de etapa.
    const campos = {};
    if ('name' in req.body) campos.name = name;
    if ('funnel_stage_id' in req.body) campos.funnel_stage_id = funnel_stage_id;
    if ('assigned_agent_id' in req.body) campos.assigned_agent_id = assigned_agent_id;
    if ('deal_value' in req.body) campos.deal_value = deal_value;
    if ('lost_reason' in req.body) campos.lost_reason = lost_reason;

    const { data, error } = await supabase
      .from('contacts')
      .update(campos)
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

// Renomear, recolorir ou reordenar. Antes, uma etapa criada com nome errado
// ficava no quadro para sempre.
funnelStagesRouter.patch('/:id', async (req, res, next) => {
  try {
    const orgId = req.agent.organization_id;
    await findOwned('funnel_stages', req.params.id, orgId, 'id');

    const campos = {};
    if ('name' in req.body) campos.name = req.body.name;
    if ('position' in req.body) campos.position = req.body.position;
    if ('color' in req.body) campos.color = req.body.color;

    const { data, error } = await supabase
      .from('funnel_stages')
      .update(campos)
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

funnelStagesRouter.delete('/:id', async (req, res, next) => {
  try {
    const orgId = req.agent.organization_id;
    await findOwned('funnel_stages', req.params.id, orgId, 'id');

    // Os contatos daquela coluna voltam para "Sem estágio" em vez de sumirem
    // junto. Apagar a etapa não pode significar perder o lead.
    const { error: soltarErro } = await supabase
      .from('contacts')
      .update({ funnel_stage_id: null })
      .eq('funnel_stage_id', req.params.id)
      .eq('organization_id', orgId);
    if (soltarErro) throw soltarErro;

    const { error } = await supabase
      .from('funnel_stages')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', orgId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
