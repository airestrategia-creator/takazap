import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import pino from 'pino';
// Importe sempre por nome. O `default` do Baileys é a própria função
// makeWASocket — desestruturar os outros helpers dele devolve undefined.
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { handleIncomingMessage } from '../engine/flowEngine.js';

const logger = pino({ level: 'warn' });

/**
 * Gerencia UMA conexão de WhatsApp (uma "sessão") via QR code (WhatsApp Web).
 * Cada organização pode ter uma ou mais sessões (números conectados).
 * O estado de autenticação fica salvo em disco (multi-file auth state) para
 * não precisar escanear o QR de novo a cada restart.
 */
export class WhatsAppSession {
  constructor(sessionId, io, organizationId = null) {
    this.sessionId = sessionId;
    this.io = io;
    this.organizationId = organizationId;
    this.sock = null;
    this.authDir = path.join(config.whatsappAuthDir, sessionId);
    this.restarting = false;
  }

  // O painel entra na sala da organização assim que abre, mas só descobre o id
  // da sessão depois de criá-la. Emitir nas duas salas garante que ele receba
  // o QR mesmo tendo entrado antes da sessão existir.
  emit(event, payload) {
    const body = { sessionId: this.sessionId, ...payload };
    this.io.to(`session:${this.sessionId}`).emit(event, body);
    if (this.organizationId) this.io.to(`org:${this.organizationId}`).emit(event, body);
  }

  async start() {
    fs.mkdirSync(this.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['TakaZap', 'Chrome', '1.0.0'],

      // A conexão caía com timeout de 408 em "init queries": logo após parear,
      // o Baileys baixa conversas e contatos, e numa VM pequena isso não cabia
      // nos 60s padrão. Os três ajustes abaixo atacam o mesmo problema.
      defaultQueryTimeoutMs: 120000,
      connectTimeoutMs: 90000,
      keepAliveIntervalMs: 25000,

      // Não baixar o histórico completo. Ele não é usado — as mensagens
      // antigas não entram no sistema de qualquer forma — e era justamente
      // o que estourava a memória e o tempo na inicialização.
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (update) => this.onConnectionUpdate(update));
    this.sock.ev.on('messages.upsert', (payload) => this.onMessagesUpsert(payload));
    this.sock.ev.on('messages.update', (updates) => this.onMessagesStatusUpdate(updates));
  }

