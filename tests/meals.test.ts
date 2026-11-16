import { describe, expect, it } from 'vitest'
import type { DayMeals, Dish, Ingredient, MealPlanRow } from '../src/types'
import {
  addMeal,
  compactMeals,
  emptyDay,
  flattenDay,
  groupMealRows,
  removeMeal,
  setDayNote,
  setMeal,
} from '../src/lib/meals'
import {
  buildShoppingItems,
  buildShoppingItemsForDays,
  suggestMeals,
  suggestWeek,
} from '../src/lib/suggest'

let ingredientCounter = 0

function ing(name: string, qty: string, unit: string, category?: string): Ingredient {
  ingredientCounter += 1
  return { id: `ing-${ingredientCounter}`, name, qty, unit, category }
}

function dish(id: string, ingredients: Ingredient[], overrides: Partial<Dish> = {}): Dish {
  return {
    id,
    name: `Plato ${id}`,
    difficulty: 'facil',
    minutes: 20,
    freezerFriendly: false,
    favorite: false,
    tags: [],
    ingredients,
    steps: '',
    sourceUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function row(
  day: number,
  slot: number,
  overrides: Partial<MealPlanRow> = {},
): MealPlanRow {
  return {
    weekStart: '2026-11-16',
    day,
    slot,
    mode: null,
    dishId: null,
    note: '',
    ...overrides,
  }
}

describe('día con N comidas', () => {
  it('un día nuevo tiene exactamente una comida vacía', () => {
    expect(emptyDay(3)).toEqual({
      day: 3,
      meals: [{ slot: 0, mode: null, dishId: null }],
      note: '',
    })
  })

  it('agregar una comida la deja vacía y conserva la anterior', () => {
    const base = setMeal(emptyDay(1), 0, { mode: 'media', dishId: 'd1' })
    const next = addMeal(base)
    expect(next.meals).toEqual([
      { slot: 0, mode: 'media', dishId: 'd1' },
      { slot: 1, mode: null, dishId: null },
    ])
  })

  it('agregar varias veces numera los slots en orden', () => {
    const next = addMeal(addMeal(addMeal(emptyDay(0))))
    expect(next.meals.map((meal) => meal.slot)).toEqual([0, 1, 2, 3])
  })

  it('quitar una comida recompacta los slots', () => {
    const base = addMeal(addMeal(emptyDay(2)))
    const next = removeMeal(base, 1)
    expect(next.meals.map((meal) => meal.slot)).toEqual([0, 1])
  })

  it('quitar la única comida no deja el día vacío', () => {
    const next = removeMeal(emptyDay(4), 0)
    expect(next.meals).toHaveLength(1)
    expect(next.meals[0].slot).toBe(0)
  })

  it('setMeal solo toca la comida indicada', () => {
    const base = addMeal(emptyDay(0))
    const next = setMeal(base, 1, { mode: 'elaborada', dishId: 'd2' })
    expect(next.meals[0]).toEqual({ slot: 0, mode: null, dishId: null })
    expect(next.meals[1]).toEqual({ slot: 1, mode: 'elaborada', dishId: 'd2' })
  })

  it('la nota es una sola, del día', () => {
    const next = setDayNote(addMeal(emptyDay(0)), 'sobró arroz')
    expect(next.note).toBe('sobró arroz')
    expect(next.meals).toHaveLength(2)
    expect(next.meals.every((meal) => !('note' in meal))).toBe(true)
  })

  it('compactMeals corrige slots desordenados', () => {
    const messy: DayMeals = {
      day: 0,
      note: '',
      meals: [
        { slot: 5, mode: null, dishId: null },
        { slot: 9, mode: 'facil', dishId: 'd1' },
      ],
    }
    expect(compactMeals(messy).meals.map((meal) => meal.slot)).toEqual([0, 1])
  })
})

describe('filas planas ↔ día', () => {
  it('agrupa las filas de un día y toma la nota de slot 0', () => {
    const days = groupMealRows(
      [
        row(2, 0, { mode: 'facil', dishId: 'd1', note: 'comprar pan' }),
        row(2, 1, { mode: 'media', dishId: 'd2', note: '' }),
      ],
      '2026-11-16',
    )
    expect(days[2]).toEqual({
      day: 2,
      note: 'comprar pan',
      meals: [
        { slot: 0, mode: 'facil', dishId: 'd1' },
        { slot: 1, mode: 'media', dishId: 'd2' },
      ],
    })
    expect(days[0].meals).toHaveLength(1)
  })

  it('flattenDay solo escribe la nota en slot 0', () => {
    const day = setDayNote(
      setMeal(addMeal(emptyDay(2)), 0, { dishId: 'd1' }),
      'nota del día',
    )
    const rows = flattenDay(day, '2026-11-16')
    expect(rows.map((r) => [r.slot, r.note])).toEqual([
      [0, 'nota del día'],
      [1, ''],
    ])
  })

  it('quitar la primera comida conserva la nota en la nueva slot 0', () => {
    const day = setDayNote(addMeal(emptyDay(2)), 'no borrar')
    const next = removeMeal(day, 0)
    const rows = flattenDay(next, '2026-11-16')
    expect(rows).toHaveLength(1)
    expect(rows[0].slot).toBe(0)
    expect(rows[0].note).toBe('no borrar')
  })

  it('si no hay slot 0, usa la primera nota no vacía', () => {
    const days = groupMealRows(
      [row(1, 3, { dishId: 'd1', note: 'nota huérfana' })],
      '2026-11-16',
    )
    expect(days[1].note).toBe('nota huérfana')
    expect(days[1].meals[0].slot).toBe(0)
  })
})

describe('compras con varias comidas', () => {
  it('suma el mismo ingrediente entre dos comidas del mismo día', () => {
    const dishes = [
      dish('d1', [ing('Queso', '100', 'g', 'Supermercado')]),
      dish('d2', [ing('queso', '50', 'g', 'Supermercado')]),
    ]
    const day = setMeal(
      setMeal(addMeal(emptyDay(0)), 0, { dishId: 'd1' }),
      1,
      { dishId: 'd2' },
    )
    const items = buildShoppingItemsForDays([day], dishes)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ text: 'Queso · 150 g', category: 'Supermercado' })
  })

  it('junta ingredientes de comidas de días distintos', () => {
    const dishes = [
      dish('d1', [ing('Tomate', '2', 'u')]),
      dish('d2', [ing('Aceite', '200', 'ml')]),
    ]
    const days = [
      setMeal(emptyDay(0), 0, { dishId: 'd1' }),
      setMeal(addMeal(emptyDay(1)), 1, { dishId: 'd2' }),
    ]
    const items = buildShoppingItemsForDays(days, dishes)
    expect(items.map((item) => item.text)).toContain('Tomate · 2 u')
    expect(items.map((item) => item.text)).toContain('Aceite · 200 ml')
  })

  it('la API vieja de 1 comida por día sigue dando el mismo resultado', () => {
    const dishes = [dish('d1', [ing('Queso', '100', 'g', 'Supermercado')])]
    const legacy = buildShoppingItems(
      [{ day: 0, mode: null, dishId: 'd1', note: '' }],
      dishes,
    )
    const moderna = buildShoppingItemsForDays(
      [setMeal(emptyDay(0), 0, { dishId: 'd1' })],
      dishes,
    )
    expect(legacy).toEqual(moderna)
  })
})

