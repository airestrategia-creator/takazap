# TakaZap

Sistema próprio de automação de WhatsApp: chatbot com fluxo/funil, disparo em
massa (campanhas) e painel multiatendente, com CRM básico (contatos, tags,
funil de vendas em Kanban).

Arquitetura própria, construída do zero — não usa código nem interface de
nenhuma ferramenta de terceiros.

## ⚠️ Leia antes de usar em produção

A conexão com o WhatsApp aqui é feita via **WhatsApp Web não-oficial**
(biblioteca Baileys, escaneando QR code) — é assim que a maioria das
ferramentas desse tipo do mercado funciona por trás dos panos, mas **não é
suportado pela Meta** e existe risco real de o número ser bloqueado,
especialmente em disparo em massa. Recomendações práticas:

- Use um número dedicado para automação (não o seu WhatsApp pessoal).
- Comece com poucos disparos por dia e aumente aos poucos ("aquecimento").
- Respeite os delays entre mensagens (já configurado por padrão entre 8–25s).
- Não envie para listas compradas/frias sem opt-in — é o principal gatilho de bloqueio.
- Se o volume crescer ou a operação for crítica, migre o envio de campanhas
  para a **WhatsApp Business Cloud API oficial da Meta**, que é paga por
  mensagem mas não tem risco de bloqueio. A arquitetura aqui foi desenhada
  para isso ser uma troca isolada em `backend/src/services/whatsapp.js`,
  sem precisar reescrever CRM, chatbot ou campanhas.

## Arquitetura

```
                     ┌─────────────────┐
                     │    Supabase      │  (Postgres + Auth + Realtime)
                     └────────▲─────────┘
                              │
   ┌──────────────┐   REST + Socket.IO   ┌──────────────────┐
   │  Frontend     │◄─────────────────────►│  Backend Node.js │
   │  React (painel)│                      │  Express + Baileys│
   └──────────────┘                       └─────────┬─────────┘
                                                      │ WhatsApp Web (QR)
                                                      ▼
                                              📱 Número de WhatsApp
```

- **Supabase**: banco de dados (Postgres), autenticação dos atendentes e
  realtime (o front escuta mudanças direto do banco quando cabível).
- **Backend**: processo Node.js sempre ativo (não roda em serverless/edge
  function) porque mantém a conexão WebSocket do WhatsApp aberta o tempo
  todo. É aqui que fica o motor do chatbot e o disparo de campanhas.
- **Frontend**: painel do atendente (React), fala com o backend via API REST
  e recebe eventos em tempo real via Socket.IO (novo QR code, nova mensagem,
  status de conexão).

**Importante sobre o Supabase que você já tem:** o Supabase por si só (banco
+ Edge Functions) não consegue manter a sessão do WhatsApp aberta — Edge
Functions são de curta duração. Por isso o backend precisa rodar em algum
lugar com processo persistente: uma VPS (Hostinger, Contabo, DigitalOcean...)
ou um serviço tipo Railway/Fly.io/Render. O Supabase continua sendo o banco
de dados de tudo.

## Estrutura do projeto

```
takazap/
├── backend/     # API + conector WhatsApp (Baileys) + motor de chatbot + campanhas
├── frontend/    # Painel do atendente (React + Tailwind)
├── sql/         # Schema do banco para rodar no Supabase
└── docker-compose.yml
```

## 1. Configurar o Supabase

1. No painel do Supabase, abra **SQL Editor** e rode, nesta ordem:
   - `sql/001_schema.sql` — cria todas as tabelas
   - `sql/002_rls.sql` — políticas de segurança (isolamento por organização)
2. Vá em **Authentication → Users** e crie o primeiro usuário (você), com
   e-mail e senha — vai ser o login do painel.
3. Copie o **UID** desse usuário.
4. Edite `sql/003_seed_example.sql`, cole o UID no lugar indicado, ajuste
   nome/e-mail/organização, e rode esse arquivo também.
5. Em **Project Settings → API**, anote:
   - `Project URL` → vai virar `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon public key` → vai virar `VITE_SUPABASE_ANON_KEY` (frontend)
   - `service_role key` → vai virar `SUPABASE_SERVICE_ROLE_KEY` (backend,
     **nunca** exponha essa chave no frontend)

## 2. Rodar localmente (para testar antes de subir no servidor)

```bash
# Backend
cd backend
cp .env.example .env        # preencha com os valores do Supabase
npm install
npm run dev                 # sobe em http://localhost:3333

# Frontend (em outro terminal)
cd frontend
cp .env.example .env        # preencha com os valores do Supabase + URL do backend
npm install
npm run dev                 # sobe em http://localhost:5173
```

Acesse `http://localhost:5173`, faça login com o usuário criado no passo 1,
vá em **Conexão WhatsApp → Conectar número** e escaneie o QR code pelo
celular (WhatsApp → Aparelhos conectados → Conectar um aparelho).

## 3. Deploy gratuito (Fly.io + Cloudflare Pages)

Essa é a forma recomendada pra manter custo zero nesse porte de operação:
**Fly.io** para o backend (precisa ficar sempre ativo, por causa da conexão
do WhatsApp) e **Cloudflare Pages** para o painel (site estático, grátis).

### 3.1 Backend no Fly.io

