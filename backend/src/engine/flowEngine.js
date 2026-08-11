import { supabase } from '../db/supabase.js';
import { config } from '../config.js';
import { assertPublicUrl } from '../lib/safeFetch.js';

/**
 * Motor de fluxo de chatbot.
 *
 * Um flow (tabela chatbot_flows) é um grafo salvo em `definition`:
 *   { nodes: [{ id, type, data }], edges: [{ from, to, condition? }] }
 *
 * Tipos de nó suportados:
 *  - "message": envia um texto
 *  - "condition": avalia a última resposta do contato contra `data.branches`
 *                 e segue a aresta cujo `condition` bate, ou a aresta sem
 *                 condition (default) se nenhuma bater
 *  - "add_tag": adiciona uma tag ao contato (data.tagName)
 *  - "set_stage": move o contato para um estágio do funil (data.stageName)
 *  - "handoff": desativa o bot na conversa e marca para atendimento humano
 *  - "wait_reply": pausa e espera a próxima mensagem do contato, guardando-a
 *                  em `data.saveAs` (padrão: "resposta")
 *  - "delay": espera `data.seconds` antes de seguir
 *  - "http": chama uma API JSON e guarda o retorno em `data.saveAs`
 *  - "end": encerra o fluxo
 *
 * Cada nó "message" pausa a execução esperando a próxima mensagem do
 * contato (waiting_for_reply=true) antes de seguir para o próximo nó,
 * a menos que `data.waitForReply === false`.
 *
 * O campo `position` de cada nó é usado só pelo editor visual — o motor
 * ignora.
 */

// Teto de espera de um nó "delay". Acima disso o fluxo travaria a conexão do
// WhatsApp; melhor seguir adiante e registrar alerta.
const MAX_DELAY_SECONDS = 60;
const HTTP_TIMEOUT_MS = 10_000;

export async function handleIncomingMessage({ sessionId, jid, pushName, text, whatsappMessageId, sendReply }) {
  const session = await getSession(sessionId);
  if (!session) return;

  const contact = await upsertContact(session.organization_id, jid, pushName);
  const conversation = await getOrCreateConversation(session, contact);

  await insertMessage({
    organizationId: session.organization_id,
    conversationId: conversation.id,
    direction: 'inbound',
    senderType: 'contact',
    contentType: 'text',
    content: text,
    whatsappMessageId,
    status: 'delivered',
  });

  await supabase
    .from('contacts')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', contact.id);

  // Se um humano assumiu a conversa, o bot fica quieto.
  if (!conversation.bot_active) return;

  if (conversation.active_flow_id && conversation.waiting_for_reply) {
    await resumeFlow({ conversation, contact, session, incomingText: text, sendReply });
    return;
  }

  const flow = await findTriggeredFlow(
    session.organization_id,
    text,
    !conversation.active_flow_id,
    session.id,
  );
  if (flow) {
    await supabase
      .from('conversations')
      .update({ active_flow_id: flow.id, active_node_id: null, waiting_for_reply: false })
      .eq('id', conversation.id);
    await runFlowFrom({ flow, conversation, contact, session, fromNodeId: null, sendReply });
  }
}

async function findTriggeredFlow(organizationId, text, isFirstMessage, sessionId) {
  const { data: allFlows } = await supabase
    .from('chatbot_flows')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (!allFlows?.length) return null;

  // Um fluxo pode valer para todos os dispositivos da organização ou só para
  // os números escolhidos no editor.
  const flows = allFlows.filter(
    (f) => f.device_scope !== 'selected' || (f.session_ids || []).includes(sessionId),
  );
  if (!flows.length) return null;

  const lower = text.trim().toLowerCase();

  const keywordMatch = flows.find((f) =>
    f.trigger_type === 'keyword' &&
    (f.trigger_keywords || []).some((k) => lower.includes(k.toLowerCase()))
  );
  if (keywordMatch) return keywordMatch;

  if (isFirstMessage) {
    return flows.find((f) => f.trigger_type === 'first_message') ?? null;
  }
  return null;
}

