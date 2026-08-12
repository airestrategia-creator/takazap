import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { findOwned } from '../lib/tenancy.js';

export function conversationsRouter(sessionManager, io) {
  const router = Router();

  // Lista conversas: inbox multiatendente com filtros de fila
  router.get('/', async (req, res, next) => {
    try {
      const { status, mine, unassigned } = req.query;
      let query = supabase
        .from('conversations')
        .select('*, contacts(*), agents:assigned_agent_id(*)')
        .eq('organization_id', req.agent.organization_id)
        .order('last_message_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (mine === 'true') query = query.eq('assigned_agent_id', req.agent.id);
      if (unassigned === 'true') query = query.is('assigned_agent_id', null);

      const { data, error } = await query;
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Abre (ou reaproveita) a conversa de um contato. Sem isto só era possível
  // responder quem escreveu primeiro: contato cadastrado à mão ou importado da
  // prospecção não tinha conversa, e portanto não existia no Inbox.
  router.post('/open', async (req, res, next) => {
    try {
      const { contactId } = req.body;
      const orgId = req.agent.organization_id;
      const contato = await findOwned('contacts', contactId, orgId);

      const { data: existente } = await supabase
        .from('conversations')
        .select('*, contacts(*), agents:assigned_agent_id(*)')
        .eq('organization_id', orgId)
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existente) return res.json(existente);

      // A conversa precisa de um número por onde falar. Preferimos o da
      // empresa do contato; sem isso, o único conectado.
      let sessionId = null;
      if (contato.company_id) {
        const { data: empresa } = await supabase
          .from('companies')
          .select('session_id')
          .eq('id', contato.company_id)
          .maybeSingle();
        sessionId = empresa?.session_id ?? null;
      }
      if (!sessionId) {
        const { data: sessao } = await supabase
          .from('whatsapp_sessions')
          .select('id')
          .eq('organization_id', orgId)
          .eq('status', 'connected')
          .limit(1)
          .maybeSingle();
        sessionId = sessao?.id ?? null;
      }
      if (!sessionId) {
        return res.status(409).json({
          error: 'Nenhum número do WhatsApp conectado. Conecte um em Dispositivos para iniciar conversas.',
        });
      }

      const { data: nova, error } = await supabase
        .from('conversations')
        .insert({
          organization_id: orgId,
          contact_id: contactId,
          session_id: sessionId,
          status: 'open',
          // Quem abre a conversa pela tela quer falar; deixar o bot ativo faria
          // o fluxo automático responder por cima do atendente.
          bot_active: false,
          assigned_agent_id: req.agent.id,
        })
        .select('*, contacts(*), agents:assigned_agent_id(*)')
        .single();
      if (error) throw error;

      res.status(201).json(nova);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/messages', async (req, res, next) => {
    try {
      // Sem esta checagem, qualquer usuário logado lia o histórico completo
      // de conversa de qualquer cliente, só passando o id na URL.
      await findOwned('conversations', req.params.id, req.agent.organization_id, 'id');
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', req.params.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Atendente assume a conversa (tira do bot, atribui a si mesmo)
  router.post('/:id/claim', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: req.agent.id, bot_active: false, status: 'open' })
        .eq('id', req.params.id)
        .eq('organization_id', req.agent.organization_id)
        .select('*')
        .single();
      if (error) throw error;
      io.to(`org:${req.agent.organization_id}`).emit('conversation:updated', data);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Transferir para outro atendente
  router.post('/:id/transfer', async (req, res, next) => {
    try {
      const { agentId } = req.body;
      // O agentId vem do cliente: sem validar, dava para "transferir" a
      // conversa para um atendente de outra organização.
      if (agentId) await findOwned('agents', agentId, req.agent.organization_id, 'id');
      const { data, error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('id', req.params.id)
        .eq('organization_id', req.agent.organization_id)
        .select('*')
        .single();
      if (error) throw error;
      io.to(`org:${req.agent.organization_id}`).emit('conversation:updated', data);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Devolver a conversa para o bot
  router.post('/:id/release-to-bot', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .update({ bot_active: true, assigned_agent_id: null })
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

  router.post('/:id/close', async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .update({ status: 'closed' })
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

  // Envia mensagem como atendente humano
  router.post('/:id/messages', async (req, res, next) => {
    try {
      const { text } = req.body;
      // Sem o filtro por organização, dava para enviar WhatsApp pela conversa
      // (e pelo número) de outro cliente.
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*, contacts(*)')
        .eq('id', req.params.id)
        .eq('organization_id', req.agent.organization_id)
        .maybeSingle();
      if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

      if (!text?.trim()) return res.status(400).json({ error: 'Escreva uma mensagem.' });

      const session = sessionManager.get(conversation.session_id);
      if (!session) {
        return res.status(409).json({
          error: 'O número do WhatsApp não está conectado. Vá em Dispositivos e reconecte.',
        });
      }

      // O erro do Baileys precisa chegar à tela com o motivo. Antes subia como
      // 500 "Erro interno", e o atendente ficava sem saber se a mensagem saiu.
      try {
        await session.sendText(conversation.contacts.whatsapp_jid, text);
      } catch (envioErr) {
        return res.status(502).json({
          error: `O WhatsApp recusou o envio: ${envioErr?.message || 'motivo desconhecido'}`,
        });
      }

      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          organization_id: req.agent.organization_id,
          conversation_id: conversation.id,
          direction: 'outbound',
          sender_type: 'agent',
          sender_agent_id: req.agent.id,
          content_type: 'text',
          content: text,
          status: 'sent',
        })
        .select('*')
        .single();
      if (error) throw error;

      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
      io.to(`org:${req.agent.organization_id}`).emit('message:new', message);
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/notes', async (req, res, next) => {
    try {
      const { note } = req.body;
      await findOwned('conversations', req.params.id, req.agent.organization_id, 'id');
      const { data, error } = await supabase
        .from('internal_notes')
        .insert({ conversation_id: req.params.id, agent_id: req.agent.id, note })
        .select('*')
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