```bash
# 1. Instale o Fly CLI (uma vez só)
curl -L https://fly.io/install.sh | sh

# 2. Login (abre o navegador)
fly auth login

# 3. Dentro da pasta backend/
cd takazap/backend
fly launch --no-deploy      # confirme o nome do app (ou ajuste em fly.toml)
fly volumes create whatsapp_storage --size 1 --region gru

# 4. Configure os segredos (mesmos valores do backend/.env.example)
fly secrets set \
  SUPABASE_URL=https://gqtjcjdirarbnegqdutt.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<sua_service_role_key> \
  DEFAULT_ORGANIZATION_ID=11111111-1111-1111-1111-111111111111 \
  JWT_SECRET=<uma_string_aleatoria_longa> \
  FRONTEND_ORIGIN=https://seu-painel.pages.dev \
  GOOGLE_PLACES_API_KEY=<sua_chave_do_google_places>

# 5. Deploy
fly deploy
```

O `fly.toml` já vem configurado com `auto_stop_machines = false` — isso é
essencial, porque se a máquina "dormir" a conexão do WhatsApp cai.

### 3.2 Painel no Cloudflare Pages

```bash
cd takazap/frontend
npm install
npm run build   # gera a pasta dist/

# Via CLI (wrangler):
npx wrangler pages deploy dist --project-name=takazap-painel
```

Antes do build, defina as variáveis de ambiente (`frontend/.env` local, ou
nas "Environment variables" do projeto no painel do Cloudflare Pages):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (a URL pública
que o Fly.io te deu para o backend, ex: `https://takazap-backend.fly.dev`).

Depois de publicado, volte no passo 3.1 e ajuste `FRONTEND_ORIGIN` no Fly.io
para a URL real do Cloudflare Pages (evita bloqueio de CORS).

## 3-alt. Deploy em VPS tradicional (alternativa paga)

Pré-requisitos na VPS: Docker e Docker Compose instalados.

```bash
# 1. Envie a pasta takazap/ para a VPS (scp, git clone, rsync — o que preferir)

# 2. Configure as variáveis de ambiente
cd takazap
cp backend/.env.example backend/.env      # preencha com os dados do Supabase
cp .env.example .env                      # preencha (usado no build do frontend)
#    -> defina VITE_API_URL como o domínio público do backend, ex:
#       https://api.seudominio.com

# 3. Suba os containers
docker compose up -d --build

# Backend fica em :3333, frontend (nginx) fica em :8080
```

Depois disso, configure um proxy reverso (Nginx, Caddy ou Traefik) na sua
VPS apontando um subdomínio para cada serviço, com HTTPS (Let's Encrypt),
por exemplo:
- `app.seudominio.com` → `localhost:8080` (painel)
- `api.seudominio.com` → `localhost:3333` (backend, incluindo WebSocket)

Sem HTTPS, o navegador vai bloquear o acesso ao microfone/câmera se algum
dia adicionar isso, e alguns recursos de terceiros. Para WebSocket via
Nginx, lembre de repassar os headers `Upgrade`/`Connection`.

**Persistência da sessão do WhatsApp:** o volume Docker `whatsapp_storage`
guarda as credenciais da conexão — não apague esse volume ou vai precisar
escanear o QR code de novo.

## Funcionalidades incluídas

- **Conexão WhatsApp via QR code**, com reconexão automática em quedas.
- **Chatbot / funil de automação**: fluxos disparados por palavra-chave ou
  primeira mensagem, com passos de mensagem, tag, mudança de estágio do
  funil e transferência para humano. Editor visual simplificado em
  **Fluxos** (o motor no backend também suporta ramificações por condição,
  editáveis direto no JSON `definition` da tabela `chatbot_flows` para quem
  quiser ir além da UI).
- **Disparo em massa (campanhas)**: envio segmentado por tag/estágio do
  funil, com delay aleatório configurável entre mensagens.
- **Painel multiatendente**: fila de conversas sem atendente, "assumir
  conversa" (tira do bot), transferência entre atendentes, notas internas,
  status online/offline.
- **CRM básico**: contatos, tags coloridas, funil de vendas em Kanban
  (arrastar e soltar).
- **Prospecção**: busca estabelecimentos no Google Meu Negócio/Google Maps
  (via Google Places API) por categoria + região, e importa os que têm
  telefone público direto como contato no CRM, já com a tag "Prospecção".
  Veja a seção **4. Prospecção (Google Places API)** abaixo para configurar.

## 4. Prospecção (Google Places API)

A tela **Prospecção** não usa nenhuma "IA que lê o ICP" — ela busca no Google
Maps/Google Meu Negócio por categoria + região, do mesmo jeito que uma busca
manual no Google Maps. O campo de ICP fica salvo só como anotação/contexto;
o campo que efetivamente dispara a busca é o "termo de busca" (ex: "clínicas
odontológicas em Pinheiros, São Paulo").

Para habilitar:

1. Acesse [console.cloud.google.com](https://console.cloud.google.com), crie
   ou selecione um projeto.
2. Em **APIs e Serviços → Biblioteca**, ative a **Places API**.
3. Em **APIs e Serviços → Credenciais**, crie uma **Chave de API**.
4. Habilite faturamento no projeto (o Google cobra por chamada de busca +
   detalhes, mas dá um crédito mensal gratuito que costuma cobrir uso
   moderado). Recomenda-se restringir a chave por IP (o IP da sua VPS) para
   segurança.
5. Coloque a chave em `backend/.env` como `GOOGLE_PLACES_API_KEY`.

Sem essa chave configurada, a tela de Prospecção mostra um aviso e a busca
fica bloqueada — o resto do sistema funciona normalmente sem ela.

## O que evoluir a partir daqui (sugestões)

- Editor de fluxo com ramificação (condição) na UI — o motor já suporta.
- Múltiplos números de WhatsApp por organização rodando simultaneamente.
- Métricas/dashboard (tempo médio de resposta, conversão por estágio do funil).
- Migração para WhatsApp Cloud API oficial se o volume de disparo crescer.
