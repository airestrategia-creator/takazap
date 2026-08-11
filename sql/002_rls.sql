-- Row Level Security — o backend (Node.js) usa a service_role key e ignora RLS.
-- Estas policies protegem o acesso do FRONTEND, que usa a anon/public key
-- autenticada via Supabase Auth (login de atendente).

create or replace function current_agent_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from agents where id = auth.uid()
$$;

alter table organizations enable row level security;
alter table agents enable row level security;
alter table whatsapp_sessions enable row level security;
alter table funnel_stages enable row level security;
alter table tags enable row level security;
alter table contacts enable row level security;
alter table contact_tags enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table internal_notes enable row level security;
alter table chatbot_flows enable row level security;
alter table campaigns enable row level security;
alter table campaign_messages enable row level security;

create policy org_isolation_select on agents for select using (organization_id = current_agent_org());
create policy org_isolation_select on whatsapp_sessions for select using (organization_id = current_agent_org());
create policy org_isolation_select on funnel_stages for select using (organization_id = current_agent_org());
create policy org_isolation_select on tags for select using (organization_id = current_agent_org());
create policy org_isolation_select on contacts for select using (organization_id = current_agent_org());
create policy org_isolation_select on conversations for select using (organization_id = current_agent_org());
create policy org_isolation_select on messages for select using (organization_id = current_agent_org());
create policy org_isolation_select on chatbot_flows for select using (organization_id = current_agent_org());
create policy org_isolation_select on campaigns for select using (organization_id = current_agent_org());

create policy org_isolation_write_contacts on contacts for all
  using (organization_id = current_agent_org())
  with check (organization_id = current_agent_org());

create policy org_isolation_write_conversations on conversations for update
  using (organization_id = current_agent_org());

create policy org_isolation_write_messages on messages for insert
  with check (organization_id = current_agent_org());

create policy notes_by_org on internal_notes for all
  using (
    conversation_id in (select id from conversations where organization_id = current_agent_org())
  );

create policy contact_tags_by_org on contact_tags for all
  using (
    contact_id in (select id from contacts where organization_id = current_agent_org())
  );

create policy campaign_messages_by_org on campaign_messages for select
  using (
    campaign_id in (select id from campaigns where organization_id = current_agent_org())
  );