describe('Sorpréndeme con N comidas', () => {
  it('llena todas las comidas vacías sin repetir platos', () => {
    const dishes = [
      dish('d1', []),
      dish('d2', []),
      dish('d3', []),
    ]
    const days = [
      addMeal(setMeal(emptyDay(0), 0, { mode: 'facil' })),
      setMeal(emptyDay(1), 0, { mode: 'facil' }),
    ]
    const picks = suggestMeals(dishes, days)
    expect(picks).toHaveLength(3)
    expect(new Set(picks.map((pick) => pick.dishId)).size).toBe(3)
    expect(picks.map((pick) => pick.slot)).toEqual([0, 1, 0])
    expect(picks.every((pick) => pick.mode === 'facil')).toBe(true)
  })

  it('no vuelve a sugerir un plato ya planificado', () => {
    const dishes = [dish('d1', []), dish('d2', []), dish('d3', [])]
    const days = [
      setMeal(addMeal(emptyDay(0)), 0, { mode: 'facil', dishId: 'd1' }),
      setMeal(emptyDay(1), 0, { mode: 'facil' }),
    ]
    const picks = suggestMeals(dishes, days)
    expect(picks).toHaveLength(2)
    expect(picks.map((pick) => pick.dishId)).not.toContain('d1')
  })

  it('respeta la dificultad de cada comida', () => {
    const dishes = [dish('d1', [], { difficulty: 'facil' })]
    const day = setMeal(emptyDay(0), 0, { mode: 'muy-facil' })
    expect(suggestMeals(dishes, [day])).toEqual([])
  })

  it('suggestWeek (1 comida por día) conserva su forma', () => {
    const dishes = [dish('d1', [])]
    const picks = suggestWeek(dishes, [{ day: 0, mode: null, dishId: null, note: '' }])
    expect(picks).toEqual([{ day: 0, dishId: 'd1', mode: 'facil' }])
  })
})
