-- Rode isto DEPOIS de 001_schema.sql e 002_rls.sql, e depois de criar seu
-- primeiro usuário em Authentication > Users no painel do Supabase.
--
-- Só precisa trocar UMA coisa: o UID do usuário, no bloco abaixo.
--
-- O id da organização é gerado automaticamente. Não use um UUID chumbado do
-- tipo '11111111-...': ele aparece na URL do painel (/org/<id>/inicio) e
-- entrega que o sistema veio de um seed de exemplo.

do $$
declare
  -- >>> COLE AQUI o UID de Authentication > Users (coluna "UID") <<<
  v_user_id uuid := 'COLE-AQUI-O-UID-DO-USUARIO';

  v_nome_empresa text := 'Minha Empresa';
  v_seu_nome     text := 'Seu Nome';
  v_seu_email    text := 'seu-email@exemplo.com';

  v_org_id uuid;
begin
  insert into organizations (name, owner_user_id)
  values (v_nome_empresa, v_user_id)
  returning id into v_org_id;

  insert into agents (user_id, organization_id, name, email, role)
  values (v_user_id, v_org_id, v_seu_nome, v_seu_email, 'owner');

  insert into funnel_stages (organization_id, name, position, color) values
    (v_org_id, 'Novo lead',   0, '#8b5cf6'),
    (v_org_id, 'Em conversa', 1, '#f59e0b'),
    (v_org_id, 'Negociação',  2, '#ec4899'),
    (v_org_id, 'Fechado',     3, '#22c55e');

  -- Assinatura em período de teste
  insert into subscriptions (organization_id, plan_id, status, trial_ends_at)
  values (v_org_id, 'trial', 'trialing', now() + interval '3 days');

  raise notice 'Organização criada com id %', v_org_id;
end $$;
