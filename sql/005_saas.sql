-- WhatsZap Flow — camada SaaS (multi-tenant, planos, assinatura, PIX)
-- Rode depois de 001..004.

-- ============================================================
-- 1. MULTI-TENANT: um usuário pode pertencer a várias organizações
-- ============================================================
-- Até aqui `agents.id` era o próprio id do usuário no auth.users, o que
-- amarrava um usuário a exatamente uma organização. Agora `agents` vira uma
-- tabela de vínculo (usuário × organização) com id próprio — as FKs que já
-- apontam para agents(id) continuam válidas.

alter table agents drop constraint if exists agents_id_fkey;

alter table agents add column if not exists user_id uuid references auth.users(id) on delete cascade;
update agents set user_id = id where user_id is null;
alter table agents alter column user_id set not null;
alter table agents alter column id set default gen_random_uuid();

create unique index if not exists idx_agents_user_org on agents (user_id, organization_id);
create index if not exists idx_agents_user on agents (user_id);

-- Papéis: owner (dono da conta, cuida da assinatura), admin, agent
alter table agents drop constraint if exists agents_role_check;
alter table agents add constraint agents_role_check
  check (role in ('owner', 'admin', 'agent'));

-- Quem criou a organização
alter table organizations add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

-- Marca como owner o agente mais antigo de cada org que ainda não tem owner
update agents a
set role = 'owner'
where a.id = (
  select a2.id from agents a2
  where a2.organization_id = a.organization_id
  order by a2.created_at asc
  limit 1
)
and not exists (
  select 1 from agents a3
  where a3.organization_id = a.organization_id and a3.role = 'owner'
);

update organizations o
set owner_user_id = (
  select a.user_id from agents a
  where a.organization_id = o.id and a.role = 'owner'
  limit 1
)
where o.owner_user_id is null;

-- ============================================================
-- 2. ASSINATURA
-- ============================================================
-- plan_id casa com os ids em frontend/src/lib/plans.js e backend/src/lib/plans.js

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  plan_id text not null default 'trial'
    check (plan_id in ('trial', 'inicial', 'completo', 'completo_equipe')),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled')),

  -- Add-ons (R$ 9,90/mês cada) e dispositivos extras (R$ 9,90/mês cada)
  extra_devices int not null default 0 check (extra_devices >= 0),
  addon_proxy boolean not null default false,
  addon_privacidade boolean not null default false,

  -- Cobrança
  amount_cents int not null default 0,
  trial_ends_at timestamptz,
  current_period_end timestamptz,

  -- Tetos do período de teste
  trial_broadcasts_used int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_status on subscriptions (status);

-- Cobranças PIX. O provedor fica abstraído: `provider = 'manual'` significa
-- que a confirmação é feita a mão no painel; quando plugar Mercado Pago/Asaas,
-- é só gravar o provider e o provider_ref e confirmar via webhook.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  provider text not null default 'manual',
  provider_ref text,
  method text not null default 'pix' check (method in ('pix', 'card', 'boleto')),
  amount_cents int not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'failed', 'refunded')),
  pix_payload text,        -- copia-e-cola
  pix_qr_code text,        -- imagem/base64 do QR
  description text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_org on payments (organization_id, created_at desc);
create unique index if not exists idx_payments_provider_ref
  on payments (provider, provider_ref) where provider_ref is not null;

-- ============================================================
-- 3. FLUXOS: escopo por dispositivo + telemetria por nó
-- ============================================================

alter table chatbot_flows add column if not exists device_scope text not null default 'all'
  check (device_scope in ('all', 'selected'));
alter table chatbot_flows add column if not exists session_ids uuid[] not null default '{}';

-- Variáveis coletadas durante o fluxo (resposta do contato, retorno de HTTP).
-- Usadas nos templates de mensagem como {{variavel}}.
alter table conversations add column if not exists flow_variables jsonb not null default '{}'::jsonb;

-- Contadores de execução por nó, exibidos no canvas (ok / alerta / erro)
create table if not exists flow_node_stats (
  flow_id uuid not null references chatbot_flows(id) on delete cascade,
  node_id text not null,
  ok_count bigint not null default 0,
  warn_count bigint not null default 0,
  error_count bigint not null default 0,
  last_run_at timestamptz,
  primary key (flow_id, node_id)
);