  async onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      await this.updateSessionRow({ status: 'qr_pending', qr_code: qrImage });
      this.emit('qr', { qr: qrImage });
      this.emit('status', { status: 'qr_pending' });
    }

    if (connection === 'open') {
      this.restarting = false;
      const phoneNumber = this.sock.user?.id?.split(':')?.[0] ?? null;
      await this.updateSessionRow({
        status: 'connected',
        qr_code: null,
        phone_number: phoneNumber,
        last_connected_at: new Date().toISOString(),
      });
      this.emit('status', { status: 'connected', phoneNumber });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      // 515 (restartRequired) é parte normal do pareamento: logo depois de o
      // usuário escanear o QR, o WhatsApp derruba o stream e exige que o
      // cliente reconecte. Tratar como erro faria a tela mostrar "Erro" numa
      // conexão que na verdade deu certo.
      const restartRequired = statusCode === DisconnectReason.restartRequired;

      if (loggedOut) {
        // Desconectado pelo celular ("Sair" em Aparelhos conectados). As
        // credenciais salvas morreram junto: mantê-las faria toda tentativa de
        // reconectar falhar em silêncio, sem nunca mostrar um QR novo. Apagar
        // é o que permite parear de novo.
        await this.limparCredenciais();
        this.tentativas = 0;
        await this.updateSessionRow({ status: 'disconnected', qr_code: null, phone_number: null });
        this.emit('status', { status: 'disconnected', motivo: 'loggedOut' });
        return;
      }

      const status = restartRequired ? 'connecting' : 'error';
      await this.updateSessionRow({ status });
      this.emit('status', { status });

      // Uma reconexão de cada vez: dois sockets no mesmo diretório de
      // credenciais brigam e quebram a descriptografia das mensagens.
      if (this.restarting) return;
      this.restarting = true;

      try {
        this.sock?.ev?.removeAllListeners?.();
      } catch {
        // socket já morto — seguir
      }

      // Espera crescente até 1 min. Antes eram 3s fixos para sempre: com o
      // WhatsApp fora do ar, isso viravam 20 tentativas por minuto, cada uma
      // reabrindo socket na VM pequena.
      this.tentativas = restartRequired ? 0 : (this.tentativas || 0) + 1;
      const espera = restartRequired
        ? 500
        : Math.min(3000 * 2 ** (this.tentativas - 1), 60000);

      setTimeout(() => {
        this.restarting = false;
        this.start().catch((e) => {
          logger.error(e);
          // Se nem subir o socket der certo, a tela precisa saber — senão fica
          // eternamente em "conectando" sem ninguém tentando nada.
          this.updateSessionRow({ status: 'error' }).catch(() => {});
          this.emit('status', { status: 'error' });
        });
      }, espera);
    }
  }

  /** Apaga as credenciais em disco para que o próximo start gere um QR novo. */
  async limparCredenciais() {
    try {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    } catch (err) {
      logger.error({ err }, 'falha ao limpar credenciais');
    }
  }

  /** Derruba o socket sem apagar credenciais (usado ao reconectar). */
  async derrubar() {
    this.restarting = true; // impede o handler de close agendar outro start
    try {
      this.sock?.ev?.removeAllListeners?.();
      this.sock?.end?.(undefined);
    } catch {
      // já estava morto
    }
    this.sock = null;
    this.restarting = false;
  }

  async updateSessionRow(fields) {
    await supabase
      .from('whatsapp_sessions')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', this.sessionId);
  }

  async onMessagesUpsert({ messages, type }) {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue; // ignora grupos/status

      const text = extractText(msg.message);
      // Por decisão de produto, o TakaZap trabalha só com texto: áudio,
      // imagem e documento são ignorados de propósito, não é pendência.
      if (text === null) continue;

      try {
        await handleIncomingMessage({
          sessionId: this.sessionId,
          jid,
          pushName: msg.pushName,
          text,
          whatsappMessageId: msg.key.id,
          sendReply: (replyText) => this.sendText(jid, replyText),
        });
      } catch (err) {
        logger.error({ err }, 'Erro processando mensagem recebida');
      }
    }
  }

  async onMessagesStatusUpdate(updates) {
    for (const u of updates) {
      const waMessageId = u.key?.id;
      const status = mapBaileysStatus(u.update?.status);
      if (!waMessageId || !status) continue;
      await supabase
        .from('messages')
        .update({ status })
        .eq('whatsapp_message_id', waMessageId);
    }
  }

  async sendText(jid, text) {
    if (!this.sock) throw new Error('Sessão WhatsApp não iniciada');
    return this.sock.sendMessage(jid, { text });
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout().catch(() => {});
    }
    fs.rmSync(this.authDir, { recursive: true, force: true });
    await this.updateSessionRow({ status: 'disconnected', qr_code: null });
  }
}

function extractText(message) {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText;
  }
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  return null;
}

function mapBaileysStatus(status) {
  // Baileys usa números: 1=pending,2=sent,3=delivered,4=read
  switch (status) {
    case 2: return 'sent';
    case 3: return 'delivered';
    case 4: return 'read';
    default: return null;
  }
}

/**
 * Registro em memória de todas as sessões ativas neste processo.
 * Em um deploy multi-instância seria preciso "sticky" por sessão;
 * para a maioria dos casos de uso um único worker é suficiente.
 */
export class SessionManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map();
  }

  async startSession(sessionId, organizationId = null, { force = false } = {}) {
    const existente = this.sessions.get(sessionId);

    // Antes, existir no mapa bastava para o método devolver a sessão e não
    // fazer nada. Só que o objeto continua no mapa mesmo com o socket morto —
    // então o botão "Reconectar" não reconectava coisa alguma. Com force, a
    // sessão antiga é derrubada e uma nova sobe no lugar.
    if (existente && !force) return existente;
    if (existente) await existente.derrubar();

    // Sem a organização, os eventos não chegam ao painel (ele escuta a sala da
    // org). Se o chamador não passou, buscamos no banco.
    let orgId = organizationId;
    if (!orgId) {
      const { data } = await supabase
        .from('whatsapp_sessions')
        .select('organization_id')
        .eq('id', sessionId)
        .single();
      orgId = data?.organization_id ?? null;
    }

    const session = new WhatsAppSession(sessionId, this.io, orgId);
    this.sessions.set(sessionId, session);
    await session.start();
    return session;
  }

  /** Reconecta do zero: derruba o socket atual e sobe outro. */
  async reconnect(sessionId, organizationId = null) {
    return this.startSession(sessionId, organizationId, { force: true });
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  async stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await session.logout();
    this.sessions.delete(sessionId);
  }

  /** Reconecta todas as sessões que já existiam no banco (ex: após restart do servidor) */
  async resumeAll() {
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id, status, organization_id')
      .neq('status', 'disconnected');

    for (const row of sessions ?? []) {
      await this.startSession(row.id, row.organization_id).catch((err) =>
        console.error(`Falha ao retomar sessão ${row.id}:`, err.message)
      );
    }
  }
}
