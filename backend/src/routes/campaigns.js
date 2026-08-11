import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { buildCampaignAudience } from '../jobs/campaignWorker.js';
import { findOwned, assertOwned } from '../lib/tenancy.js';
import { requireRole } from '../middleware/auth.js';

export function campaignsRouter(campaignWorker) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', req.agent.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const withCounts = await Promise.all(
        data.map(async (c) => {
          const { count: total } = await supabase
            .from('campaign_messages')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', c.id);
          const { count: sent } = await supabase
            .from('campaign_messages')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', c.id)
            .eq('status', 'sent');
          return { ...c, total_contacts: total ?? 0, sent_count: sent ?? 0 };
        })
      );
      res.json(withCounts);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireRole('admin'), async (req, res, next) => {
    try {
      // Campanha é só texto: mídia não faz parte do produto.
      const {
        name, session_id, message_template,
        target_tag_ids, target_funnel_stage_ids,
        min_delay_seconds, max_delay_seconds,
      } = req.body;

      // O session_id vem do cliente. Sem validar, dava para disparar campanha
      // pelo número de WhatsApp de OUTRA organização.
      await assertOwned('whatsapp_sessions', session_id, req.agent.organization_id);

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          organization_id: req.agent.organization_id,
          session_id,
          name,
          message_template,
          target_tag_ids: target_tag_ids || [],
          target_funnel_stage_ids: target_funnel_stage_ids || [],
          min_delay_seconds: min_delay_seconds || 8,
          max_delay_seconds: max_delay_seconds || 25,
          status: 'draft',
        })
        .select('*')
        .single();
      if (error) throw error;

      const audienceSize = await buildCampaignAudience(campaign);
      res.status(201).json({ ...campaign, audience_size: audienceSize });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/start', requireRole('admin'), async (req, res, next) => {
    try {
      // Sem o findOwned, qualquer usuário logado disparava a campanha de
      // qualquer cliente só chutando o id na URL.
      await findOwned('campaigns', req.params.id, req.agent.organization_id, 'id');
      await supabase
        .from('campaigns')
        .update({ status: 'running' })
        .eq('id', req.params.id)
        .eq('organization_id', req.agent.organization_id);
      campaignWorker.run(req.params.id); // roda em background, não bloqueia a resposta HTTP
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/pause', requireRole('admin'), async (req, res, next) => {
    try {
      await findOwned('campaigns', req.params.id, req.agent.organization_id, 'id');
      await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', req.params.id)
        .eq('organization_id', req.agent.organization_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/messages', async (req, res, next) => {
    try {
      // Esta rota devolve nome e telefone dos contatos: sem a checagem de
      // dono, era vazamento direto da base de outro cliente.
      await findOwned('campaigns', req.params.id, req.agent.organization_id, 'id');
      const { data, error } = await supabase
        .from('campaign_messages')
        .select('*, contacts(name, phone)')
        .eq('campaign_id', req.params.id);
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
