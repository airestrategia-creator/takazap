import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { requireRole } from '../middleware/auth.js';

export const flowsRouter = Router();

const EMPTY_DEFINITION = { nodes: [], edges: [] };

// Campos que o editor pode gravar. Fora daqui, ignoramos — evita que um JSON
// importado sobrescreva organization_id ou id.
function pickWritableFields(body) {
  const fields = {};
  if (body.name !== undefined) fields.name = body.name;
  if (body.trigger_type !== undefined) fields.trigger_type = body.trigger_type;
  if (body.trigger_keywords !== undefined) fields.trigger_keywords = body.trigger_keywords || [];
  if (body.definition !== undefined) fields.definition = body.definition || EMPTY_DEFINITION;
  if (body.is_active !== undefined) fields.is_active = body.is_active;
  if (body.device_scope !== undefined) fields.device_scope = body.device_scope;
  if (body.session_ids !== undefined) fields.session_ids = body.session_ids || [];
  return fields;
}

flowsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('chatbot_flows')
      .select('*')
      .eq('organization_id', req.agent.organization_id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Um fluxo com os contadores de execução por nó, que o canvas mostra.
flowsRouter.get('/:id', async (req, res, next) => {
  try {
    const { data: flow, error } = await supabase
      .from('chatbot_flows')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .single();
    if (error) throw error;

    const { data: stats } = await supabase
      .from('flow_node_stats')
      .select('*')
      .eq('flow_id', flow.id);

    res.json({
      flow,
      stats: Object.fromEntries((stats || []).map((s) => [s.node_id, s])),
    });
  } catch (err) {
    next(err);
  }
});

flowsRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const fields = pickWritableFields(req.body);
    const { data, error } = await supabase
      .from('chatbot_flows')
      .insert({
        organization_id: req.agent.organization_id,
        name: fields.name || 'Novo fluxo',
        trigger_type: fields.trigger_type || 'keyword',
        trigger_keywords: fields.trigger_keywords || [],
        definition: fields.definition || EMPTY_DEFINITION,
        device_scope: fields.device_scope || 'all',
        session_ids: fields.session_ids || [],
        is_active: fields.is_active ?? true,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

flowsRouter.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('chatbot_flows')
      .update({ ...pickWritableFields(req.body), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

flowsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('chatbot_flows')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Exclusão em lote, usada pela seleção múltipla da listagem.
flowsRouter.post('/bulk-delete', requireRole('admin'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'Nenhum fluxo selecionado' });

    const { error } = await supabase
      .from('chatbot_flows')
      .delete()
      .in('id', ids)
      .eq('organization_id', req.agent.organization_id);
    if (error) throw error;
    res.json({ ok: true, deleted: ids.length });
  } catch (err) {
    next(err);
  }
});

// Exporta fluxos como JSON portável (sem ids de org/sessão, que não fazem
// sentido em outra conta).
flowsRouter.post('/export', requireRole('admin'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    let query = supabase
      .from('chatbot_flows')
      .select('name, trigger_type, trigger_keywords, definition')
      .eq('organization_id', req.agent.organization_id);
    if (ids.length) query = query.in('id', ids);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ version: 1, exportedAt: new Date().toISOString(), flows: data });
  } catch (err) {
    next(err);
  }
});

flowsRouter.post('/import', requireRole('admin'), async (req, res, next) => {
  try {
    const payload = req.body;
    const flows = Array.isArray(payload?.flows)
      ? payload.flows
      : Array.isArray(payload)
        ? payload
        : [payload];

    const rows = flows
      .filter((f) => f && typeof f === 'object' && f.definition)
      .map((f) => ({
        organization_id: req.agent.organization_id,
        name: f.name || 'Fluxo importado',
        trigger_type: ['keyword', 'first_message', 'manual'].includes(f.trigger_type)
          ? f.trigger_type
          : 'keyword',
        trigger_keywords: Array.isArray(f.trigger_keywords) ? f.trigger_keywords : [],
        definition: f.definition,
        // Fluxo importado entra desativado: quem importou revisa antes de pôr
        // no ar, senão passa a responder clientes sem ninguém conferir.
        is_active: false,
        device_scope: 'all',
        session_ids: [],
      }));

    if (!rows.length) {
      return res.status(400).json({ error: 'Nenhum fluxo válido no arquivo.' });
    }

    const { data, error } = await supabase.from('chatbot_flows').insert(rows).select('*');
    if (error) throw error;

    res.status(201).json({ imported: data.length, flows: data });
  } catch (err) {
    next(err);
  }
});
