-- TakaZap — painel de controle global (super admin)
-- Rode depois de 001..005.

-- Super admins da plataforma: enxergam TODAS as organizações. É diferente de
-- 'owner' (que é dono de UMA organização). Aqui é o dono do produto.
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
-- Sem policy de select: ninguém lê via API pública (anon/publishable). Só o
-- backend, com a service key, consulta esta tabela.

-- Status de aprovação da organização.
--   pending   -> cadastro novo, ainda funciona (trial), aguardando revisão
--   approved  -> revisado e liberado
--   suspended -> acesso cortado pelo super admin
alter table organizations add column if not exists admin_status text not null default 'pending'
  check (admin_status in ('pending', 'approved', 'suspended'));

-- Semente: marque aqui os e-mails de super admin.
insert into platform_admins (user_id)
select id from auth.users where email = 'airestrategia@gmail.com'
on conflict (user_id) do nothing;

-- Organizações pré-existentes não são "cadastros novos" — já entram aprovadas.
update organizations set admin_status = 'approved' where admin_status = 'pending';
