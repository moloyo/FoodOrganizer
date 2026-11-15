-- ============================================================
--  Comidas · Migración "hogares" (datos compartidos por hogar)
--  Ejecutá este archivo COMPLETO en el SQL Editor de Supabase,
--  DESPUÉS de supabase/schema.sql.
--
--  Es idempotente: se puede correr dos (o más) veces sin romper
--  ni duplicar hogares. Si se corre con psql, conviene envolverlo
--  en BEGIN/COMMIT para que la migración sea atómica.
--
--  ATENCIÓN PARA EL CLIENTE: a partir de acá las escrituras deben
--  enviar household_id en cada insert/upsert, el unique de planes
--  pasa a (household_id, week_start, day) y los filtros por user_id
--  dejan de representar "los datos del hogar". Llamar a
--  my_household() al iniciar sesión crea el hogar de forma diferida.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
--  1. Tablas nuevas
-- ------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mi hogar',
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- Sin FK a auth.users a propósito: si se borra una cuenta, el hogar
-- compartido (y por lo tanto sus datos) debe sobrevivir.
create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- Un usuario pertenece a un solo hogar. Las RPC siempre borran la membership
-- anterior antes de insertar la nueva; el índice único es una red de seguridad
-- contra inserciones administrativas directas.
create unique index if not exists household_members_user_unique_idx
  on public.household_members (user_id);

create table if not exists public.household_invites (
  token        uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  revoked_at   timestamptz,
  used_count   integer not null default 0
);

create index if not exists household_invites_household_idx
  on public.household_invites (household_id, created_at desc);

-- ------------------------------------------------------------
--  2. Columna household_id, nullable al principio, en las 3 tablas
-- ------------------------------------------------------------

alter table public.dishes         add column if not exists household_id uuid;
alter table public.plans          add column if not exists household_id uuid;
alter table public.shopping_items add column if not exists household_id uuid;

-- ------------------------------------------------------------
--  3. Backfill: un hogar 'Mi hogar' + membership owner por cuenta
-- ------------------------------------------------------------

-- El lock de aviso serializa dos corridas simultáneas: el NOT EXISTS
-- solo ve commits ajenos, así que sin lock ambas podrían crear un
-- hogar para la misma cuenta. En corridas secuenciales el NOT EXISTS
-- ya garantiza que no se duplique nada.
do $$
declare
  v_row          record;
  v_household_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('comidas_migration_hogares_backfill')::bigint);

  for v_row in
    select u.id as user_id
    from auth.users u
    where not exists (
      select 1 from public.household_members hm where hm.user_id = u.id
    )
  loop
    insert into public.households as h (name, created_by)
    values ('Mi hogar', v_row.user_id)
    returning h.id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_row.user_id, 'owner')
    on conflict (household_id, user_id) do nothing;
  end loop;
end $$;

-- Asociamos cada fila al hogar de quien la escribió.
update public.dishes d
   set household_id = hm.household_id
  from public.household_members hm
 where d.household_id is null
   and hm.user_id = d.user_id;

update public.plans p
   set household_id = hm.household_id
  from public.household_members hm
 where p.household_id is null
   and hm.user_id = p.user_id;

update public.shopping_items s
   set household_id = hm.household_id
  from public.household_members hm
 where s.household_id is null
   and hm.user_id = s.user_id;

-- Guardia: en el esquema original user_id es NOT NULL con FK, así que
-- el backfill cubre el 100% de las filas. Si algo quedó suelto (por una
-- corrida previa interrumpida), avisamos con un mensaje claro en vez de
-- dejar que SET NOT NULL falle con un error críptico.
do $$
declare
  v_pending bigint;
begin
  select
      (select count(*) from public.dishes         where household_id is null)
    + (select count(*) from public.plans          where household_id is null)
    + (select count(*) from public.shopping_items where household_id is null)
    into v_pending;

  if v_pending > 0 then
    raise exception
      'Backfill incompleto: % filas sin household_id. Revisá las filas con user_id huérfano antes de continuar.',
      v_pending;
  end if;
end $$;

-- ------------------------------------------------------------
--  4. user_id: nullable y SIN foreign key a auth.users
-- ------------------------------------------------------------

