-- ============================================================
--  Comidas · Migración "N comidas por día"
--
--  Ejecutá este archivo COMPLETO en el SQL Editor de Supabase,
--  DESPUÉS de schema.sql y de migration_hogares.sql.
--
--  Es idempotente: se puede correr dos veces sin romper nada.
--
--  IMPORTANTE: esta migración cambia el UNIQUE de plans. El cliente
--  viejo hace upsert con onConflict 'household_id,week_start,day',
--  que deja de existir. Por eso MIGRACIÓN Y DEPLOY VAN JUNTOS
--  (mismo playbook que hogares): hay una ventana breve. Mientras la
--  rama feature/multi-platos no se mergee, main no se toca.
-- ============================================================

-- 1. Cada comida del día ocupa una fila, diferenciada por `slot`.
--    El default 0 hace que las filas existentes (1 por día) sigan
--    siendo "la primera comida" SIN backfill.
alter table public.plans
  add column if not exists slot smallint not null default 0;

-- 2. El unique por día impide dos comidas: lo reemplazamos por
--    (día, slot). Se dropean ambos nombres para poder re-correr.
alter table public.plans drop constraint if exists plans_household_week_day_key;
alter table public.plans drop constraint if exists plans_household_week_day_slot_key;

alter table public.plans
  add constraint plans_household_week_day_slot_key
  unique (household_id, week_start, day, slot);

-- 3. Índice de lectura por día (el de hogares sigue estando).
create index if not exists plans_household_week_day_slot_idx
  on public.plans (household_id, week_start, day, slot);

-- 4. RLS: sin cambios. Sigue siendo is_household_member(household_id),
--    porque la columna nueva no cambia la pertenencia al hogar.

-- 5. Verificación
--    Consultas útiles:
--      select week_start, day, slot, count(*)
--        from public.plans group by 1, 2, 3 order by 1, 2, 3;
--      select conname, contype from pg_constraint
--        where conrelid = 'public.plans'::regclass order by conname;
do $$
declare
  v_filas    bigint;
  v_sin_slot bigint;
  v_max_slot smallint;
begin
  select count(*) into v_filas from public.plans;
  select count(*) into v_sin_slot from public.plans where slot is null;
  select coalesce(max(slot), 0) into v_max_slot from public.plans;

  raise notice
    'Comidas · migración N comidas/día: % filas, % sin slot, slot máximo %',
    v_filas, v_sin_slot, v_max_slot;

  if v_sin_slot > 0 then
    raise warning 'Hay filas de plans sin slot: revisalas antes de cerrar la migración.';
  end if;
end $$;
