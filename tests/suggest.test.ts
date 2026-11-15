import { describe, expect, it } from 'vitest'
import type { DayPlan, Dish, Ingredient, ShoppingItem } from '../src/types'
import {
  buildShoppingItems,
  matchesMode,
  mergeShopping,
  sortShopping,
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

function day(index: number, dishId: string): DayPlan {
  return { day: index, mode: null, dishId, note: '' }
}

describe('sugerencias por dificultad', () => {
  it('acepta dificultad igual o menor, y freezer solo si es apto', () => {
    const facil = dish('facil', [], { difficulty: 'facil' })
    expect(matchesMode(facil, 'media')).toBe(true)
    expect(matchesMode(facil, 'facil')).toBe(true)
    expect(matchesMode(facil, 'muy-facil')).toBe(false)
    expect(matchesMode(facil, 'freezer')).toBe(false)
    expect(matchesMode({ ...facil, freezerFriendly: true }, 'freezer')).toBe(true)
    expect(matchesMode(facil, 'media', false)).toBe(false)
  })
})

describe('lista de compras', () => {
  it('suma cantidades del mismo ingrediente y unifica mayúsculas', () => {
    const dishes = [
      dish('d1', [ing('Queso', '100', 'g', 'Lácteos y huevos')]),
      dish('d2', [ing('queso', '50', 'g', 'Queso')]),
    ]
    const items = buildShoppingItems([day(0, 'd1'), day(1, 'd2')], dishes)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      text: 'Queso · 150 g',
      category: 'Supermercado',
      checked: false,
    })
  })

  it('convierte unidades compatibles', () => {
    const dishes = [
      dish('d1', [
        ing('Manteca', '500', 'g'),
        ing('Aceite de oliva', '200', 'ml'),
        ing('Leche', '1', 'l'),
        ing('Ajo', '2', 'u'),
      ]),
      dish('d2', [
        ing('Manteca', '1', 'kg'),
        ing('Aceite de oliva', '1', 'cda'),
        ing('Leche', '500', 'ml'),
        ing('Ajo', '1', 'unidad'),
      ]),
    ]
    const items = buildShoppingItems([day(0, 'd1'), day(1, 'd2')], dishes)
    const text = (name: string) => items.find((item) => item.text.startsWith(name))?.text

    expect(text('Manteca')).toBe('Manteca · 1.5 kg')
    expect(text('Aceite de oliva')).toBe('Aceite de oliva · 215 ml')
    expect(text('Leche')).toBe('Leche · 1.5 l')
    expect(text('Ajo')).toBe('Ajo · 3 u')
  })

  it('mantiene las unidades iguales cuando no conviene convertir', () => {
    const dishes = [
      dish('d1', [ing('Aceite', '2', 'cdas')]),
      dish('d2', [ing('Aceite', '1', 'cda')]),
    ]
    const items = buildShoppingItems([day(0, 'd1'), day(1, 'd2')], dishes)
    expect(items[0]?.text).toBe('Aceite · 3 cda')
  })

  it('conserva cantidades no numéricas', () => {
    const dishes = [dish('d1', [ing('Sal', 'a gusto', ''), ing('Sal', 'un poco', '')])]
    const items = buildShoppingItems([day(0, 'd1')], dishes)
    expect(items[0]?.text).toBe('Sal · a gusto + un poco')
  })

  it('agrupa y ordena por rubro', () => {
    const dishes = [
      dish('d1', [ing('Queso', '100', 'g'), ing('Tomate', '2', 'u'), ing('Lentejas', '400', 'g')]),
    ]
    const items = buildShoppingItems([day(0, 'd1')], dishes)
    expect(items.map((item) => item.category)).toEqual([
      'Verdulería',
      'Supermercado',
      'Dietética',
    ])
  })

  it('preserva tildados e ítems manuales al regenerar', () => {
    const previous: ShoppingItem[] = [
      {
        id: 'old',
        text: 'Queso · 100 g',
        checked: true,
        category: 'Supermercado',
        dishId: 'd1',
      },
      {
        id: 'manual',
        text: 'Incienso',
        checked: false,
        category: 'Otros',
        dishId: null,
      },
    ]
    const fresh = buildShoppingItems(
      [day(0, 'd1')],
      [dish('d1', [ing('Queso', '100', 'g')])],
    )
    let nextId = 0
    const merged = mergeShopping(previous, fresh, () => `new-${nextId++}`)

    expect(merged.find((item) => item.text === 'Queso · 100 g')?.checked).toBe(true)
    expect(merged.find((item) => item.text === 'Incienso')).toMatchObject({
      id: 'manual',
      dishId: null,
    })
  })
})

describe('orden de la lista', () => {
  it('normaliza rubros viejos y deja los tildados al final del rubro', () => {
    const items: ShoppingItem[] = [
      { id: '1', text: 'Pan de campo', checked: false, category: 'Panadería', dishId: null },
      { id: '2', text: 'Manzana', checked: false, category: 'Frutas', dishId: null },
      { id: '3', text: 'Tomate', checked: true, category: 'Verdulería', dishId: null },
      { id: '4', text: 'Queso', checked: false, category: 'Lácteos y huevos', dishId: null },
    ]
    const sorted = sortShopping(items)
    expect(sorted.map((item) => [item.category, item.text])).toEqual([
      ['Verdulería', 'Manzana'],
      ['Verdulería', 'Tomate'],
      ['Supermercado', 'Pan de campo'],
      ['Supermercado', 'Queso'],
    ])
  })
})