-- El nombre de la constraint es autogenerado (p. ej. dishes_user_id_fkey)
-- y puede variar entre proyectos, así que se busca dinámicamente en
-- pg_constraint. Solo quitamos FKs cuyo destino sea auth.users.
do $$
declare
  v_table      text;
  v_constraint text;
begin
  foreach v_table in array array['dishes', 'plans', 'shopping_items'] loop
    for v_constraint in
      select c.conname
      from pg_constraint c
      where c.conrelid = format('public.%I', v_table)::regclass
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
    loop
      execute format(
        'alter table public.%I drop constraint %I', v_table, v_constraint
      );
    end loop;
  end loop;
end $$;

-- Motivo: al borrar una cuenta, los datos del hogar compartido NO deben
-- borrarse por cascade. user_id queda solo como metadata de autoría.
alter table public.dishes         alter column user_id drop not null;
alter table public.plans          alter column user_id drop not null;
alter table public.shopping_items alter column user_id drop not null;

-- ------------------------------------------------------------
--  5. household_id NOT NULL + FK, unique de planes e índices
-- ------------------------------------------------------------

alter table public.dishes         alter column household_id set not null;
alter table public.plans          alter column household_id set not null;
alter table public.shopping_items alter column household_id set not null;

-- El nombre de la constraint lo elegimos nosotros, así que DROP IF EXISTS
-- basta para que la migración se pueda re-correr sin duplicar FKs.
alter table public.dishes drop constraint if exists dishes_household_id_fkey;
alter table public.dishes add constraint dishes_household_id_fkey
  foreign key (household_id) references public.households (id) on delete cascade;

alter table public.plans drop constraint if exists plans_household_id_fkey;
alter table public.plans add constraint plans_household_id_fkey
  foreign key (household_id) references public.households (id) on delete cascade;

alter table public.shopping_items drop constraint if exists shopping_items_household_id_fkey;
alter table public.shopping_items add constraint shopping_items_household_id_fkey
  foreign key (household_id) references public.households (id) on delete cascade;

-- Unique de planes: de (user_id, week_start, day) a
-- (household_id, week_start, day). El backfill crea un hogar por usuario,
-- así que no hay duplicados al crear la constraint nueva.
alter table public.plans drop constraint if exists plans_user_id_week_start_day_key;
alter table public.plans drop constraint if exists plans_household_week_day_key;
alter table public.plans add constraint plans_household_week_day_key
  unique (household_id, week_start, day);

create index if not exists dishes_household_created_idx
  on public.dishes (household_id, created_at desc);
create index if not exists plans_household_week_idx
  on public.plans (household_id, week_start);
create index if not exists shopping_household_week_idx
  on public.shopping_items (household_id, week_start);

-- Se conservan los índices viejos por user_id: no estorban y siguen
-- siendo útiles para auditar autoría.

-- ------------------------------------------------------------
--  6. Helper de RLS (la única vía para evitar recursión)
-- ------------------------------------------------------------

-- SECURITY DEFINER hace que la consulta a household_members se ejecute
-- como el dueño de la tabla, que bypassa RLS. Por eso las policies de
-- household_members pueden llamar a esta función sin recursión infinita.
-- Importante: NO usar "force row level security" en household_members.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
--  7. Row Level Security
-- ------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists "households_member_select" on public.households;
create policy "households_member_select" on public.households
  for select using (public.is_household_member(id));

-- Solo SELECT: las escrituras pasan exclusivamente por funciones
-- security definer, para que nadie pueda auto-asignarse memberships.
drop policy if exists "household_members_member_select" on public.household_members;
create policy "household_members_member_select" on public.household_members
  for select using (
    user_id = auth.uid()
    or public.is_household_member(household_id)
  );

drop policy if exists "household_invites_member_select" on public.household_invites;
create policy "household_invites_member_select" on public.household_invites
  for select using (public.is_household_member(household_id));

