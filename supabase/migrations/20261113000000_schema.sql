-- ============================================================
--  Comidas · Migración 20261113000000 "schema base"
--
--  Es la primera de la serie. Con `supabase db push` el CLI registra
--  cuáles ya se aplicaron en `supabase_migrations.schema_migrations`.
--  También se puede correr a mano en el SQL Editor (es idempotente).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
--  Platos (recetario)
-- ------------------------------------------------------------
create table if not exists public.dishes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  difficulty        text not null check (difficulty in ('muy-facil', 'facil', 'media', 'elaborada')),
  minutes           integer,
  freezer_friendly  boolean not null default false,
  favorite          boolean not null default false,
  tags              text[] not null default '{}',
  ingredients       jsonb not null default '[]'::jsonb,
  steps             text not null default '',
  source_url        text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists dishes_user_idx on public.dishes (user_id, created_at desc);

-- ------------------------------------------------------------
--  Planificación: una fila por día de cada semana
--  week_start = lunes de esa semana (yyyy-mm-dd), day = 0..6
-- ------------------------------------------------------------
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_start  date not null,
  day         smallint not null check (day between 0 and 6),
  mode        text check (mode in ('freezer', 'muy-facil', 'facil', 'media', 'elaborada')),
  dish_id     uuid references public.dishes (id) on delete set null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, week_start, day)
);

create index if not exists plans_user_week_idx on public.plans (user_id, week_start);

-- ------------------------------------------------------------
--  Lista de compras por semana
-- ------------------------------------------------------------
create table if not exists public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  week_start  date not null,
  text        text not null,
  checked     boolean not null default false,
  category    text not null default 'Otros',
  dish_id     uuid references public.dishes (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists shopping_user_week_idx on public.shopping_items (user_id, week_start);

-- ------------------------------------------------------------
--  Seguridad a nivel de fila: cada usuario solo ve lo suyo
-- ------------------------------------------------------------
alter table public.dishes enable row level security;
alter table public.plans enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "dishes_owner_all" on public.dishes;
create policy "dishes_owner_all" on public.dishes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "plans_owner_all" on public.plans;
create policy "plans_owner_all" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shopping_owner_all" on public.shopping_items;
create policy "shopping_owner_all" on public.shopping_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
--  Borrado de cuenta desde la app
--  Borra la fila de auth.users del usuario actual; las tablas
--  públicas se limpian por las foreign keys con on delete cascade.
--  La app la llama con supabase.rpc('delete_my_account').
-- ------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
