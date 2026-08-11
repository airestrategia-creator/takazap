-- Prospecção: busca de leads no Google Meu Negócio (via Google Places API)
-- Já aplicado diretamente no projeto Supabase "Air Estratégia" — este arquivo
-- fica aqui só para manter o histórico do schema versionado junto do resto.

create table if not exists prospecting_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by_agent_id uuid references agents(id) on delete set null,
  icp_description text not null,
  search_query text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create table if not exists prospecting_leads (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references prospecting_searches(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  google_place_id text,
  name text,
  phone text,
  formatted_address text,
  website text,
  rating numeric,
  user_ratings_total int,
  business_status text,
  imported_contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (search_id, google_place_id)
);

create index if not exists idx_prospecting_leads_search on prospecting_leads (search_id);

alter table prospecting_searches enable row level security;
alter table prospecting_leads enable row level security;

create policy org_isolation_select on prospecting_searches for select using (organization_id = current_agent_org());
create policy org_isolation_write on prospecting_searches for insert with check (organization_id = current_agent_org());
create policy org_isolation_update on prospecting_searches for update using (organization_id = current_agent_org());

create policy org_isolation_select on prospecting_leads for select using (organization_id = current_agent_org());
create policy org_isolation_update_leads on prospecting_leads for update using (organization_id = current_agent_org());

alter publication supabase_realtime add table prospecting_searches;
alter publication supabase_realtime add table prospecting_leads;
