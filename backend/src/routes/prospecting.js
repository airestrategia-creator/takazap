import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import * as googlePlaces from '../services/googlePlaces.js';
import { requireRole } from '../middleware/auth.js';

export const prospectingRouter = Router();

prospectingRouter.get('/status', (req, res) => {
  res.json({ configured: googlePlaces.isConfigured() });
});

prospectingRouter.get('/searches', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prospecting_searches')
      .select('*')
      .eq('organization_id', req.agent.organization_id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const withCounts = await Promise.all(
      data.map(async (s) => {
        const { count } = await supabase
          .from('prospecting_leads')
          .select('*', { count: 'exact', head: true })
          .eq('search_id', s.id);
        return { ...s, lead_count: count ?? 0 };
      })
    );
    res.json(withCounts);
  } catch (err) {
    next(err);
  }
});

prospectingRouter.get('/searches/:id/leads', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prospecting_leads')
      .select('*')
      .eq('search_id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .order('rating', { ascending: false, nullsFirst: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Dispara a busca no Google Meu Negócio (via Google Places) a partir do ICP.
// `icpDescription` fica salvo como contexto/anotação; `searchQuery` é o termo
// objetivo usado de fato na busca (ex: "clínicas odontológicas em Pinheiros, SP").
prospectingRouter.post('/searches', requireRole('admin'), async (req, res, next) => {
  try {
    const { icpDescription, searchQuery, maxResults } = req.body;

    if (!searchQuery?.trim()) {
      return res.status(400).json({
        error: 'Informe um termo de busca objetivo (categoria + região), ex: "clínicas odontológicas em Pinheiros, SP".',
      });
    }

    if (!googlePlaces.isConfigured()) {
      return res.status(503).json({
        error: 'Busca do Google Meu Negócio não configurada. Peça para um admin configurar GOOGLE_PLACES_API_KEY no servidor.',
      });
    }

    const { data: search, error: insertError } = await supabase
      .from('prospecting_searches')
      .insert({
        organization_id: req.agent.organization_id,
        created_by_agent_id: req.agent.id,
        icp_description: icpDescription || searchQuery,
        search_query: searchQuery,
        status: 'running',
      })
      .select('*')
      .single();
    if (insertError) throw insertError;

    try {
      const places = await googlePlaces.searchPlaces(searchQuery, { maxResults: maxResults || 20 });

      if (places.length) {
        const rows = places.map((p) => ({
          search_id: search.id,
          organization_id: req.agent.organization_id,
          google_place_id: p.googlePlaceId,
          name: p.name,
          phone: p.phone,
          formatted_address: p.formattedAddress,
          website: p.website,
          rating: p.rating,
          user_ratings_total: p.userRatingsTotal,
          business_status: p.businessStatus,
        }));
        await supabase.from('prospecting_leads').upsert(rows, { onConflict: 'search_id,google_place_id' });
      }

      const { data: updated } = await supabase
        .from('prospecting_searches')
        .update({ status: 'completed' })
        .eq('id', search.id)
        .select('*')
        .single();

      res.status(201).json({ ...updated, lead_count: places.length });
    } catch (searchErr) {
      await supabase
        .from('prospecting_searches')
        .update({ status: 'failed', error: String(searchErr.message || searchErr) })
        .eq('id', search.id);
      throw searchErr;
    }
  } catch (err) {
    next(err);
  }
});

// Importa um lead encontrado como contato do CRM (pronto para entrar num
// fluxo de chatbot ou campanha de disparo).
prospectingRouter.post('/leads/:id/import', async (req, res, next) => {
  try {
    const { funnelStageId } = req.body;

    const { data: lead, error: leadError } = await supabase
      .from('prospecting_leads')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .single();
    if (leadError || !lead) return res.status(404).json({ error: 'Lead não encontrado' });

    if (!lead.phone) {
      return res.status(400).json({ error: 'Este estabelecimento não tem telefone público cadastrado no Google.' });
    }

    if (lead.imported_contact_id) {
      return res.json({ ok: true, alreadyImported: true, contactId: lead.imported_contact_id });
    }

    const jid = `${lead.phone}@s.whatsapp.net`;

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          organization_id: req.agent.organization_id,
          whatsapp_jid: jid,
          phone: lead.phone,
          name: lead.name,
          funnel_stage_id: funnelStageId || null,
        },
        { onConflict: 'organization_id,whatsapp_jid' }
      )
      .select('*')
      .single();
    if (contactError) throw contactError;

    // Marca/cria a tag "Prospecção" e aplica no contato
    let { data: tag } = await supabase
      .from('tags')
      .select('*')
      .eq('organization_id', req.agent.organization_id)
      .eq('name', 'Prospecção')
      .maybeSingle();
    if (!tag) {
      const { data: createdTag } = await supabase
        .from('tags')
        .insert({ organization_id: req.agent.organization_id, name: 'Prospecção', color: '#0ea5e9' })
        .select('*')
        .single();
      tag = createdTag;
    }
    await supabase.from('contact_tags').upsert({ contact_id: contact.id, tag_id: tag.id });

    await supabase.from('prospecting_leads').update({ imported_contact_id: contact.id }).eq('id', lead.id);

    res.status(201).json({ ok: true, contactId: contact.id });
  } catch (err) {
    next(err);
  }
});

// Importa todos os leads de uma busca que tenham telefone e ainda não foram importados
prospectingRouter.post('/searches/:id/import-all', requireRole('admin'), async (req, res, next) => {
  try {
    const { funnelStageId } = req.body;
    const { data: leads, error } = await supabase
      .from('prospecting_leads')
      .select('*')
      .eq('search_id', req.params.id)
      .eq('organization_id', req.agent.organization_id)
      .is('imported_contact_id', null)
      .not('phone', 'is', null);
    if (error) throw error;

    let { data: tag } = await supabase
      .from('tags')
      .select('*')
      .eq('organization_id', req.agent.organization_id)
      .eq('name', 'Prospecção')
      .maybeSingle();
    if (!tag) {
      const { data: createdTag } = await supabase
        .from('tags')
        .insert({ organization_id: req.agent.organization_id, name: 'Prospecção', color: '#0ea5e9' })
        .select('*')
        .single();
      tag = createdTag;
    }

    let imported = 0;
    for (const lead of leads) {
      const jid = `${lead.phone}@s.whatsapp.net`;
      const { data: contact } = await supabase
        .from('contacts')
        .upsert(
          {
            organization_id: req.agent.organization_id,
            whatsapp_jid: jid,
            phone: lead.phone,
            name: lead.name,
            funnel_stage_id: funnelStageId || null,
          },
          { onConflict: 'organization_id,whatsapp_jid' }
        )
        .select('*')
        .single();
      await supabase.from('contact_tags').upsert({ contact_id: contact.id, tag_id: tag.id });
      await supabase.from('prospecting_leads').update({ imported_contact_id: contact.id }).eq('id', lead.id);
      imported += 1;
    }

    res.json({ ok: true, imported });
  } catch (err) {
    next(err);
  }
});
