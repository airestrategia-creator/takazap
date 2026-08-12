import { supabase } from '../db/supabase.js';

/**
 * Worker de disparo em massa.
 *
 * Estratégia anti-bloqueio: envia UM contato por vez, com um delay
 * aleatório (min_delay_seconds..max_delay_seconds) entre cada envio,
 * simulando comportamento humano. Nunca envia em paralelo no mesmo
 * número de WhatsApp.
 *
 * `sessionManager` é passado pelo server.js para termos acesso à conexão
 * Baileys ativa da sessão usada pela campanha.
 */
export class CampaignWorker {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.runningCampaigns = new Set();
  }

  /** Chamado quando uma campanha é iniciada/retomada via API */
  async run(campaignId) {
    if (this.runningCampaigns.has(campaignId)) return;
    this.runningCampaigns.add(campaignId);

    try {
      await this.processCampaign(campaignId);
    } finally {
      this.runningCampaigns.delete(campaignId);
    }
  }

  async processCampaign(campaignId) {
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
    if (!campaign) return;

    await supabase.from('campaigns').update({ status: 'running' }).eq('id', campaignId);

    const session = this.sessionManager.get(campaign.session_id);
    if (!session) {
      await this.fail(campaignId, 'Sessão do WhatsApp não está conectada neste servidor.');
      return;
    }

    while (true) {
      // Recarrega o status a cada iteração para respeitar pausa/cancelamento pedidos pela UI
      const { data: current } = await supabase.from('campaigns').select('status').eq('id', campaignId).single();
      if (!current || current.status !== 'running') return;

      const { data: pending } = await supabase
        .from('campaign_messages')
        .select('*, contacts(*)')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (!pending) {
        await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaignId);
        return;
      }

      await this.sendOne(campaign, session, pending);

      const delayMs = randomDelayMs(campaign.min_delay_seconds, campaign.max_delay_seconds);
      await sleep(delayMs);
    }
  }

  async sendOne(campaign, session, campaignMessage) {
    const contact = campaignMessage.contacts;
    const text = campaign.message_template.replaceAll('{{nome}}', contact.name || '');

    try {
      await session.sendText(contact.whatsapp_jid, text);
      await supabase
        .from('campaign_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaignMessage.id);
    } catch (err) {
      await supabase
        .from('campaign_messages')
        .update({ status: 'failed', error: String(err.message || err) })
        .eq('id', campaignMessage.id);
    }
  }

  async fail(campaignId, reason) {
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaignId);
    console.error(`Campanha ${campaignId} pausada: ${reason}`);
  }
}

function randomDelayMs(minSeconds, maxSeconds) {
  const min = Math.max(3, minSeconds ?? 8);
  const max = Math.max(min, maxSeconds ?? 25);
  const seconds = min + Math.random() * (max - min);
  return Math.round(seconds * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Monta a fila `campaign_messages` a partir dos filtros de tag/estágio da campanha */
export async function buildCampaignAudience(campaign) {
  let query = supabase.from('contacts').select('id').eq('organization_id', campaign.organization_id);

  // A empresa é o filtro mais forte: quando a campanha é de uma unidade de
  // negócio, ela não pode alcançar a carteira das outras. Vem antes dos demais
  // porque é limite de escopo, não refinamento de público.
  if (campaign.company_id) {
    query = query.eq('company_id', campaign.company_id);
  }

  if (campaign.target_funnel_stage_ids?.length) {
    query = query.in('funnel_stage_id', campaign.target_funnel_stage_ids);
  }

  const { data: contacts } = await query;
  let targetContactIds = (contacts ?? []).map((c) => c.id);

  if (campaign.target_tag_ids?.length) {
    const { data: tagged } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', campaign.target_tag_ids);
    const taggedIds = new Set((tagged ?? []).map((t) => t.contact_id));
    targetContactIds = targetContactIds.filter((id) => taggedIds.has(id));
  }

  if (!targetContactIds.length) return 0;

  const rows = targetContactIds.map((contactId) => ({
    campaign_id: campaign.id,
    contact_id: contactId,
    status: 'pending',
  }));

  await supabase.from('campaign_messages').insert(rows);
  return rows.length;
}
