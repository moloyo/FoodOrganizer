# Propuesta · Varias comidas por día (catálogo por hogar, por día)

> **Estado:** diseño en discusión. Rama `feature/multi-platos`, creada desde `main` (`e0d3b6b`).
> **No se aplicó ninguna migración, no se desplegó nada y `main` sigue intacto.**
> Guía del proyecto: [`DESARROLLO.md`](DESARROLLO.md) · Estado: [`ESTADO.md`](ESTADO.md).

## 1. Objetivo (corregido)

No es "varios platos en la misma cena", sino **varias comidas por día**: el martes una cosa al
almuerzo y otra a la cena. Y, sobre todo, ** adaptable**: otras personas (un amigo que ya usa la
app) no cocinan solo de noche.

Aclaración clave del usuario: **no toda la semana tiene la misma cantidad de comidas**.
"A lo mejor en la semana solo quiero que un día tenga dos comidas y el resto una sola".
Por eso las franjas son un **catálogo**, no una plantilla que se aplica a los 7 días.

**Principio rector:** default = catálogo `["Cena"]` y **una sola comida por día**. Los usuarios
actuales ven exactamente la misma app (mismo contador, mismas tarjetas, mismos textos) hasta
que agregan otra comida a un día concreto.

## 2. Decisiones ya tomadas

| Decisión | Respuesta |
| --- | --- |
| Alcance | Franjas de comida por día, configurables por hogar. |
| Granularidad | **Cada día tiene solo las comidas que se le agreguen** (no una plantilla semanal). |
| Platos por comida | **Uno**. "Agregar a mano" = agregar otra comida al día o cambiar el plato. |
| Dificultad | **Por comida**: cada almuerzo/cena tiene su propio modo y eso filtra sus sugerencias. |
| Vista | **Agrupar por día**: una `DayCard` por día con sus comidas apiladas. |
| Sugerencias | "Sorpréndeme" elige 1 y el resto se agrega a mano. |

## 3. Modelo de datos (decisión de implementación, ya resuelta)

### `households.meals` · catálogo de comidas del hogar

Columna `jsonb not null default '[{"id":"cena","label":"Cena"}]'::jsonb`. Lista ordenada de
**comidas disponibles**, compartida por todos los miembros del hogar. Se edita en
**Ajustes → Comidas**: agregar, renombrar, reordenar, archivar.

- `id` es un slug estable (`cena`, `almuerzo`, `desayuno`); `label` es lo que se muestra.
  Renombrar no invalida los planes ya guardados.
- No es una tabla nueva ⇒ **sin RLS ni policies nuevas**.
- El catálogo **no crea filas**: solo habilita qué comidas se pueden agregar a un día.

### `plans` · una fila por (día, comida)

```sql
alter table public.plans
  add column if not exists meal text not null default 'cena';

alter table public.plans
  drop constraint if exists plans_household_week_day_key;

alter table public.plans
  add constraint plans_household_week_day_meal_key
  unique (household_id, week_start, day, meal);
```

- Un día con dos comidas = **dos filas**; un día con una = **una fila** (como hoy).
- `dish_id` sigue escalar, `mode` y `note` pasan a ser **de la comida**.
- **Sin backfill**: las 7 filas actuales ya son cenas por el `default 'cena'`.
- **Compatibilidad con la app vieja:** el cliente actual no envía `meal`, Postgres aplica el
  default y sigue funcionando igual. No hace falta trigger ni ventana de indisponibilidad; la
  migración puede aplicarse *antes* del deploy.
- RLS (`is_household_member(household_id)`) e índices: sin cambios.
- Cola offline: `savePlan` sigue siendo un `upsert` por fila; solo cambia `onConflict` a
  `household_id,week_start,day,meal`.

### Estructura en memoria

```ts
interface MealPlan { meal: string; mode: DayMode | null; dishId: string | null; note: string }
interface DayMeals { day: number; meals: MealPlan[] }
```

`days` pasa a ser `DayMeals[]`. El orden de `meals` sigue el orden del catálogo, y solo aparecen
las comidas que tienen fila (o que el usuario agregó) en ese día.

## 4. Consecuencias en el resto de la app

