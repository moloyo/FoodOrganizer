# Propuesta · Varios platos por día (borrador)

> **Estado:** diseño en discusión. Rama `feature/multi-platos`, creada desde `main` (`e0d3b6b`).
> **No se aplicó ninguna migración, no se desplegó nada y `main` sigue intacto.**
> Guía del proyecto: [`DESARROLLO.md`](DESARROLLO.md) · Estado: [`ESTADO.md`](ESTADO.md).

## 1. Objetivo

Hoy cada día tiene **exactamente un plato**. Queremos que un día pueda tener **más de una
preparación** sin romper la experiencia actual (PWA, cuenta, hogar compartido, compras,
historial, offline).

### Ambigüedad a resolver primero

"Más de una comida" puede querer decir dos cosas distintas:

- **A. Varios platos en la misma cena** (ej.: «milanesas + ensalada + postre»). La app sigue
  siendo *solo cenas*; cambia la cardinalidad plato ↔ día.
- **B. Varias franjas de comida por día** (ej.: almuerzo y cena). Cambia el alcance del
  producto y probablemente el nombre/tagline, el contador "N de 7 cenas" y la navegación.

Esta propuesta asume **A** y deja **B** como una extensión futura (se podría agregar una
columna `meal` más adelante). Si la intención es B, hay que rediseñar desde el punto 2.

## 2. Modelo actual y por qué no alcanza

| Pieza | Hoy |
| --- | --- |
| `plans` | 1 fila por `(household_id, week_start, day)` con `mode`, `dish_id`, `note`. Unique `plans_household_week_day_key`. |
| `DayPlan` / `PlanRow` | `{ day, mode, dishId, note }` — un solo `dishId`. |
| `AppContext.days` | `useMemo` que busca **la** fila del día y arma 7 `DayPlan`. |
| Acciones | `setDayDish(day, dishId)`, `shuffleDay`, `fillEmptyDays`, `repeatWeek`, `persistDay` → un `savePlan`. |
| `DayCard` | Muestra una tarjeta con un plato y 3 botones (cambiar / sorprender / quitar). |
| `buildShoppingItems(days, dishes)` | Recorre los 7 días, toma `day.dishId` y junta ingredientes (ya unifica nombres y unidades). |
| `shoppingOutdated` | Compara los `dishId` planificados contra los de la lista generada. |
| `Snapshot` | `version: 1`, `plans: PlanRow[]` con `dishId`. |
| Cola offline | `savePlan` hace un `upsert` por día; no hay que cambiar su forma si seguimos con 1 fila por día. |

El cuello de botella es **`dish_id` escalar** y el **`unique` por día**. Todo lo demás deriva de ahí.

## 3. Opciones de modelo de datos

### Opción A · `dish_ids jsonb` en la misma fila (recomendada)

Agregar `plans.dish_ids jsonb not null default '[]'::jsonb`. El orden del array es el orden de
la cena (principal primero). `dish_id` queda como columna **legacy** con el primer plato.

- ✅ No cambia el `unique`, ni el RLS, ni los índices, ni la forma del `upsert`.
- ✅ La cola offline y `savePlan` siguen siendo **una operación por día**.
- ✅ Migración trivial e idempotente: `update ... set dish_ids = jsonb_build_array(dish_id)`.
- ✅ Durante la transición se puede poner un **trigger** que mantenga `dish_id = dish_ids[0]`,
  así la app vieja sigue funcionando si alguien la usa antes del deploy nuevo.
- ⚠️ No hay FK por elemento: al borrar un plato hay que sacar su id de todos los arrays
  (hoy `deleteDish` ya limpia `plans.dishId` en memoria; habría que hacerlo también en la base).
- ⚠️ El orden se guarda en el array (no hay `position` consultable por SQL).

### Opción B · Tabla hija `plan_dishes`

`plan_dishes(household_id, week_start, day, position, dish_id)` con FK a `plans`/`dishes` y RLS
propia.

- ✅ Integridad referencial real, `on delete cascade` limpia solo.
- ✅ Consultas SQL por plato y por posición.
- ⚠️ Nueva tabla + políticas + índices; el adaptador pasa a escribir **varias filas por día**
  (y la cola offline necesita una operación nueva tipo `setDayDishes` atómica).
- ⚠️ `savePlan` deja de alcanzar; más superficie de cambio y más riesgo en el merge.

### Opción C · Columnas fijas `dish_id_1/2/3`

Simple pero rígida (tope 3), contamina el schema y obliga a re-migrar si el límite cambia.
**Descartada.**

### Opción D · Franjas (`meal`)

Válida solo si se elige el alcance **B**. Agrega `meal text` a la clave única y multiplica la UI
por franja. **Fuera de esta propuesta.**

## 4. Semántica propuesta

- Un día = **una cena con 0..N platos**. Tope blando de **3 o 4** para que la tarjeta no se
  vuelva infinita en el celular (definir).
- `mode` (dificultad) y `note` siguen siendo **del día**, no del plato.
  - Al cambiar la dificultad se conservan los platos que siguen cumpliendo `matchesMode` y se
    quitan los que no (hoy ya se hace con el plato único, con aviso).
- `dishIds[0]` se considera el **plato principal**; el resto, acompañamientos. Solo informativo
  para la UI y las sugerencias.
- Reordenar con botones ↑/↓ (sin drag & drop en el MVP).
- **Sugerencias**: "Sorpréndeme" por día agrega **un** plato más sin repetir los ya elegidos esa
  semana; "Sorpréndeme" de semana sigue completando **1 plato por día** y el usuario suma el
  resto a mano. Alternativa: cantidad configurable por día en Ajustes (decidir).
