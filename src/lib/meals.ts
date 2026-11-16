import type { DayMeals, DayMode, MealEntry, MealPlanRow } from '../types'

/**
 * Lógica pura para "varias comidas por día".
 *
 * Un día tiene 1..N comidas idénticas (dificultad + un plato) y **una sola nota**.
 * Cada comida ocupa una fila `plans` identificada por `slot`; la nota se guarda
 * en la fila `slot = 0` y las demás la llevan vacía.
 *
 * Este módulo no toca Supabase ni React: se usa desde el adaptador y el contexto,
 * y se prueba directamente en Vitest.
 */

export function emptyMeal(slot = 0): MealEntry {
  return { slot, mode: null, dishId: null }
}

export function emptyDay(day: number): DayMeals {
  return { day, meals: [emptyMeal(0)], note: '' }
}

/** Renumera los slots 0..N-1 conservando el orden. Nunca deja el día sin comidas. */
export function compactMeals(day: DayMeals): DayMeals {
  const meals = (day.meals.length ? day.meals : [emptyMeal()]).map((meal, index) => ({
    ...meal,
    slot: index,
  }))
  return { ...day, meals }
}

/** Agrega una comida vacía al final del día. */
export function addMeal(day: DayMeals): DayMeals {
  const current = compactMeals(day)
  return { ...current, meals: [...current.meals, emptyMeal(current.meals.length)] }
}

/**
 * Quita una comida. Si era la única, no hace nada (el día siempre existe; para
 * "vaciar" ese día se quita el plato con `setMeal(dishId: null)`).
 */
export function removeMeal(day: DayMeals, slot: number): DayMeals {
  if (day.meals.length <= 1) return compactMeals(day)
  const meals = day.meals.filter((meal) => meal.slot !== slot)
  return compactMeals({ ...day, meals })
}

export function setMeal(
  day: DayMeals,
  slot: number,
  patch: Partial<Pick<MealEntry, 'mode' | 'dishId'>>,
): DayMeals {
  return {
    ...day,
    meals: day.meals.map((meal) =>
      meal.slot === slot ? { ...meal, ...patch } : meal,
    ),
  }
}

export function setDayNote(day: DayMeals, note: string): DayMeals {
  return { ...day, note }
}

/** Filas planas de una semana → 7 días con sus comidas. */
export function groupMealRows(rows: MealPlanRow[], weekStart: string): DayMeals[] {
  return Array.from({ length: 7 }, (_, day) => {
    const own = rows
      .filter((row) => row.weekStart === weekStart && row.day === day)
      .sort((a, b) => a.slot - b.slot)
    if (own.length === 0) return emptyDay(day)
    // Normalizamos los slots por si la base tiene huecos (p. ej. una fila
    // heredada con slot 3): el día siempre expone 0..N-1 en orden.
    return compactMeals({
      day,
      meals: own.map((row) => ({
        slot: row.slot,
        mode: row.mode,
        dishId: row.dishId,
      })),
      // La nota del día vive en slot 0; si falta, usamos la primera no vacía.
      note: own.find((row) => row.slot === 0)?.note ?? own.find((row) => row.note)?.note ?? '',
    })
  })
}

/** Un día → filas planas. Solo slot 0 lleva la nota. */
export function flattenDay(day: DayMeals, weekStart: string): MealPlanRow[] {
  return compactMeals(day).meals.map((meal) => ({
    weekStart,
    day: day.day,
    slot: meal.slot,
    mode: meal.mode,
    dishId: meal.dishId,
    note: meal.slot === 0 ? day.note : '',
  }))
}

/** Modo efectivo de una comida vacía (igual que `suggestWeek` hoy). */
export function effectiveMode(mode: DayMode | null): DayMode {
  return mode ?? 'facil'
}
