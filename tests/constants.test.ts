import { describe, expect, it } from 'vitest'
import { CATEGORIES, guessCategory, normalizeCategory } from '../src/lib/constants'

describe('rubros de compras', () => {
  it('usa exactamente cuatro rubros', () => {
    expect(CATEGORIES).toEqual(['Verdulería', 'Supermercado', 'Dietética', 'Otros'])
  })

  it('clasifica los casos habituales', () => {
    expect(guessCategory('Tomate')).toBe('Verdulería')
    expect(guessCategory('Manzana')).toBe('Verdulería')
    expect(guessCategory('Queso rallado')).toBe('Supermercado')
    expect(guessCategory('Leche de coco')).toBe('Supermercado')
    expect(guessCategory('Lentejas')).toBe('Dietética')
    expect(guessCategory('Tofu firme')).toBe('Dietética')
    expect(guessCategory('Incienso')).toBe('Otros')
  })

  it('gana la coincidencia más larga', () => {
    expect(guessCategory('Tomate triturado')).toBe('Supermercado')
    expect(guessCategory('Arroz')).toBe('Supermercado')
    expect(guessCategory('Arroz integral')).toBe('Dietética')
    expect(guessCategory('Harina')).toBe('Supermercado')
    expect(guessCategory('Harina integral')).toBe('Dietética')
    expect(guessCategory('Nuez')).toBe('Dietética')
    expect(guessCategory('Nuez moscada')).toBe('Supermercado')
  })

  it('normaliza rubros viejos según el ingrediente', () => {
    expect(normalizeCategory('Verdulería', 'Tomate')).toBe('Verdulería')
    expect(normalizeCategory('Frutas', 'Manzana')).toBe('Verdulería')
    expect(normalizeCategory('Almacén', 'Lentejas')).toBe('Dietética')
    expect(normalizeCategory('Lácteos y huevos', 'Queso')).toBe('Supermercado')
    expect(normalizeCategory('Especias', 'Nuez moscada')).toBe('Supermercado')
    expect(normalizeCategory('Panadería', 'Pan de campo')).toBe('Supermercado')
    expect(normalizeCategory('Desconocida')).toBe('Otros')
  })
})