- **Compras**: `buildShoppingItems` itera **todos** los `dishIds` del día. La unificación de
  nombres/unidades ya suma entre platos ("Queso" en dos recetas → una línea). `shoppingOutdated`
  compara el conjunto completo de ids. Los ítems generados guardan el `dishId` del primer plato
  que aportó el ingrediente (o se puede pasar a `dishIds` si se quiere trazar).
- **Historial**: `repeatWeek` copia el array completo. Las semanas con actividad se derivan de
  `mode || dishIds.length > 0`.
- **Backup**: `Snapshot.version` pasa a **2** con `plans[].dishIds`. `importAll` acepta v1
  (`dishId` → `[dishId]`) y v2, para no romper copias viejas.

## 5. Migración y compatibilidad con usuarios actuales

```sql
alter table public.plans
  add column if not exists dish_ids jsonb not null default '[]'::jsonb;

update public.plans
   set dish_ids = jsonb_build_array(dish_id)
 where dish_id is not null
   and dish_ids = '[]'::jsonb;
```

- Idempotente; no toca `dish_id`, no toca el `unique`, no toca el RLS.
- **Trigger de compatibilidad** (opcional pero recomendado): antes de insert/actualizar,
  sincronizar `dish_id = (dish_ids->>0)::uuid`. Así, si la app vieja escribe `dish_id`, la nueva
  lo ve; y si la nueva escribe `dish_ids`, la vieja sigue viendo el principal.
- Al igual que con hogares, **schema y cliente se despliegan juntos**. Mientras esta rama no se
  mergee, producción sigue con el modelo de 1 plato.
- Los 21 platos / 7 planes / 32 compras actuales no se pierden: el backfill convierte cada
  `dish_id` en un array de un elemento.

## 6. Impacto por archivo (cuando se implemente)

| Archivo | Cambio |
| --- | --- |
| `supabase/migration_multi_platos.sql` | Nueva: columna `dish_ids`, backfill, trigger de compatibilidad. |
| `src/types.ts` | `DayPlan` / `PlanRow`: `dishIds: string[]` (+ `dishId` derivado durante la transición); `Snapshot.version: 2`. |
| `src/lib/adapters/cloud.ts` | Mapear `dish_ids ↔ dishIds`, enviar ambas columnas, limpiar ids al borrar plato. |
| `src/lib/adapters/offline.ts` | Sin cambio de forma (sigue `savePlan`), pero la caché de planes cambia de forma → invalidar `comidas:cache:v1` con prefijo v2. |
| `src/lib/adapters/local.ts` | Stub para E2E con arrays. |
| `src/state/AppContext.tsx` | `days`, `persistDay`, `setDayDish` → `addDayDish`/`removeDayDish`/`moveDayDish`, `plannedDishIds`, `shoppingOutdated`, `repeatWeek`, `fillEmptyDays`, `shuffleDay`. |
| `src/lib/suggest.ts` | `buildShoppingItems` itera `dishIds`; `suggestWeek` sin repetir entre todos los platos. |
| `src/components/DayCard.tsx` | Lista de platos por día con agregar / ver / sugerir / quitar / reordenar. |
| `src/screens/WeekScreen.tsx` | Contador "N de 7 cenas" → distinguir *días planificados* de *platos totales*; `DishPickerSheet` recibe el día y agrega. |
| `src/screens/HistoryScreen.tsx` | Detalle con varios platos. |
| `tests/` | Lógica pura (sugerencias sin repetir, compras con 2 platos, merge) + E2E de agregar/quitar. |
| `docs/` | Actualizar modelo de datos, decisiones y bitácora. |

## 7. Riesgos

- **Conflictos de edición simultánea en el hogar**: hoy `savePlan` es un `upsert` de la fila del
  día; con un array, dos personas agregando un plato al mismo día pueden pisarse (igual que hoy
  con `replaceShopping`). Mitigación: escribir siempre el array completo desde el estado local
  y, si se quiere robustez, un RPC `append_day_dish(week, day, dish_id)` con `jsonb_insert` en
  la base (según la Opción A).
- **`dish_id` legacy**: si se deja de mantener, un rollback al cliente viejo perdería los platos
  agregados. El trigger evita eso.
- **UI en 390 px**: 3-4 platos por día hacen la tarjeta alta; evaluar colapsar los
  acompañamientos o un máximo visible con "ver más".
- **Backups v1**: hay que seguir aceptándolos en `importAll`.

## 8. Plan de trabajo en la rama

1. Cerrar las decisiones de la sección 9 (este documento + preguntas al usuario).
2. Tipos + lógica pura + tests (sin tocar Supabase ni la UI).
3. Migración SQL + adaptador (cloud / local / offline).
4. UI (DayCard, WeekScreen, HistoryScreen).
5. Verificación local: `npm test`, `npm run test:e2e`, `npm run build`.
6. Verificación real con dos cuentas temporales sobre un **deploy de preview**, sin tocar `main`.
7. Recién ahí: merge a `main`, aplicar migración y desplegar juntos.

## 9. Decisiones pendientes

1. ¿Alcance **A** (varios platos en la cena) o **B** (franjas almuerzo/cena)?
2. ¿Modelo **A** (`jsonb`) o **B** (tabla hija)?
3. ¿Cómo se reparten las sugerencias ("Sorpréndeme") con varios platos?
4. ¿La dificultad del día aplica a todos los platos o cada plato tiene la suya?
5. ¿Tope de platos por día (3 / 4 / sin límite con colapso)?