| Pieza | Cambio |
| --- | --- |
| `AppContext.days` | `allPlans` + catálogo → `DayMeals[]`. |
| Acciones | `setMealDish(día, comida, plato)`, `addMeal(día, comida)`, `removeMeal(día, comida)`, `setMealMode`, `setMealNote`, `shuffleMeal`, `fillEmptyMeals`, `repeatWeek` (copia todas las filas), `clearWeek`. |
| `DayCard` | Una tarjeta por día; dentro, una fila por comida con su `ModeChips`, plato, nota y botón "+ Agregar comida". |
| `WeekScreen` | Contador derivado de la cantidad real de comidas de la semana. Si el catálogo sigue siendo solo Cena, **mantener el texto "N de 7 cenas"** para no romper ni los tests ni la costumbre. |
| `buildShoppingItems` | Recorre día → comida → plato. Ya unifica nombres/unidades entre comidas. |
| `shoppingOutdated` | Compara el conjunto completo de `dish_id`. |
| `history` | Semanas con `mode` o `dishId` en cualquier comida. |
| `Snapshot` | `version: 2` con `plans[].meal`; `importAll` acepta v1 asumiendo `meal='cena'`. |
| Offline | Prefijo de caché `comidas:cache:v2` (cambia la forma de los planes). |
| Tests E2E | Con el default de 1 comida por día, los 6 tests actuales deberían seguir pasando **sin cambios** si se conserva el texto "cenas". |

## 5. UI

- **Agrupado por día**: la `DayCard` actual se convierte en un contenedor; cada comida es una
  fila con: etiqueta de la comida ("Cena" / "Almuerzo"), `ModeChips`, plato (ver / cambiar /
  sorprender / quitar) y nota.
- **"+ Agregar comida"** al pie de la tarjeta: abre un `Sheet` con las comidas del catálogo que
  todavía no están en ese día (y la opción de crear una nueva, que pasa al catálogo).
- Las comidas sin plato se muestran colapsadas para no alargar la pantalla.
- **Ajustes → Comidas**: administrar el catálogo (agregar, renombrar, reordenar, archivar).

## 6. Riesgos y decisiones de detalle

- **Densidad**: se resuelve sola porque cada día muestra solo sus comidas; igual, colapsar las
  vacías.
- **Textos**: "Solo cenas", "N de 7 cenas", "cena" en sugerencias. Parametrizar, pero conservar
  el wording actual mientras el catálogo sea solo Cena.
- **Quitar/archivar una comida del catálogo**: si tiene planes en semanas pasadas, no se debe
  borrar (rompería el historial). Propuesta: **archivar** (`archived: true`), dejar de ofrecerla
  para nuevos días y seguir mostrándola en los planes existentes.
- **Borrar el día / vaciar semana**: borra todas las filas del día/semana, como hoy.
- **Edición simultánea en el hogar**: sigue siendo `upsert` de la fila; dos personas editando la
  misma comida se pisan (igual que hoy con `replaceShopping`). Aceptable para el MVP.
- **Backups v1**: `importAll` debe seguir aceptándolos.

## 7. Decisiones pendientes (de producto)

1. ¿El catálogo es **reutilizable** (agregás "Almuerzo" una vez y lo podés sumar a cualquier día
   con un toque) o cada día permite **texto libre**? → recomendable: catálogo reutilizable, con
   la opción de crear una comida nueva desde el propio día.
2. ¿"Sorpréndeme" de semana llena **todas las comidas vacías** de todos los días, o solo la
   **Cena** de cada día?
3. Al quitar una comida del catálogo, ¿**archivar** (conserva planes e historial) o **borrar**
   también sus planes? → recomendable: archivar.

## 8. Plan de trabajo en la rama

1. Cerrar §7 y actualizar este documento.
2. Tipos + lógica pura + tests (sin tocar Supabase ni la UI).
3. Migración SQL + adaptador (cloud / local / offline) + catálogo en `households`.
4. UI: `DayCard`, `WeekScreen`, `HistoryScreen`, Ajustes → Comidas.
5. Verificación local: `npm test`, `npm run test:e2e` (los 6 tests deben seguir pasando),
   `npm run build`.
6. Verificación real con dos cuentas temporales en un **deploy de preview**, sin tocar `main`.
7. Recién ahí: merge a `main`, aplicar migración y desplegar.
