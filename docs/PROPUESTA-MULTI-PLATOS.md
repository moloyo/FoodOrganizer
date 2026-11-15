# Propuesta · Varias comidas por día (franjas configurables)

> **Estado:** diseño en discusión. Rama `feature/multi-platos`, creada desde `main` (`e0d3b6b`).
> **No se aplicó ninguna migración, no se desplegó nada y `main` sigue intacto.**
> Guía del proyecto: [`DESARROLLO.md`](DESARROLLO.md) · Estado: [`ESTADO.md`](ESTADO.md).

## 1. Objetivo (corregido)

No se trata de "varios platos en la misma cena", sino de **varias comidas por día**: por ejemplo
el martes una cosa al **almuerzo** y otra a la **cena**. Además, la app debe ser **adaptable**:
otras personas (un amigo que ya la usa) no cocinan solo de noche, así que las franjas no pueden
estar fijas en el código.

**Principio rector:** el default sigue siendo **solo "Cena"**. Los usuarios actuales no ven
ningún cambio hasta que agregan otra franja. Eso es lo que permite trabajar tranquilos en la
rama sin afectar a nadie.

## 2. Decisiones ya tomadas

| Decisión | Respuesta |
| --- | --- |
| Alcance | Franjas de comida por día (almuerzo / cena / las que se configuren). |
| Sugerencias | "Sorpréndeme" elige **1** y el resto se **agrega a mano**. |
| Dificultad | "Por plato" (a precisar en §8: puede significar *por comida* o *sin selector*). |

## 3. Modelo de datos propuesto (decisión de implementación, ya resuelta)

### `households.meals` · franjas del hogar

Columna `jsonb not null default '[{"id":"cena","label":"Cena"}]'::jsonb`. Lista ordenada de
franjas, compartida por todos los miembros del hogar (para que tu pareja vea lo mismo).
Editable en **Ajustes → Comidas**: agregar, renombrar, reordenar y quitar franjas
("Desayuno", "Almuerzo", "Merienda", "Cena", …).

- No es una tabla nueva: va en `households`, así que **no hay RLS ni policies nuevas**.
- `id` es un slug estable (`cena`, `almuerzo`) generado al crear la franja; `label` es lo que
  se muestra. Así renombrar no invalida los planes ya guardados.

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

- `dish_id` sigue siendo **escalar**: una fila = una comida = un plato (salvo que se elija la
  variante de §5).
- `mode` (dificultad) y `note` pasan a ser **de la comida**.
- El `default 'cena'` hace que **no haya backfill**: las 7 filas actuales ya son cenas.
- **Compatibilidad con la app vieja:** el cliente actual no envía `meal`, así que Postgres
  aplica el default y sigue escribiendo/leyendo exactamente igual. No hace falta trigger ni
  ventana de indisponibilidad: se puede aplicar la migración *antes* del deploy.
- RLS (`is_household_member(household_id)`) e índices: sin cambios.
- Cola offline: `savePlan` sigue siendo un `upsert` por fila; solo cambia
  `onConflict` a `household_id,week_start,day,meal`.

### Por qué no una tabla hija / por qué no `dish_ids jsonb`

Con el alcance corregido, la dimensión nueva es la **franja**, no la lista de platos. Agregar
una columna `meal` con default resuelve eso con el mínimo cambio posible y sin migración de
datos. Una tabla `meal_slots` o un array de platos sería más superficie de cambio para el mismo
resultado (salvo que se quieran varios platos por comida, ver §5).

## 4. Consecuencias en el resto de la app

