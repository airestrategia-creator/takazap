import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config.js';
import { supabase } from './db/supabase.js';
import { requireUser, requireAgent, requireSuperAdmin } from './middleware/auth.js';
import { SessionManager } from './services/whatsapp.js';
import { CampaignWorker } from './jobs/campaignWorker.js';

import { sessionsRouter } from './routes/sessions.js';
import { contactsRouter, tagsRouter, funnelStagesRouter } from './routes/contacts.js';
import { conversationsRouter } from './routes/conversations.js';
import { flowsRouter } from './routes/flows.js';
import { campaignsRouter } from './routes/campaigns.js';
import { agentsRouter } from './routes/agents.js';
import { prospectingRouter } from './routes/prospecting.js';
import { onboardingRouter } from './routes/onboarding.js';
import { subscriptionRouter } from './routes/subscription.js';
import { membersRouter } from './routes/members.js';
import { adminRouter } from './routes/admin.js';

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: config.frontendOrigin, credentials: true },
});

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const sessionManager = new SessionManager(io);
const campaignWorker = new CampaignWorker(sessionManager);

// O socket carrega QR code, mensagens e status das conversas. Sem autenticar,
// qualquer pessoa na internet entrava na sala de qualquer organização e
// recebia o QR — o que permite parear o WhatsApp da vítima no próprio celular.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token ausente'));

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Token inválido'));

    const { data: memberships, error: memberError } = await supabase
      .from('agents')
      .select('organization_id')
      .eq('user_id', data.user.id);
    if (memberError) return next(new Error('Falha ao validar acesso'));

    socket.data.userId = data.user.id;
    socket.data.organizationIds = (memberships ?? []).map((m) => m.organization_id);
    next();
  } catch (err) {
    next(new Error('Falha na autenticação'));
  }
});

io.on('connection', (socket) => {
  socket.on('join', ({ organizationId, sessionId }) => {
    // Só entra na sala de organização a que o usuário realmente pertence.
    if (!organizationId || !socket.data.organizationIds.includes(organizationId)) return;

    socket.join(`org:${organizationId}`);
    // A sala por sessão é redundante depois da checagem acima, mas mantida
    // para o painel que já escuta por sessão.
    if (sessionId) socket.join(`session:${sessionId}`);
  });
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'wzapflow-backend' }));

// Quem abre a URL da API no navegador cai aqui. Sem isso o requireUser
// devolveria "Token ausente", que parece erro do sistema.
app.get('/', (req, res) =>
  res.json({
    service: 'WZap Flow — API',
    message: 'Esta é a API. O painel fica em outro endereço.',
    painel: config.frontendOrigin,
  }),
);

// Só exige usuário autenticado: no cadastro a organização ainda não existe.
app.use(requireUser);
app.use('/api/onboarding', onboardingRouter);

// Painel de controle global — só o super admin. Fica ANTES do requireAgent
// porque não é escopado a uma organização (enxerga todas).
app.use('/api/admin', requireSuperAdmin, adminRouter);

// Daqui para baixo, tudo roda no contexto de uma organização.
app.use(requireAgent);

app.use('/api/subscription', subscriptionRouter);
app.use('/api/sessions', sessionsRouter(sessionManager));
app.use('/api/contacts', contactsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/funnel-stages', funnelStagesRouter);
app.use('/api/conversations', conversationsRouter(sessionManager, io));
app.use('/api/flows', flowsRouter);
app.use('/api/campaigns', campaignsRouter(campaignWorker));
app.use('/api/agents', agentsRouter);
app.use('/api/members', membersRouter);
app.use('/api/prospecting', prospectingRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Erros com status conhecido (ex: 404 do findOwned) devem chegar assim ao
  // cliente. Sem isto, um acesso negado virava 500 — o que confunde o cliente
  // e mascara tentativas de acesso indevido nos logs.
  const status = Number.isInteger(err.status) ? err.status : 500;

  // Só devolvemos a mensagem em erros esperados (4xx). Num 500 a mensagem pode
  // conter detalhe interno (SQL, caminho de arquivo) — melhor esconder.
  if (status >= 500) {
    console.error(err);
    return res.status(status).json({ error: 'Erro interno' });
  }
  res.status(status).json({ error: err.message || 'Requisição inválida' });
});

httpServer.listen(config.port, async () => {
  console.log(`WhatsZap backend rodando na porta ${config.port}`);
  await sessionManager.resumeAll();
});