async function runFlowFrom({ flow, conversation, contact, session, fromNodeId, sendReply }) {
  const { nodes, edges } = flow.definition ?? { nodes: [], edges: [] };
  let currentNodeId = fromNodeId ?? findStartNodeId(nodes, edges);
  let variables = { ...(conversation.flow_variables ?? {}) };

  // Evita loop infinito em fluxos mal configurados
  let safety = 0;

  while (currentNodeId && safety < 50) {
    safety += 1;
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    let result;
    try {
      result = await executeNode({ node, conversation, contact, session, sendReply, variables });
      await recordNodeRun(flow.id, node.id, result.warn ? 'warn' : 'ok');
    } catch (err) {
      console.error(`Fluxo ${flow.id}, nó ${node.id} falhou:`, err.message);
      await recordNodeRun(flow.id, node.id, 'error');
      // Um nó quebrado não pode deixar a conversa presa no bot para sempre.
      result = { stop: true };
    }

    if (result.variables) {
      variables = { ...variables, ...result.variables };
      await supabase
        .from('conversations')
        .update({ flow_variables: variables })
        .eq('id', conversation.id);
    }

    if (result.pause) {
      await supabase
        .from('conversations')
        .update({ active_node_id: currentNodeId, waiting_for_reply: true })
        .eq('id', conversation.id);
      return;
    }

    if (result.stop) {
      await supabase
        .from('conversations')
        .update({ active_flow_id: null, active_node_id: null, waiting_for_reply: false })
        .eq('id', conversation.id);
      return;
    }

    currentNodeId = nextNodeId(edges, currentNodeId, result.branch);
  }

  // Fluxo terminou naturalmente (sem nó "end" explícito)
  await supabase
    .from('conversations')
    .update({ active_flow_id: null, active_node_id: null, waiting_for_reply: false })
    .eq('id', conversation.id);
}

async function resumeFlow({ conversation, contact, session, incomingText, sendReply }) {
  const { data: flow } = await supabase
    .from('chatbot_flows')
    .select('*')
    .eq('id', conversation.active_flow_id)
    .single();
  if (!flow) return;

  const { edges } = flow.definition ?? { nodes: [], edges: [] };
  const node = (flow.definition?.nodes ?? []).find((n) => n.id === conversation.active_node_id);

  let branch = null;
  if (node?.type === 'condition') {
    branch = matchCondition(node.data, incomingText);
  }

  // A resposta do contato fica disponível para os nós seguintes como
  // {{resposta}} (ou o nome definido em `saveAs`).
  const variables = {
    ...(conversation.flow_variables ?? {}),
    [node?.data?.saveAs || 'resposta']: incomingText,
  };

  const nextId = nextNodeId(edges, conversation.active_node_id, branch);
  await supabase
    .from('conversations')
    .update({ waiting_for_reply: false, flow_variables: variables })
    .eq('id', conversation.id);

  await runFlowFrom({
    flow,
    conversation: { ...conversation, active_node_id: nextId, flow_variables: variables },
    contact,
    session,
    fromNodeId: nextId,
    sendReply,
  });
}

