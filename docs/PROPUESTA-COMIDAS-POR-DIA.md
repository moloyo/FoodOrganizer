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
- Cada comida es **la misma sección de hoy repetida**: dificultad (`ModeChips`) y **un** plato.
  La **nota es una sola por día**, abajo de todas las secciones (no se repite).
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
| Nota | **Una por día**, abajo de todas las secciones (como hoy, no se repite). |
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
- `mode` y `dish_id` pasan a ser **de la sección**. `note` sigue siendo **del día**: se guarda
  en la fila `slot = 0` y las demás la llevan vacía. Al recompactar `slot` (quitar la primera
  sección) hay que conservar la nota en la nueva fila `0`.
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
}
interface DayMeals {
  day: number
  meals: MealEntry[]   // ordenadas por slot
  note: string         // una sola, del día
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
| `src/state/AppContext.tsx` | `days`, `persistDay` → `persistMeal`, `addMeal`, `removeMeal`, `moveMeal`, `setMealMode/Dish`, `setDayNote` (día), `shuffleMeal`, `fillEmptyMeals`, `plannedDishIds`, `shoppingOutdated`, `repeatWeek`, `clearWeek`. |
| `src/lib/suggest.ts` | `buildShoppingItems` recorre día → sección → plato; `suggestWeek` no repite platos entre todas las secciones. |
| `src/components/DayCard.tsx` | Contenedor del día + N secciones (cada una con `ModeChips`, plato y ✕) + **una sola nota** abajo + botón "+". |
| `src/screens/WeekScreen.tsx` | Contador y textos derivados de la cantidad real de secciones; `DishPickerSheet` recibe `(día, slot)`. |
| `src/screens/HistoryScreen.tsx` | Detalle con varias secciones por día. |
| `tests/` | Lógica pura (sugerencias sin repetir con N secciones, compras con 2 secciones, compactado de slots) + E2E de agregar/quitar sección. |
| `docs/` | Modelo de datos, decisiones y bitácora. |

**No se tocan:** hogares, invitaciones, autenticación, temas, PWA, compras (salvo el recorrido
de planes), ni `households`.

## 6. Detalles que decido yo (no requieren respuesta)

- "+" agrega una sección **vacía**: sin dificultad y sin plato.
- Cada sección tiene su **✕** para quitarse, **solo cuando el día tiene 2 o más secciones**.
  Con una sola sección esa ✕ no aparece: el día siempre existe y se conserva la ✕ de la fila
  del plato ("Quitar plato") tal como funciona hoy. Al quitar se recompactan los `slot`.
- **La nota va una sola vez por día**, abajo de todas las secciones y separada por una línea,
  igual que hoy pero fuera de las secciones. Se guarda en la fila `slot = 0`.
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

1. [x] Confirmar este diseño con el **boceto visual** `docs/mockup-comidas.html` (HTML
   estático, sin backend: tema clásico/cool/oscuro, "+", "✕" y chips interactivos).
2. [x] **Tipos + lógica pura + tests** (sin tocar Supabase ni la UI). Ver §9.
3. [x] **Migración SQL + adaptador** (cloud / local / offline). Ver §10. **El SQL no se
   ejecutó** y no hubo deploy.
4. [x] **UI**: `DayCard`, `WeekScreen`, `DishPickerSheet`, `HistoryScreen`, `ShoppingScreen`.
   Ver §11. Los 6 tests E2E viejos siguen pasando **sin cambios**.
5. [x] Verificación local: `npm test`, `npm run test:e2e`, `npm run build` (hechos; repetir
   antes del merge).
6. [x] **Sin preview aislado:** la migración cambia el `unique` de `plans` en el mismo
   Supabase de producción, así que un preview con el schema nuevo rompería al cliente
   viejo. Gracias al shim de §10 el orden seguro es: **merge → deploy (funciona con el
   schema viejo) → aplicar la migración** ⇒ sin ventana de caída.
7. [x] Merge a `main` (`51eae2e`), migración aplicada en Supabase y verificación con dos
   cuentas temporales. **Sin ventana de caída** gracias al shim de §10: se desplegó el
   cliente nuevo contra el schema viejo y recién después se aplicó la migración.

## 12. Cierre (16/11/2026)

- `main` = `51eae2e`, deploy en <https://comidas-pi.vercel.app>.
- Login público sin errores de consola; bundle con el feature presente.
- Verificación REST con dos cuentas temporales: 2 comidas en un mismo día (`slot` 0 y 1),
  nota única en `slot = 0`, ambos miembros leen ambas filas, `anon` ve `[]`, `household_id`
  ajeno rechazado (`403`), unique `(día, slot)` activo (`409`), y `delete_my_account`
  limpiando sin perder los datos del otro miembro.
- La cuenta principal **no se tocó**. Queda la prueba con la pareja en dos dispositivos y,
  como siempre, la prueba real de offline en el celular.

## 9. Etapa 2 implementada (solo lógica pura)

**Archivos nuevos / modificados:**

- `src/types.ts`: `MealEntry`, `DayMeals`, `MealPlanRow`; `PlanRow.slot` **opcional** para no
  romper el código actual durante la transición.
- `src/lib/meals.ts` (nuevo): `emptyMeal`, `emptyDay`, `compactMeals`, `addMeal`,
  `removeMeal`, `setMeal`, `setDayNote`, `groupMealRows`, `flattenDay`.
  - `removeMeal` nunca deja el día con 0 comidas; `compactMeals` normaliza huecos.
  - `flattenDay` escribe la **nota solo en `slot = 0`**; `groupMealRows` la lee de ahí (con
    fallback a la primera nota no vacía) y compacta los slots.
- `src/lib/suggest.ts`:
  - `buildShoppingItemsForDays(days: DayMeals[], dishes)` recorre día → comida → plato.
    `buildShoppingItems` (1 comida por día) ahora delega en ella ⇒ **comportamiento idéntico**.
  - `suggestMeals(dishes, days: DayMeals[])` llena todas las comidas vacías sin repetir platos
    en la semana. `suggestWeek` delega en ella ⇒ **comportamiento idéntico**.
- `tests/meals.test.ts` (nuevo): 19 tests de alta/baja de comidas, compactado de slots,
  nota única, round-trip de filas, compras con 2 comidas y sugerencias sin repetir.

**Verificación:** `npx tsc -b` limpio · `npm test` **63/63** · `npm run build` correcto ·
`npm run test:e2e` **6/6** (sin cambiar ningún test de interfaz).

**No se tocó:** Supabase, migraciones, adaptadores, `AppContext`, componentes ni pantallas.
`main` sigue intacto.

## 10. Etapa 3 implementada (SQL + adaptadores, sin ejecutar nada)

**`supabase/migration_comidas_por_dia.sql`** (nuevo, idempotente, **NO ejecutado**):

```sql
alter table public.plans add column if not exists slot smallint not null default 0;
alter table public.plans drop constraint if exists plans_household_week_day_key;
alter table public.plans add constraint plans_household_week_day_slot_key
  unique (household_id, week_start, day, slot);
```

- Sin backfill (el default `0` cubre las 7 filas actuales), sin cambios de RLS.
- Incluye índice por `(household_id, week_start, day, slot)` y bloque de verificación.

**`DataAdapter`** suma dos métodos, sin quitar los viejos:

- `listMealPlans(): Promise<MealPlanRow[]>`
- `replaceDayMeals(weekStart, day, rows): Promise<void>` — borra todas las filas del día e
  inserta las nuevas (una operación por día, como `replaceShopping`).

**`cloud.ts`**: `listMealPlans` normaliza `slot ?? 0` (funciona también contra el schema
viejo, porque usa `select('*')`); `replaceDayMeals` hace delete + insert con `slot`.
`mapPlan` ahora exporta `slot`, y `importAll` solo envía la columna cuando el backup tiene
`slot > 0` ⇒ los backups v1 siguen importando en el schema viejo. **Los métodos legacy
(`listPlans` / `savePlan`) no se tocaron**, así el dev server de la rama sigue funcionando
contra el Supabase actual.

**Shim de despliegue (añadido en la etapa 4):** `replaceDayMeals` **omite la columna
`slot` cuando todas las comidas son la primera**, y `savePlan` legacy delega en
`replaceDayMeals` (así las operaciones `savePlan` viejas de la cola offline siguen
funcionando con el unique nuevo). Con eso el cliente nuevo funciona contra el schema
viejo ⇒ se puede **desplegar primero y aplicar la migración después, sin ventana de
caída**. La columna `slot` solo se envía cuando hay 2+ comidas, que es exactamente lo
que la migración habilita.

**`local.ts`**: `LocalDB.plans` pasa a `MealPlanRow[]`, normaliza `slot` al leer backups
viejos y delega `savePlan` en `replaceDayMeals`. `listPlans` devuelve solo `slot = 0`.

**`offline.ts`**: nueva clave de caché `mealPlans`, nueva operación de cola
`replaceDayMeals` (con compactación por día y limpieza con `clearWeek`), lectura con fallback
offline y actualización optimista de la caché. `cacheSnapshot` prefiere `mealPlans`.

**Tests:** 4 casos nuevos en `tests/offline.test.ts` (encolar/sincronizar, compactar,
leer de caché sin red, `clearWeek` limpiando la caché nueva).

**Verificación:** `npx tsc -b` limpio · `npm test` **67/67** · `npm run build` correcto ·
`npm run test:e2e` **6/6**.

**Pendiente para la etapa 4:** cambiar `AppContext`/UI a `listMealPlans` +
`replaceDayMeals`. Hasta entonces los métodos nuevos no se usan y **la migración no debe
aplicarse**: el cliente viejo rompería su `onConflict`. `main` sigue intacto.

## 11. Etapa 4 implementada (UI)

**`AppContext.tsx`** — cambia de `PlanRow[]` a `MealPlanRow[]`:

- `reloadAll()` usa `listMealPlans()`; `days` se deriva con `groupMealRows`.
- `saveDay(dayIndex, DayMeals)` reemplaza a `persistDay`: hace `flattenDay` → actualización
  optimista de `allMealPlans` → `adapter.replaceDayMeals`.
- Acciones nuevas: `addMeal`, `removeMeal`, `setMealMode`, `setMealDish`, `shuffleMeal`.
  `setDayNote` sigue siendo **una por día**.
- `fillEmptyDays` usa `suggestMeals` y aplica todos los picks de un día en una sola
  `saveDay`; `repeatWeek` copia todas las comidas; `deleteDish` limpia todas las filas;
  `regenerateShopping` usa `buildShoppingItemsForDays`.
- `plansForWeek` devuelve `DayMeals[]`.

**`DayCard.tsx`** — reescrito según el boceto aprobado: N secciones (cada una con
`ModeChips` + plato + sus botones), **✕ de sección solo con 2+ comidas**, **una sola nota**
abajo de todas y separada por una línea, y botón **"+ Agregar otra comida"**.
Con 1 comida por día conserva `aria-label`, botones y textos actuales.

**`WeekScreen.tsx`** — contador/textos derivados de la cantidad real de comidas:
con 1 por día se mantiene literalmente **"N de 7 cenas"** y el subtítulo "Solo cenas";
si algún día tiene más, pasa a **"N de M comidas"**. `DishPickerSheet` recibe `(día, slot)`
y `DishEditor` asigna el plato nuevo a la comida correcta.

**`DishPickerSheet.tsx` / `HistoryScreen.tsx` / `ShoppingScreen.tsx`** — adaptados a
`DayMeals`: filtros por comida, detalle con varios platos y conteo de planeados.

**Tests:** `tests/e2e/meals.spec.ts` (2 casos nuevos): agregar 2 comidas cambia el contador,
la nota es única y persiste tras recargar, quitar vuelve a 1 comida; y "Sorpréndeme" llena
las 8 comidas. **Los 6 tests E2E anteriores siguen pasando sin tocarlos.**

**Verificación:** `npx tsc -b` limpio · `npm test` **67/67** · `npm run build` correcto ·
`npm run test:e2e` **8/8**. Captura real a 390 px revisada (2 días con 2 comidas, una nota
por día), sin errores de consola.

**Todavía no se ejecutó la migración ni hubo deploy.** `main` sigue intacto.
