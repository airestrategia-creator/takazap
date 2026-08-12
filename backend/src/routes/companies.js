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

// A logo trafega como data URI no corpo do request. O Express está limitado a
// 5MB, mas um ícone não precisa disso — cortamos aqui para uma imagem grande
// não inchar a resposta de /companies, que é carregada em várias telas.
const LIMITE_LOGO = 200 * 1024;

function validarLogo(logo) {
  if (logo === null || logo === undefined || logo === '') return null;
  if (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(logo)) {
    const erro = new Error('A logo precisa ser uma imagem PNG, JPG, WEBP ou SVG.');
    erro.status = 400;
    throw erro;
  }
  if (logo.length > LIMITE_LOGO) {
    const erro = new Error('A logo é muito pesada. Use uma imagem de até 150 KB.');
    erro.status = 400;
    throw erro;
  }
  return logo;
}

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
        logo_url: validarLogo(req.body.logo_url),
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
    if ('logo_url' in req.body) campos.logo_url = validarLogo(req.body.logo_url);

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
