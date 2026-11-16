# Propuesta · Varias comidas por día (secciones repetibles)

> **Estado:** diseño en discusión. Rama `feature/multi-platos`, creada desde `main` (`e0d3b6b`).
> **No se aplicó ninguna migración, no se desplegó nada y `main` sigue intacto.**
> Reemplaza a los borradores anteriores, que inventaban nombres/catálogos de comidas.
> Guía del proyecto: [`DESARROLLO.md`](DESARROLLO.md) · Estado: [`ESTADO.md`](ESTADO.md).

## 1. Qué se pide (definitivo)

Un día puede tener **más de una comida**, pero:

- **No hay nombres de comidas** ("Almuerzo", "Cena", "Desayuno"). No se etiquetan.
- **No hay catálogo de comidas ni configuración por hogar.** El único catálogo es el
  recetario (`dishes`), compartido por todos: los platos disponibles son siempre los mismos.
- Cada comida es **la misma sección de hoy repetida**: dificultad (`ModeChips`), **un** plato,
  y nota.
- Un botón **"+"** al pie del día agrega otra sección igual, vacía. Cada sección se puede
  quitar.
- **Cada día tiene la cantidad de secciones que el usuario quiera**: puede haber un martes con
  2 y los otros seis días con 1. No hay plantilla semanal.

**Default: 1 sección por día ⇒ idéntico a la app actual** (mismas tarjetas, mismo contador,
mismos textos, mismos tests). Los usuarios actuales no ven ningún cambio hasta que tocan "+".

## 2. Decisiones cerradas

| Decisión | Respuesta |
| --- | --- |
| Alcance | N secciones por día, sin nombres ni catálogo nuevo. |
| Platos por sección | **Uno**. "Agregar a mano" = agregar otra sección o cambiar el plato. |
| Dificultad | **Por sección**: cada una tiene su propio modo y eso filtra sus sugerencias. |
| Nota | **Por sección** (es parte de la sección que se repite). |
| Sugerencias | "Sorpréndeme" elige 1 plato por sección; el resto se agrega a mano. |
| Sorpréndeme de semana | Llena **todas las secciones vacías** de la semana, sin repetir platos. |
| Vista | **Agrupar por día**: una `DayCard` con N secciones apiladas. |
| Franjas / labels / Ajustes → Comidas | **No existen.** Se descartan. |

## 3. Modelo de datos (decisión de implementación, ya resuelta)

`plans` pasa de **1 fila por día** a **N filas por día**, diferenciadas por una posición:

```sql
alter table public.plans
  add column if not exists slot smallint not null default 0;

alter table public.plans
  drop constraint if exists plans_household_week_day_key;

alter table public.plans
  add constraint plans_household_week_day_slot_key
  unique (household_id, week_start, day, slot);
```

- **Sin backfill**: las 7 filas actuales quedan en `slot = 0` por el default.
- `mode`, `dish_id` y `note` pasan a ser **de la sección**.
- RLS (`is_household_member(household_id)`) e índices: **sin cambios**. No hay tablas nuevas.
- Cola offline: `savePlan` sigue siendo un `upsert` por fila; `onConflict` pasa a
  `household_id,week_start,day,slot`. Agregar/quitar/reordenar secciones reescribe los `slot`
  de ese día (una operación por día, como hoy con `replaceShopping`).
- `slot` es un número, no una etiqueta: solo define el orden de las secciones en la tarjeta.

### Corrección importante sobre compatibilidad

En los borradores anteriores decía que no había ventana de caída. **Con este modelo no es
cierto**: el `unique (household_id, week_start, day)` impide dos filas por día, así que hay que
dropearlo, y el cliente viejo usa `onConflict: 'household_id,week_start,day'`, que deja de
existir. No hay trigger que lo salve.

Por eso, al mergear se repite el playbook de hogares: **migración SQL y deploy del cliente
juntos**, con una ventana breve. Mientras trabajamos en esta rama, `main` no se toca, así que
**ningún usuario actual se ve afectado**. La rama existe justamente para estar seguros antes de
ese momento.

## 4. Estructura en memoria

```ts
interface MealEntry {
  slot: number
  mode: DayMode | null
  dishId: string | null
  note: string
}
interface DayMeals {
  day: number
  meals: MealEntry[]   // ordenadas por slot
}
```

