-- WhatsZap Flow — schema principal (Supabase / PostgreSQL)
-- Rode este arquivo no SQL editor do Supabase (ou via `supabase db push`).

create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZAÇÃO / USUÁRIOS (atendentes)
-- ============================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Estende auth.users do Supabase com dados de atendente
create table if not exists agents (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  status text not null default 'offline' check (status in ('online', 'offline', 'away')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONEXÃO WHATSAPP (sessão via QR code / Baileys)
-- ============================================================

create table if not exists whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label text not null default 'Principal',
  phone_number text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'qr_pending', 'connected', 'error')),
  qr_code text,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CRM: CONTATOS, TAGS, FUNIL
-- ============================================================

create table if not exists funnel_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  position int not null default 0,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null default '#10b981',
  unique (organization_id, name)
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  whatsapp_jid text not null,
  name text,
  phone text,
  avatar_url text,
  funnel_stage_id uuid references funnel_stages(id) on delete set null,
  assigned_agent_id uuid references agents(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, whatsapp_jid)
);

create table if not exists contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- ============================================================
-- CONVERSAS E MENSAGENS
-- ============================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  session_id uuid not null references whatsapp_sessions(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  assigned_agent_id uuid references agents(id) on delete set null,
  bot_active boolean not null default true,
  active_flow_id uuid,
  active_node_id text,
  waiting_for_reply boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  whatsapp_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('contact', 'agent', 'bot', 'system')),
  sender_agent_id uuid references agents(id) on delete set null,
  content_type text not null default 'text' check (content_type in ('text', 'image', 'audio', 'video', 'document', 'template')),
  content text,
  media_url text,
  status text not null default 'sent' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CHATBOT / FUNIL DE AUTOMAÇÃO (flow builder)
-- ============================================================

create table if not exists chatbot_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'keyword' check (trigger_type in ('keyword', 'first_message', 'manual')),
  trigger_keywords text[] default '{}',
  is_active boolean not null default true,
  definition jsonb not null default '{"nodes": [], "edges": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table conversations
  add constraint conversations_active_flow_fk
  foreign key (active_flow_id) references chatbot_flows(id) on delete set null;

-- ============================================================
-- CAMPANHAS (disparo em massa)
-- ============================================================

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  session_id uuid not null references whatsapp_sessions(id) on delete cascade,
  name text not null,
  message_template text not null,
  media_url text,
  target_tag_ids uuid[] default '{}',
  target_funnel_stage_ids uuid[] default '{}',
  min_delay_seconds int not null default 8,
  max_delay_seconds int not null default 25,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_contacts_org on contacts (organization_id);
create index if not exists idx_conversations_org_status on conversations (organization_id, status);
create index if not exists idx_messages_conversation on messages (conversation_id, created_at);
create index if not exists idx_campaign_messages_campaign on campaign_messages (campaign_id, status);
create index if not exists idx_contact_tags_contact on contact_tags (contact_id);

-- ============================================================
-- REALTIME (para o frontend ouvir novas mensagens)
-- ============================================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table whatsapp_sessions;
alter publication supabase_realtime add table campaign_messages;
