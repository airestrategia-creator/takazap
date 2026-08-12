import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { findOwned, assertOwned } from '../lib/tenancy.js';

/**
 * Empresas = unidades de negócio dentro da organização.
 *
 * A organização é a conta que paga; as empresas são as operações que ela
 * toca (ex: ITA Frotas, ITA Mob, Fleeter). Contatos, campanhas e prospecções
 * pertencem a uma empresa, e é isso que permite disparar campanha para o
 * público de uma sem atingir o das outras.
 */
export const companiesRouter = Router();

companiesRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*, whatsapp_sessions:session_id(id, label, phone_number, status)')
      .eq('organization_id', req.agent.organization_id)
      .order('name');
    if (error) throw error;

    // Quantos contatos cada empresa tem — o painel precisa disso para mostrar
    // o tamanho da carteira sem uma segunda chamada.
    const { data: contagem } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('organization_id', req.agent.organization_id);

    const porEmpresa = (contagem || []).reduce((acc, c) => {
      if (c.company_id) acc[c.company_id] = (acc[c.company_id] || 0) + 1;
      return acc;
    }, {});

    res.json((data || []).map((e) => ({ ...e, contacts_count: porEmpresa[e.id] || 0 })));
  } catch (err) {
    next(err);
  }
});

companiesRouter.post('/', async (req, res, next) => {
  try {
    const { name, color, document, session_id } = req.body;
    const orgId = req.agent.organization_id;
    if (!name?.trim()) return res.status(400).json({ error: 'Informe o nome da empresa.' });

    // O número precisa ser da própria organização — senão dava para amarrar a
    // empresa ao WhatsApp de outra conta.
    if (session_id) await assertOwned('whatsapp_sessions', session_id, orgId);

    const { data, error } = await supabase
      .from('companies')
      .insert({
        organization_id: orgId,
        name: name.trim(),
        color: color || '#6366f1',
        document: document?.trim() || null,
        session_id: session_id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

companiesRouter.patch('/:id', async (req, res, next) => {
  try {
    const orgId = req.agent.organization_id;
    await findOwned('companies', req.params.id, orgId, 'id');
    if (req.body.session_id) await assertOwned('whatsapp_sessions', req.body.session_id, orgId);

    const campos = {};
    for (const campo of ['name', 'color', 'document', 'session_id']) {
      if (campo in req.body) campos[campo] = req.body[campo] || null;
    }

    const { data, error } = await supabase
      .from('companies')
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

companiesRouter.delete('/:id', async (req, res, next) => {
  try {
    const orgId = req.agent.organization_id;
    await findOwned('companies', req.params.id, orgId, 'id');

    // Os contatos ficam, apenas sem empresa. Excluir uma unidade de negócio
    // não pode apagar a carteira de clientes junto.
    await supabase
      .from('contacts')
      .update({ company_id: null })
      .eq('company_id', req.params.id)
      .eq('organization_id', orgId);

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', orgId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