`days` pasa a ser `DayMeals[]`. `allPlans` sigue siendo la lista plana de filas; `AppContext`
las agrupa por `(weekStart, day)` y ordena por `slot`.

## 5. Cambios por archivo

| Archivo | Cambio |
| --- | --- |
| `supabase/migration_comidas_por_dia.sql` | Nueva: columna `slot`, nuevo unique. Idempotente. |
| `src/types.ts` | `MealEntry`, `DayMeals`; `PlanRow` suma `slot`; `Snapshot.version: 2`. |
| `src/lib/adapters/cloud.ts` | Mapear `slot`, cambiar `onConflict`, enviar `slot` en inserts/upserts. |
| `src/lib/adapters/local.ts` | Stub con `slot` para E2E. |
| `src/lib/adapters/offline.ts` | Prefijo de caché `comidas:cache:v2` (cambia la forma de los planes). |
| `src/state/AppContext.tsx` | `days`, `persistDay` → `persistMeal`, `addMeal`, `removeMeal`, `moveMeal`, `setMealMode/Dish/Note`, `shuffleMeal`, `fillEmptyMeals`, `plannedDishIds`, `shoppingOutdated`, `repeatWeek`, `clearWeek`. |
| `src/lib/suggest.ts` | `buildShoppingItems` recorre día → sección → plato; `suggestWeek` no repite platos entre todas las secciones. |
| `src/components/DayCard.tsx` | Contenedor del día + N secciones (cada una con `ModeChips`, plato, nota, X) + botón "+". |
| `src/screens/WeekScreen.tsx` | Contador y textos derivados de la cantidad real de secciones; `DishPickerSheet` recibe `(día, slot)`. |
| `src/screens/HistoryScreen.tsx` | Detalle con varias secciones por día. |
| `tests/` | Lógica pura (sugerencias sin repetir con N secciones, compras con 2 secciones, compactado de slots) + E2E de agregar/quitar sección. |
| `docs/` | Modelo de datos, decisiones y bitácora. |

**No se tocan:** hogares, invitaciones, autenticación, temas, PWA, compras (salvo el recorrido
de planes), ni `households`.

## 6. Detalles que decido yo (no requieren respuesta)

- "+" agrega una sección **vacía**: sin dificultad, sin plato, sin nota.
- Cada sección tiene su **X** para quitarse; al quitar se recompactan los `slot` del día.
- Reordenar con ↑/↓ se deja para una segunda iteración (el orden de creación alcanza).
- **Contador y textos:** mientras todos los días tengan 1 sección se conserva literalmente
  **"N de 7 cenas"** y el subtítulo "Solo cenas" (así los 6 tests E2E siguen pasando sin
  cambios y los usuarios no notan nada). Si algún día tiene más de una, pasa a
  **"N de M comidas"** y un subtítulo neutro.
- `clearWeek` borra todas las filas de la semana; `repeatWeek` copia todas las secciones;
  `history` considera semanas con `mode` o `dishId` en cualquier sección.
- Backup `version: 2` con `plans[].slot`; `importAll` acepta v1 asumiendo `slot = 0`.
- `shoppingOutdated` compara el conjunto completo de `dish_id` de todas las secciones.

## 7. Riesgos

- **Ventana de migración + deploy** coordinada (ya practicada con hogares). Se confirma en un
  preview antes de tocar `main`.
- **Reescribir los `slot` de un día** es una operación multi-fila no transaccional, igual que
  `replaceShopping`. Aceptable para el volumen actual.
- **Edición simultánea en el hogar**: dos personas agregando secciones al mismo día pueden
  pisarse (igual que hoy con la lista de compras). Aceptable para el MVP.
- **Densidad en 390 px**: con 2–3 secciones la tarjeta crece; las secciones vacías se muestran
  colapsadas.
- **Backups v1**: `importAll` debe seguir aceptándolos.

## 8. Plan de trabajo en la rama

1. Confirmar este diseño.
2. Tipos + lógica pura + tests (sin tocar Supabase ni la UI).
3. Migración SQL + adaptador (cloud / local / offline).
4. UI: `DayCard`, `WeekScreen`, `HistoryScreen`.
5. Verificación local: `npm test`, `npm run test:e2e` (**los 6 tests deben seguir pasando sin
   cambios**), `npm run build`.
6. Verificación real con dos cuentas temporales en un **deploy de preview**, sin tocar `main`.
7. Recién ahí: merge a `main`, aplicar migración y desplegar juntos.