-- Reemplazo de las 3 policies owner_all. Mantenemos los nombres
-- originales a propósito: si alguien vuelve a correr schema.sql, no
-- quedan dos policies FOR ALL superpuestas (permissive = se OR'ean).
drop policy if exists "dishes_owner_all" on public.dishes;
create policy "dishes_owner_all" on public.dishes
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "plans_owner_all" on public.plans;
create policy "plans_owner_all" on public.plans
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "shopping_owner_all" on public.shopping_items;
create policy "shopping_owner_all" on public.shopping_items
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ------------------------------------------------------------
--  8. Funciones RPC (security definer)
-- ------------------------------------------------------------

-- Crea el hogar 'Mi hogar' del usuario si no tiene ninguno.
-- El lock por usuario serializa dos primeros inicios de sesión simultáneos.
create or replace function public.ensure_household()
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  perform pg_advisory_xact_lock(hashtext('comidas_ensure_household_' || v_uid::text)::bigint);

  if not exists (
    select 1 from public.household_members hm where hm.user_id = v_uid
  ) then
    insert into public.households as h (name, created_by)
    values ('Mi hogar', v_uid)
    returning h.id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_uid, 'owner')
    on conflict (household_id, user_id) do nothing;
  end if;

  return query
    select h.id, h.name
    from public.households h
    join public.household_members hm on hm.household_id = h.id
    where hm.user_id = v_uid
    order by hm.joined_at desc, h.id
    limit 1;
end $$;