-- Incremento atômico dos contadores. Chamado pelo motor a cada nó executado —
-- por isso é um upsert numa chamada só, sem leitura antes.
create or replace function increment_flow_node_stat(
  p_flow_id uuid,
  p_node_id text,
  p_outcome text
)
returns void
language sql
as $$
  insert into flow_node_stats (flow_id, node_id, ok_count, warn_count, error_count, last_run_at)
  values (
    p_flow_id,
    p_node_id,
    case when p_outcome = 'ok' then 1 else 0 end,
    case when p_outcome = 'warn' then 1 else 0 end,
    case when p_outcome = 'error' then 1 else 0 end,
    now()
  )
  on conflict (flow_id, node_id) do update set
    ok_count    = flow_node_stats.ok_count    + excluded.ok_count,
    warn_count  = flow_node_stats.warn_count  + excluded.warn_count,
    error_count = flow_node_stats.error_count + excluded.error_count,
    last_run_at = now();
$$;

-- ============================================================
-- 4. DISPOSITIVOS: estatísticas por sessão
-- ============================================================

alter table whatsapp_sessions add column if not exists created_by uuid references agents(id) on delete set null;

create index if not exists idx_messages_org_created on messages (organization_id, created_at desc);

-- Contagem de mensagens por sessão nas janelas que o painel mostra
create or replace view device_message_stats as
select
  s.id as session_id,
  s.organization_id,
  count(m.id) filter (where m.created_at >= date_trunc('day', now() at time zone 'utc')) as today_count,
  count(m.id) filter (where m.created_at >= now() - interval '7 days') as last_7d_count,
  count(m.id) filter (where m.created_at >= now() - interval '30 days') as last_30d_count,
  count(m.id) as total_count
from whatsapp_sessions s
left join conversations c on c.session_id = s.id
left join messages m on m.conversation_id = c.id
group by s.id, s.organization_id;

-- ============================================================
-- 5. RLS: um usuário agora pode ver várias organizações
-- ============================================================
-- `current_agent_org()` buscava agents.id = auth.uid() e devolvia uma única
-- org — com o vínculo em user_id isso passaria a devolver nada, derrubando o
-- acesso do frontend. Trocamos por uma função que devolve todas as orgs do
-- usuário.

create or replace function current_agent_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from agents where user_id = auth.uid()
$$;

-- Mantida por compatibilidade: devolve a organização mais antiga do usuário.
create or replace function current_agent_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from agents
  where user_id = auth.uid()
  order by created_at asc
  limit 1
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'agents', 'whatsapp_sessions', 'funnel_stages', 'tags', 'contacts',
    'conversations', 'messages', 'chatbot_flows', 'campaigns'
  ]
  loop
    execute format('drop policy if exists org_isolation_select on %I', t);
    execute format(
      'create policy org_isolation_select on %I for select using (organization_id in (select current_agent_orgs()))',
      t
    );
  end loop;
end $$;

drop policy if exists org_isolation_write_contacts on contacts;
create policy org_isolation_write_contacts on contacts for all
  using (organization_id in (select current_agent_orgs()))
  with check (organization_id in (select current_agent_orgs()));

drop policy if exists org_isolation_write_conversations on conversations;
create policy org_isolation_write_conversations on conversations for update
  using (organization_id in (select current_agent_orgs()));

drop policy if exists org_isolation_write_messages on messages;
create policy org_isolation_write_messages on messages for insert
  with check (organization_id in (select current_agent_orgs()));

drop policy if exists notes_by_org on internal_notes;
create policy notes_by_org on internal_notes for all
  using (
    conversation_id in (
      select id from conversations where organization_id in (select current_agent_orgs())
    )
  );

drop policy if exists contact_tags_by_org on contact_tags;
create policy contact_tags_by_org on contact_tags for all
  using (
    contact_id in (
      select id from contacts where organization_id in (select current_agent_orgs())
    )
  );

-- Assinatura e cobranças só são visíveis para a própria organização
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table flow_node_stats enable row level security;

drop policy if exists org_isolation_select on subscriptions;
create policy org_isolation_select on subscriptions for select
  using (organization_id in (select current_agent_orgs()));

drop policy if exists org_isolation_select on payments;
create policy org_isolation_select on payments for select
  using (organization_id in (select current_agent_orgs()));

drop policy if exists org_isolation_select on flow_node_stats;
create policy org_isolation_select on flow_node_stats for select
  using (
    flow_id in (
      select id from chatbot_flows where organization_id in (select current_agent_orgs())
    )
  );

-- ============================================================
-- 6. Assinatura em trial para organizações que já existem
-- ============================================================

insert into subscriptions (organization_id, plan_id, status, trial_ends_at)
select o.id, 'trial', 'trialing', now() + interval '3 days'
from organizations o
where not exists (select 1 from subscriptions s where s.organization_id = o.id);
