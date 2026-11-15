import { describe, expect, it } from 'vitest'
import type { Dish, Ingredient } from '../src/types'
import {
  buildIngredientCatalog,
  canonicalIngredientName,
  formatIngredientName,
  normalizeIngredientName,
  searchIngredients,
} from '../src/lib/ingredients'

let counter = 0

function ing(name: string, category?: string): Ingredient {
  counter += 1
  return { id: `ing-${counter}`, name, qty: '1', unit: 'u', category }
}

function dish(id: string, ingredients: Ingredient[]): Dish {
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
  }
}

describe('nombres de ingredientes', () => {
  it('normaliza mayúsculas, tildes y espacios', () => {
    expect(normalizeIngredientName('  Queso  Rallado ')).toBe('queso rallado')
    expect(normalizeIngredientName('Limón')).toBe('limon')
    expect(normalizeIngredientName('Aceite de oliva')).toBe('aceite de oliva')
  })

  it('deja prolijo un nombre nuevo', () => {
    expect(formatIngredientName('  tofu ahumado ')).toBe('Tofu ahumado')
    expect(formatIngredientName('')).toBe('')
  })
})

describe('catálogo de autocompletado', () => {
  it('usa el nombre más frecuente y conserva su categoría', () => {
    const catalog = buildIngredientCatalog([
      dish('d1', [ing('queso', 'Verdulería'), ing('queso', 'Supermercado')]),
      dish('d2', [ing('Queso', 'Supermercado')]),
    ])
    const queso = catalog.find((item) => item.key === 'queso')
    expect(queso?.name).toBe('Queso')
    expect(queso?.category).toBe('Supermercado')
    expect(queso?.count).toBeGreaterThanOrEqual(30)
  })

  it('canonicaliza variantes ya guardadas', () => {
    const catalog = buildIngredientCatalog([dish('d1', [ing('Tomate'), ing('tomate')])])
    expect(canonicalIngredientName(catalog, 'tomate')).toBe('Tomate')
    expect(canonicalIngredientName(catalog, 'Tomate')).toBe('Tomate')
    expect(canonicalIngredientName(catalog, 'tofu ahumado')).toBe('Tofu ahumado')
  })

  it('encuentra coincidencias tolerando errores de tipeo', () => {
    const catalog = buildIngredientCatalog([])
    const names = (query: string) => searchIngredients(catalog, query).map((item) => item.name)
    expect(names('eso')).toContain('Queso')
    expect(names('qeso')).toContain('Queso')
    expect(names('tomate')).toContain('Tomate')
    // Lo específico aparece antes que lo genérico.
    expect(names('tomate')[0]).toBe('Tomate')
  })
})