create or replace function public.my_household()
returns table (id uuid, name text, role text, member_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  -- ensure_household valida la sesión y crea el hogar si hace falta.
  select e.id into v_household_id
  from public.ensure_household() e;

  return query
    select h.id,
           h.name,
           hm.role,
           (select count(*)
              from public.household_members x
             where x.household_id = h.id)
    from public.households h
    join public.household_members hm
      on hm.household_id = h.id
     and hm.user_id = v_uid
    where h.id = v_household_id;
end $$;

-- El join con auth.users solo es posible porque la función es
-- security definer: el rol authenticated no lee auth.users directamente.
create or replace function public.household_members_list()
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select hm.user_id,
         u.email::text,
         hm.role,
         hm.joined_at
  from public.ensure_household() e
  join public.household_members hm on hm.household_id = e.id
  join auth.users u on u.id = hm.user_id
  order by hm.joined_at, hm.user_id;
$$;

create or replace function public.household_invite_create()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_household_id uuid;
  v_token        uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  select e.id into v_household_id
  from public.ensure_household() e;

  if not public.is_household_member(v_household_id) then
    raise exception 'No sos miembro de este hogar.';
  end if;

  insert into public.household_invites as hi (household_id, created_by)
  values (v_household_id, v_uid)
  returning hi.token into v_token;

  return v_token;
end $$;

create or replace function public.household_invite_list()
returns table (
  token      uuid,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  used_count integer
)
language sql
security definer
set search_path = public
as $$
  select hi.token,
         hi.created_at,
         hi.expires_at,
         hi.revoked_at,
         hi.used_count
  from public.ensure_household() e
  join public.household_invites hi on hi.household_id = e.id
  order by hi.created_at desc, hi.token;
$$;

create or replace function public.household_invite_revoke(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select hi.household_id into v_household_id
  from public.household_invites hi
  where hi.token = p_token;

  if v_household_id is null then
    raise exception 'Invitación inválida o vencida';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception 'No sos miembro de este hogar.';
  end if;

  update public.household_invites hi
     set revoked_at = now()
   where hi.token = p_token
     and hi.revoked_at is null;
end $$;

-- No requiere membership: la usa el invitado para ver el hogar antes
-- de decidir si se une. Si el token no es válido devuelve 0 filas.
create or replace function public.household_invite_info(p_token uuid)
returns table (
  household_id   uuid,
  household_name text,
  member_count   bigint,
  expires_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select hi.household_id,
         h.name,
         (select count(*)
            from public.household_members hm
           where hm.household_id = hi.household_id),
         hi.expires_at
  from public.household_invites hi
  join public.households h on h.id = hi.household_id
  where hi.token = p_token
    and hi.revoked_at is null
    and hi.expires_at > now();
$$;

create or replace function public.household_join(p_token uuid)
returns table (household_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_dest   uuid;
  v_origin uuid;
  v_name   text;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  -- Validación idéntica a household_invite_info.
  select hi.household_id into v_dest
  from public.household_invites hi
  where hi.token = p_token
    and hi.revoked_at is null
    and hi.expires_at > now();

  if v_dest is null then
    raise exception 'Invitación inválida o vencida';
  end if;

  select h.name into v_name
  from public.households h
  where h.id = v_dest;

  -- Join idempotente: si ya pertenece al destino no movemos nada.
  if exists (
    select 1
    from public.household_members hm
    where hm.household_id = v_dest
      and hm.user_id = v_uid
  ) then
    return query select v_dest, v_name;
    return;
  end if;

  -- Hogar actual del usuario (lo crea si no tiene ninguno).
  select e.id into v_origin
  from public.ensure_household() e;

  if v_origin is null then
    raise exception 'No se pudo determinar el hogar de origen.';
  end if;

  -- Guardia defensiva: nunca queremos borrar el hogar destino.
  if v_origin = v_dest then
    return query select v_dest, v_name;
    return;
  end if;

  -- Colisión del unique (household_id, week_start, day): si el destino ya
  -- tiene un plan para ese día, DESCARTAMOS el plan del origen ANTES del
  -- update. El destino gana. Sin este DELETE el UPDATE violaría
  -- plans_household_week_day_key cuando ambos hogares planificaron el
  -- mismo día de la misma semana.
  delete from public.plans p
  where p.household_id = v_origin
    and exists (
      select 1
      from public.plans d
      where d.household_id = v_dest
        and d.week_start = p.week_start
        and d.day = p.day
    );

  -- Movemos TODAS las filas del origen al destino. La función es
  -- security definer: sin eso, RLS rechazaría el WITH CHECK del destino
  -- porque el usuario todavía no es miembro de ese hogar.
  update public.dishes d
     set household_id = v_dest
   where d.household_id = v_origin;

  update public.plans p
     set household_id = v_dest
   where p.household_id = v_origin;

  update public.shopping_items s
     set household_id = v_dest
   where s.household_id = v_origin;

  -- Salida del hogar origen.
  delete from public.household_members hm
  where hm.household_id = v_origin
    and hm.user_id = v_uid;

  -- Si el origen quedó sin miembros se borra: el cascade limpia cualquier
  -- dato huérfano que no se haya movido.
  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = v_origin
  ) then
    delete from public.households h where h.id = v_origin;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_dest, v_uid, 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_invites hi
     set used_count = hi.used_count + 1
   where hi.token = p_token;

  return query select v_dest, v_name;
end $$;

create or replace function public.household_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  select e.id into v_household_id
  from public.ensure_household() e;

  -- Los datos NO se mueven: quedan en el hogar anterior, a disposición
  -- de los miembros que sigan en él.
  delete from public.household_members hm
  where hm.household_id = v_household_id
    and hm.user_id = v_uid;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = v_household_id
  ) then
    delete from public.households h where h.id = v_household_id;
  end if;

  -- El usuario queda con un hogar nuevo y vacío.
  select e.id into v_household_id
  from public.ensure_household() e;
end $$;

create or replace function public.household_rename(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_name         text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  select e.id into v_household_id
  from public.ensure_household() e;

  if not public.is_household_member(v_household_id) then
    raise exception 'No sos miembro de este hogar.';
  end if;

  if v_name = '' then
    raise exception 'El nombre del hogar no puede estar vacío.';
  end if;

  if char_length(v_name) > 60 then
    raise exception 'El nombre del hogar no puede superar los 60 caracteres.';
  end if;

  update public.households h
     set name = v_name
   where h.id = v_household_id;
end $$;

-- ------------------------------------------------------------
--  9. Reemplazo de delete_my_account()
-- ------------------------------------------------------------

-- Ya no alcanza con borrar auth.users y confiar en el cascade: el
-- cascade borraría también los datos de un hogar compartido. Primero
-- sacamos al usuario de sus hogares y solo borramos los hogares que
-- quedaron vacíos (esos sí se limpian por cascade).
-- La función original era LANGUAGE SQL. Dropeamos y recreamos para pasar a
-- plpgsql sin depender de qué permite cambiar CREATE OR REPLACE (los grants
-- se vuelven a aplicar en la sección 10).
drop function if exists public.delete_my_account();

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_household_ids  uuid[];
begin
  if v_uid is null then
    raise exception 'Se requiere sesión (auth.uid() es null).';
  end if;

  select array_agg(hm.household_id) into v_household_ids
  from public.household_members hm
  where hm.user_id = v_uid;

  delete from public.household_members hm
  where hm.user_id = v_uid;

  delete from public.households h
  where h.id = any (coalesce(v_household_ids, '{}'::uuid[]))
    and not exists (
      select 1
      from public.household_members hm
      where hm.household_id = h.id
    );

  -- Recién ahora borramos la cuenta. Como user_id ya no tiene FK, las
  -- filas de hogares con otros miembros sobreviven con user_id huérfano
  -- (solo metadata de autoría).
  delete from auth.users u where u.id = v_uid;
end $$;

-- ------------------------------------------------------------
--  10. Grants de ejecución
-- ------------------------------------------------------------

-- Helper de RLS: las policies se evalúan con el rol que consulta, así
-- que anon TAMBIÉN necesita EXECUTE. Si no, un SELECT anónimo fallaría
-- con "permission denied" en vez de devolver 0 filas.
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to anon, authenticated;

-- Resto de las funciones: solo usuarios autenticados vía RPC.
revoke all on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;

revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

revoke all on function public.household_members_list() from public, anon;
grant execute on function public.household_members_list() to authenticated;

revoke all on function public.household_invite_create() from public, anon;
grant execute on function public.household_invite_create() to authenticated;

revoke all on function public.household_invite_list() from public, anon;
grant execute on function public.household_invite_list() to authenticated;

revoke all on function public.household_invite_revoke(uuid) from public, anon;
grant execute on function public.household_invite_revoke(uuid) to authenticated;

revoke all on function public.household_invite_info(uuid) from public, anon;
grant execute on function public.household_invite_info(uuid) to authenticated;

revoke all on function public.household_join(uuid) from public, anon;
grant execute on function public.household_join(uuid) to authenticated;

revoke all on function public.household_leave() from public, anon;
grant execute on function public.household_leave() to authenticated;

revoke all on function public.household_rename(text) from public, anon;
grant execute on function public.household_rename(text) to authenticated;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ------------------------------------------------------------
--  11. Verificación
-- ------------------------------------------------------------

-- Consultas útiles para confirmar a mano:
--   select count(*) from public.households;
--   select count(*) from public.household_members;
--   select count(*) from public.household_invites;
--   select count(*) from public.dishes         where household_id is null;  -- 0
--   select count(*) from public.plans          where household_id is null;  -- 0
--   select count(*) from public.shopping_items where household_id is null;  -- 0
--   select conname, contype from pg_constraint
--     where conrelid = 'public.plans'::regclass order by conname;
--   select tablename, policyname from pg_policies
--     where schemaname = 'public' order by tablename, policyname;
-- Con un JWT de usuario:
--   select * from public.my_household();
--   select * from public.household_members_list();

do $$
declare
  v_households       bigint;
  v_members          bigint;
  v_users_sin_hogar  bigint;
  v_filas_sin_hogar  bigint;
begin
  select count(*) into v_households from public.households;
  select count(*) into v_members from public.household_members;

  select count(*) into v_users_sin_hogar
  from auth.users u
  where not exists (
    select 1 from public.household_members hm where hm.user_id = u.id
  );

  select
      (select count(*) from public.dishes         where household_id is null)
    + (select count(*) from public.plans          where household_id is null)
    + (select count(*) from public.shopping_items where household_id is null)
    into v_filas_sin_hogar;

  raise notice
    'Comidas · migración hogares: % hogares, % memberships, % cuentas sin hogar, % filas de datos sin household_id',
    v_households, v_members, v_users_sin_hogar, v_filas_sin_hogar;

  if v_filas_sin_hogar > 0 then
    raise warning 'Hay filas de datos sin household_id: revisalas antes de cerrar la migración.';
  end if;

  -- Las cuentas creadas DESPUÉS de migrar todavía no tienen hogar: lo
  -- obtienen de forma diferida en su primer RPC (my_household /
  -- ensure_household). No es un error.
  if v_users_sin_hogar > 0 then
    raise notice
      'Hay % cuenta(s) sin membership: esperable si se registraron después de migrar; se resuelve en el primer RPC.',
      v_users_sin_hogar;
  end if;
end $$;