async function executeNode({ node, conversation, contact, session, sendReply, variables }) {
  switch (node.type) {
    case 'message': {
      const text = renderTemplate(node.data?.text ?? '', { contact, variables });
      await sendReply(text);
      await insertMessage({
        organizationId: session.organization_id,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'bot',
        contentType: 'text',
        content: text,
        status: 'sent',
      });
      return { pause: node.data?.waitForReply !== false };
    }

    case 'add_tag': {
      await addTagToContact(session.organization_id, contact.id, node.data?.tagName);
      return {};
    }

    case 'set_stage': {
      await setContactStage(session.organization_id, contact.id, node.data?.stageName);
      return {};
    }

    case 'handoff': {
      await supabase
        .from('conversations')
        .update({ bot_active: false, status: 'pending' })
        .eq('id', conversation.id);
      if (node.data?.text) {
        await sendReply(renderTemplate(node.data.text, { contact, variables }));
      }
      return { stop: true };
    }

    case 'condition':
      // Nó de condição só é resolvido em resumeFlow (depende da resposta do contato)
      return { pause: true };

    case 'wait_reply':
      // Pausa sem enviar nada; a resposta é guardada em resumeFlow.
      return { pause: true };

    case 'delay': {
      const seconds = Number(node.data?.seconds ?? 0);
      if (!Number.isFinite(seconds) || seconds <= 0) return {};
      const capped = Math.min(seconds, MAX_DELAY_SECONDS);
      await new Promise((resolve) => setTimeout(resolve, capped * 1000));
      return { warn: capped < seconds };
    }

    case 'http': {
      const { url, method = 'GET', headers, body, saveAs = 'http' } = node.data ?? {};
      if (!url) return { warn: true };

      // A URL é escrita pelo cliente no editor. Sem esta checagem ele poderia
      // apontar para os metadados da nuvem ou para a rede interna (SSRF).
      const targetUrl = renderTemplate(url, { contact, variables });
      await assertPublicUrl(targetUrl);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      try {
        const response = await fetch(targetUrl, {
          method,
          headers: { 'content-type': 'application/json', ...(headers || {}) },
          body:
            method === 'GET' || method === 'HEAD'
              ? undefined
              : renderTemplate(
                  typeof body === 'string' ? body : JSON.stringify(body ?? {}),
                  { contact, variables },
                ),
          signal: controller.signal,
        });

        const raw = await response.text();
        let parsed = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // resposta não-JSON fica como texto puro
        }

        return {
          variables: { [saveAs]: parsed, [`${saveAs}_status`]: response.status },
          warn: !response.ok,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    case 'end':
    default:
      return { stop: true };
  }
}

// Contadores exibidos no canvas do editor. Falha aqui não pode derrubar o
// fluxo — é telemetria.
async function recordNodeRun(flowId, nodeId, outcome) {
  try {
    await supabase.rpc('increment_flow_node_stat', {
      p_flow_id: flowId,
      p_node_id: nodeId,
      p_outcome: outcome,
    });
  } catch (err) {
    console.error('Falha ao registrar telemetria do nó:', err.message);
  }
}

function matchCondition(data, incomingText) {
  const lower = incomingText.trim().toLowerCase();
  const options = data?.branches ?? []; // [{ label, equalsAny: [] }]
  const hit = options.find((opt) => (opt.equalsAny || []).some((w) => lower.includes(w.toLowerCase())));
  return hit?.label ?? null;
}

function nextNodeId(edges, fromId, branch) {
  const candidates = (edges ?? []).filter((e) => e.from === fromId);
  if (branch) {
    const specific = candidates.find((e) => e.condition === branch);
    if (specific) return specific.to;
  }
  const fallback = candidates.find((e) => !e.condition);
  return fallback?.to ?? null;
}

function findStartNodeId(nodes, edges) {
  const targets = new Set((edges ?? []).map((e) => e.to));
  const start = (nodes ?? []).find((n) => !targets.has(n.id));
  return start?.id ?? nodes?.[0]?.id ?? null;
}

function renderTemplate(text, { contact, variables }) {
  if (typeof text !== 'string') return text;

  return text
    .replaceAll('{{nome}}', contact?.name || 'tudo bem')
    .replaceAll('{{name}}', contact?.name || '')
    .replaceAll('{{telefone}}', contact?.phone || '')
    // Qualquer outra {{chave}} vem das variáveis coletadas no fluxo.
    // Suporta caminho com ponto: {{http.data.nome}}
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const value = path
        .split('.')
        .reduce((acc, key) => (acc == null ? undefined : acc[key]), variables);
      if (value === undefined || value === null) return match;
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
}

// ---------- Helpers de dados ----------

async function getSession(sessionId) {
  const { data } = await supabase.from('whatsapp_sessions').select('*').eq('id', sessionId).single();
  return data;
}

async function upsertContact(organizationId, jid, pushName) {
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('whatsapp_jid', jid)
    .maybeSingle();

  if (existing) return existing;

  const phone = jid.split('@')[0];
  const { data: created } = await supabase
    .from('contacts')
    .insert({
      organization_id: organizationId,
      whatsapp_jid: jid,
      phone,
      name: pushName || phone,
    })
    .select('*')
    .single();
  return created;
}

async function getOrCreateConversation(session, contact) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('session_id', session.id)
    .neq('status', 'closed')
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from('conversations')
    .insert({
      organization_id: session.organization_id,
      contact_id: contact.id,
      session_id: session.id,
      status: 'open',
      bot_active: true,
    })
    .select('*')
    .single();
  return created;
}

async function insertMessage(fields) {
  await supabase.from('messages').insert({
    organization_id: fields.organizationId,
    conversation_id: fields.conversationId,
    direction: fields.direction,
    sender_type: fields.senderType,
    sender_agent_id: fields.senderAgentId ?? null,
    content_type: fields.contentType,
    content: fields.content,
    whatsapp_message_id: fields.whatsappMessageId ?? null,
    status: fields.status,
  });
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', fields.conversationId);
}

async function addTagToContact(organizationId, contactId, tagName) {
  if (!tagName) return;
  let { data: tag } = await supabase
    .from('tags')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('name', tagName)
    .maybeSingle();

  if (!tag) {
    const { data: created } = await supabase
      .from('tags')
      .insert({ organization_id: organizationId, name: tagName })
      .select('*')
      .single();
    tag = created;
  }

  await supabase.from('contact_tags').upsert({ contact_id: contactId, tag_id: tag.id });
}

async function setContactStage(organizationId, contactId, stageName) {
  if (!stageName) return;
  const { data: stage } = await supabase
    .from('funnel_stages')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('name', stageName)
    .maybeSingle();

  if (stage) {
    await supabase.from('contacts').update({ funnel_stage_id: stage.id }).eq('id', contactId);
  }
}

export const _internal = { config };
