import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { findOwned } from '../lib/tenancy.js';
import { requireRole } from '../middleware/auth.js';
import { effectiveLimits } from '../lib/plans.js';

export function sessionsRouter(sessionManager) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('organization_id', req.agent.organization_id);
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireRole('admin'), async (req, res, next) => {
    try {
      const { label } = req.body;
      const organizationId = req.agent.organization_id;

      // Sem isso, qualquer conta no plano de 1 dispositivo poderia conectar
      // quantos números quisesse — é furo de cobrança, não só de produto.
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      const limits = effectiveLimits(subscription ?? {});
      const { count } = await supabase
        .from('whatsapp_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if ((count ?? 0) >= limits.devices) {
        return res.status(402).json({
          error: `Seu plano permite ${limits.devices} dispositivo(s). Adicione um dispositivo extra em Assinatura para conectar outro número.`,
          code: 'DEVICE_LIMIT',
        });
      }

      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          organization_id: organizationId,
          label: label || 'Principal',
          status: 'connecting',
          created_by: req.agent.id,
        })
        .select('*')
        .single();
      if (error) throw error;

      await sessionManager.startSession(data.id, organizationId);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/reconnect', requireRole('admin'), async (req, res, next) => {
    try {
      // findOwned impede reconectar (ou sequestrar) a sessão de outra conta.
      await findOwned('whatsapp_sessions', req.params.id, req.agent.organization_id, 'id');
      await sessionManager.startSession(req.params.id, req.agent.organization_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res, next) => {
    try {
      // Sem esta checagem, qualquer usuário logado derrubava o WhatsApp de
      // qualquer cliente passando o id da sessão na URL.
      await findOwned('whatsapp_sessions', req.params.id, req.agent.organization_id, 'id');
      await sessionManager.stopSession(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
