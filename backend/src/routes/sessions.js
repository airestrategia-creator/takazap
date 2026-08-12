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
      const { data: existentes } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at');

      const total = existentes?.length ?? 0;

      // Já no limite: em vez de recusar, reaproveita a sessão que existe e
      // reconecta. Quem clica em "Conectar número" com o dispositivo caído
      // quer voltar a conectar — não quer um erro de cota, e criar uma linha
      // nova só encheria a lista de sessões mortas.
      if (total >= limits.devices) {
        const alvo = existentes[0];
        await sessionManager.reconnect(alvo.id, organizationId);
        const { data: atualizada } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('id', alvo.id)
          .single();
        return res.json(atualizada ?? alvo);
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
      // force: derruba o socket morto antes de subir outro. Sem isso, o
      // gerenciador via a sessão no mapa e devolvia ela mesma sem reconectar —
      // o botão existia mas não fazia nada.
      await sessionManager.reconnect(req.params.id, req.agent.organization_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Desconecta o número e apaga as credenciais, para que a próxima conexão
  // gere um QR novo. É o caminho para trocar de número sem apagar a sessão.
  router.post('/:id/logout', requireRole('admin'), async (req, res, next) => {
    try {
      await findOwned('whatsapp_sessions', req.params.id, req.agent.organization_id, 'id');
      const sessao = sessionManager.get(req.params.id);
      if (sessao) {
        await sessao.derrubar();
        await sessao.limparCredenciais();
      }
      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'disconnected', qr_code: null, phone_number: null })
        .eq('id', req.params.id);
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