| Pieza | Cambio |
| --- | --- |
| `DayPlan` / `PlanRow` | Suma `meal: string`. Deja de haber "7 días con un plato": ahora hay `días × franjas` filas. |
| `AppContext.days` | Pasa a `meals` del hogar + `allPlans`; deriva una estructura `Día → Comida → Plan`. |
| Acciones | `setDayDish(día, comida, plato)`, `addDayMeal`, `removeDayMeal`, `setMealMode`, `setMealNote`, `shuffleMeal`, `fillEmptyMeals`, `repeatWeek` (copia todas las filas). |
| `buildShoppingItems` | Recorre **todas** las filas (día × comida). La unificación de nombres/unidades ya suma entre comidas. |
| `shoppingOutdated` | Compara el conjunto completo de `dish_id` planificados. |
| `history` | Semanas con `mode` o `dishId` en cualquier comida. |
| `Snapshot` | `version: 2` con `plans[].meal`; `importAll` acepta v1 asumiendo `meal='cena'`. |
| Contador | "N de 7 cenas" → "N de X comidas" (X = 7 × franjas activas). Textos y tagline a revisar. |
| Offline | Prefijo de caché `comidas:cache:v2` (la forma de los planes cambia). |

## 5. Variante abierta: varios platos por comida

La respuesta "1 + agregar a mano" puede interpretarse de dos maneras. Son de producto, no de
implementación:

- **5a · Una comida = un plato.** "Agregar a mano" = agregar otra comida (franja) o cambiar el
  plato existente. Modelo de §3 sin cambios, `dish_id` escalar. **Menos riesgo.**
- **5b · Una comida puede tener varios platos** (principal + acompañamiento). "Sorpréndeme"
  elige 1 y el usuario suma el resto. Requiere además `dish_ids jsonb` en la fila (o tabla hija),
  y que la dificultad se evalúe por plato. **Más potente, más cambios.**

## 6. UI (a decidir en §8)

Con 2 franjas × 7 días hay hasta 14 tarjetas. Opciones:

- **Agrupar por día**: una `DayCard` por día con las comidas apiladas, las vacías colapsadas.
  Mantiene la navegación semanal actual y no alarga la pantalla.
- **Una tarjeta por comida**: más simple de implementar, pero la semana se vuelve larguísima.
- **Pestañas por franja** (Almuerzo / Cena): cambia la metáfora de "semana" a "franja".

La dificultad, si es por comida, pasa a los `ModeChips` de cada fila; si se elimina, desaparece
el selector y "Sorpréndeme" usa solo la dificultad propia de cada plato del recetario.

## 7. Riesgos

- **Densidad en 390 px**: 14–21 filas pueden cansar. Mitigación: colapsar comidas vacías.
- **Textos**: "Solo cenas", "N de 7 cenas", "cena" en sugerencias y notas. Hay que
  parametrizarlos, no solo traducirlos.
- **Edición simultánea en el hogar**: sigue siendo `upsert` de la fila; dos personas editando
  la misma comida se pisan (igual que hoy con `replaceShopping`). Aceptable para el MVP.
- **Borrar una franja** que tiene planes: decidir si se borran esos planes o se migra a "Cena".
- **Backups v1**: `importAll` debe seguir aceptándolos.

## 8. Decisiones pendientes (de producto)

1. ¿Franjas **configurables por hogar** (default solo Cena) o fijas "Almuerzo + Cena"?
2. ¿Una comida = **un plato** (5a) o **varios platos** (5b)?
3. ¿El selector de dificultad va **por comida**, **por día**, o **se elimina** y cada plato usa
   la dificultad del recetario? (la respuesta "por plato" necesita precisarse).
4. ¿La nota es **del día** o **de cada comida**?
5. ¿Cómo se muestra la semana con varias franjas (agrupar por día / tarjeta por comida /
   pestañas)?

## 9. Plan de trabajo en la rama

1. Cerrar §8 y actualizar este documento.
2. Tipos + lógica pura + tests (sin tocar Supabase ni la UI).
3. Migración SQL + adaptador (cloud / local / offline) + configuración de franjas.
4. UI: `DayCard`, `WeekScreen`, `HistoryScreen`, Ajustes → Comidas.
5. Verificación local: `npm test`, `npm run test:e2e` (con default de 1 franja, los tests
   actuales deben seguir pasando **sin cambios**), `npm run build`.
6. Verificación real con dos cuentas temporales en un **deploy de preview**, sin tocar `main`.
7. Recién ahí: merge a `main`, aplicar migración y desplegar.
