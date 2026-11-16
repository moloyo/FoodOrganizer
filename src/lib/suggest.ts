import type {
  DayMeals,
  DayMode,
  DayPlan,
  Dish,
  Ingredient,
  ShoppingItem,
} from '../types'
import { CATEGORIES, DIFFICULTY_RANK, normalizeCategory } from './constants'
import { formatIngredientName, normalizeIngredientName } from './ingredients'

export interface CandidateOptions {
  includeEasier?: boolean
  excludeIds?: string[]
}

export function matchesMode(
  dish: Dish,
  mode: DayMode | null,
  includeEasier = true,
): boolean {
  if (!mode) return true
  if (mode === 'freezer') return dish.freezerFriendly
  const target = DIFFICULTY_RANK[mode]
  const rank = DIFFICULTY_RANK[dish.difficulty]
  return includeEasier ? rank <= target : rank === target
}

export function candidatesFor(
  dishes: Dish[],
  mode: DayMode | null,
  { includeEasier = true, excludeIds = [] }: CandidateOptions = {},
): Dish[] {
  return dishes.filter(
    (dish) => matchesMode(dish, mode, includeEasier) && !excludeIds.includes(dish.id),
  )
}

function weightedPick(dishes: Dish[], mode: DayMode | null): Dish {
  const weights = dishes.map((dish) => {
    let weight = 1
    if (dish.favorite) weight *= 2.2
    if (mode && mode !== 'freezer' && dish.difficulty === mode) weight *= 1.6
    if (mode === 'freezer' && dish.freezerFriendly) weight *= 1.2
    return weight
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let i = 0; i < dishes.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return dishes[i]
  }
  return dishes[dishes.length - 1]
}

export function pickSuggestion(
  dishes: Dish[],
  mode: DayMode | null,
  options: CandidateOptions = {},
): Dish | null {
  if (!mode) return null
  const excludeIds = options.excludeIds ?? []
  let pool = candidatesFor(dishes, mode, { ...options, excludeIds })
  if (pool.length === 0) {
    pool = candidatesFor(dishes, mode, { ...options, excludeIds: [] })
  }
  if (pool.length === 0) return null
  return weightedPick(pool, mode)
}

export interface MealPick {
  day: number
  slot: number
  dishId: string
  mode: DayMode
}

/**
 * "Sorpréndeme" para días con N comidas: llena **todas las secciones vacías**
 * de la semana sin repetir platos. Las comidas ya planificadas cuentan como usadas.
 */
export function suggestMeals(dishes: Dish[], days: DayMeals[]): MealPick[] {
  const used: string[] = []
  const picks: MealPick[] = []
  for (const day of days) {
    for (const meal of day.meals) {
      if (meal.dishId) {
        used.push(meal.dishId)
        continue
      }
      const mode = meal.mode ?? 'facil'
      const dish = pickSuggestion(dishes, mode, { excludeIds: used })
      if (dish) {
        used.push(dish.id)
        picks.push({ day: day.day, slot: meal.slot, dishId: dish.id, mode })
      }
    }
  }
  return picks
}

/** Versión de 1 comida por día (la que usa la app hoy). */
export function suggestWeek(
  dishes: Dish[],
  days: DayPlan[],
): { day: number; dishId: string; mode: DayMode }[] {
  const asDays: DayMeals[] = days.map((day) => ({
    day: day.day,
    note: day.note,
    meals: [{ slot: 0, mode: day.mode, dishId: day.dishId }],
  }))
  return suggestMeals(dishes, asDays).map(({ day, dishId, mode }) => ({
    day,
    dishId,
    mode,
  }))
}

/* ------------------------------ Lista de compras ------------------------------ */

interface GroupedIngredient {
  name: string
  quantities: string[]
  units: string[]
  unitInfos: (UnitInfo | null)[]
  unit: string
  category: string
  dishId: string | null
}

type UnitDimension = 'mass' | 'volume' | 'count'

interface UnitInfo {
  dimension: UnitDimension
  /** Cuánto vale una unidad en la unidad base (g, ml o unidad). */
  factor: number
  /** Unidad canónica para mostrar (cda, cdta, kg, u…). */
  display: string
}

function normalizeUnit(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.$/, '')
    .trim()
}

const UNIT_ALIASES: Record<string, UnitInfo> = {
  g: { dimension: 'mass', factor: 1, display: 'g' },
  gr: { dimension: 'mass', factor: 1, display: 'g' },
  gramo: { dimension: 'mass', factor: 1, display: 'g' },
  gramos: { dimension: 'mass', factor: 1, display: 'g' },
  kg: { dimension: 'mass', factor: 1000, display: 'kg' },
  kilo: { dimension: 'mass', factor: 1000, display: 'kg' },
  kilos: { dimension: 'mass', factor: 1000, display: 'kg' },
  ml: { dimension: 'volume', factor: 1, display: 'ml' },
  mililitro: { dimension: 'volume', factor: 1, display: 'ml' },
  mililitros: { dimension: 'volume', factor: 1, display: 'ml' },
  l: { dimension: 'volume', factor: 1000, display: 'l' },
  lt: { dimension: 'volume', factor: 1000, display: 'l' },
  litro: { dimension: 'volume', factor: 1000, display: 'l' },
  litros: { dimension: 'volume', factor: 1000, display: 'l' },
  cda: { dimension: 'volume', factor: 15, display: 'cda' },
  cdas: { dimension: 'volume', factor: 15, display: 'cda' },
  cucharada: { dimension: 'volume', factor: 15, display: 'cda' },
  cucharadas: { dimension: 'volume', factor: 15, display: 'cda' },
  cdta: { dimension: 'volume', factor: 5, display: 'cdta' },
  cdtas: { dimension: 'volume', factor: 5, display: 'cdta' },
  cucharadita: { dimension: 'volume', factor: 5, display: 'cdta' },
  cucharaditas: { dimension: 'volume', factor: 5, display: 'cdta' },
  taza: { dimension: 'volume', factor: 240, display: 'taza' },
  tazas: { dimension: 'volume', factor: 240, display: 'taza' },
  u: { dimension: 'count', factor: 1, display: 'u' },
  un: { dimension: 'count', factor: 1, display: 'u' },
  unidad: { dimension: 'count', factor: 1, display: 'u' },
  unidades: { dimension: 'count', factor: 1, display: 'u' },
}

function unitInfo(unit: string): UnitInfo | null {
  return UNIT_ALIASES[normalizeUnit(unit)] ?? null
}

function parseQty(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function displayQuantity(
  total: number,
  info: UnitInfo,
  units: string[],
): { quantity: string; unit: string } {
  const displays = new Set(
    units.map((unit) => unitInfo(unit)?.display).filter((value): value is string => Boolean(value)),
  )

  // Si todas las cantidades usan la misma unidad "de cocina" (cda, cdta, taza, kg…),
  // la mantenemos en vez de pasarlas a ml/g.
  if (displays.size === 1) {
    const only = [...displays][0]
    const factor = UNIT_ALIASES[normalizeUnit(only)]?.factor ?? 1
    return { quantity: formatQty(total / factor), unit: only }
  }

  if (info.dimension === 'mass') {
    if (total >= 1000) return { quantity: formatQty(total / 1000), unit: 'kg' }
    return { quantity: formatQty(total), unit: 'g' }
  }

  if (info.dimension === 'volume') {
    if (total >= 1000) return { quantity: formatQty(total / 1000), unit: 'l' }
    return { quantity: formatQty(total), unit: 'ml' }
  }

  return { quantity: formatQty(total), unit: 'u' }
}

/**
 * Arma la lista de compras recorriendo **todas** las comidas de todos los días.
 * La unificación de nombres/unidades ya suma ingredientes que aparecen en varias
 * comidas distintas.
 */
export function buildShoppingItemsForDays(
  days: DayMeals[],
  dishes: Dish[],
): Omit<ShoppingItem, 'id'>[] {
  const groups = new Map<string, GroupedIngredient>()

  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.dishId) continue
      const dish = dishes.find((d) => d.id === meal.dishId)
      if (!dish) continue
      for (const ingredient of dish.ingredients) {
        const name = ingredient.name.trim()
        if (!name) continue
        const unit = (ingredient.unit ?? '').trim()
        const category = normalizeCategory(ingredient.category, name)
        const info = unitInfo(unit)
        // Los nombres y las unidades compatibles se unifican: "Queso" y "queso",
        // "500 g" y "1 kg", "200 ml" y "1 cda". Las unidades libres quedan aparte.
        const unitKey = info ? `dim:${info.dimension}` : `unit:${normalizeUnit(unit)}`
        const key = `${category}|${normalizeIngredientName(name)}|${unitKey}`
        const existing = groups.get(key)
        if (existing) {
          if (ingredient.qty.trim()) {
            existing.quantities.push(ingredient.qty.trim())
            existing.units.push(unit)
            existing.unitInfos.push(info)
          }
        } else {
          groups.set(key, {
            name,
            quantities: ingredient.qty.trim() ? [ingredient.qty.trim()] : [],
            units: ingredient.qty.trim() ? [unit] : [],
            unitInfos: ingredient.qty.trim() ? [info] : [],
            unit,
            category,
            dishId: dish.id,
          })
        }
      }
    }
  }

  const items: Omit<ShoppingItem, 'id'>[] = []
  for (const group of groups.values()) {
    const numeric = group.quantities.map(parseQty)
    const allNumeric = numeric.length > 0 && numeric.every((n) => n !== null)
    let quantityText = ''
    let unitText = group.unit
    const dimensionInfo = group.unitInfos.find((info): info is UnitInfo => Boolean(info))

    if (dimensionInfo && allNumeric) {
      const total = (numeric as number[]).reduce(
        (sum, n, index) => sum + n * (group.unitInfos[index]?.factor ?? dimensionInfo.factor),
        0,
      )
      const shown = displayQuantity(total, dimensionInfo, group.units)
      quantityText = shown.quantity
      unitText = shown.unit
    } else if (group.quantities.length > 0) {
      quantityText = [...new Set(group.quantities)].join(' + ')
    }

    const detail = [quantityText, unitText].filter(Boolean).join(' ')
    items.push({
      text: `${formatIngredientName(group.name)}${detail ? ` · ${detail}` : ''}`,
      category: group.category,
      checked: false,
      dishId: group.dishId,
    })
  }

  const order = new Map<string, number>(
    (CATEGORIES as readonly string[]).map((category, index) => [category, index]),
  )
  return items.sort((a, b) => {
    const byCategory = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99)
    return byCategory !== 0 ? byCategory : a.text.localeCompare(b.text, 'es')
  })
}

/** Compatibilidad: la app actual tiene 1 comida por día. */
export function buildShoppingItems(
  days: DayPlan[],
  dishes: Dish[],
): Omit<ShoppingItem, 'id'>[] {
  return buildShoppingItemsForDays(
    days.map((day) => ({
      day: day.day,
      note: day.note,
      meals: [{ slot: 0, mode: day.mode, dishId: day.dishId }],
    })),
    dishes,
  )
}

/** Conserva los tildados de la lista anterior al regenerar. */
export function mergeChecked(
  previous: ShoppingItem[],
  fresh: Omit<ShoppingItem, 'id'>[],
  makeId: () => string,
): ShoppingItem[] {
  const checkedByText = new Map<string, boolean>()
  for (const item of previous) {
    checkedByText.set(item.text.toLowerCase(), item.checked)
    checkedByText.set(ingredientKey(item.text), item.checked)
  }
  return fresh.map((item) => ({
    ...item,
    id: makeId(),
    checked: checkedByText.get(item.text.toLowerCase()) ?? checkedByText.get(ingredientKey(item.text)) ?? false,
  }))
}

/** Regenera la lista desde los platos y conserva tildados e ítems manuales. */
export function mergeShopping(
  previous: ShoppingItem[],
  fresh: Omit<ShoppingItem, 'id'>[],
  makeId: () => string,
): ShoppingItem[] {
  const manual = previous.filter((item) => item.dishId === null)
  return [...mergeChecked(previous, fresh, makeId), ...manual]
}

function ingredientKey(text: string): string {
  return text.toLowerCase().split(' · ')[0]
}

export function sortShopping(items: ShoppingItem[]): ShoppingItem[] {
  const order = new Map<string, number>(
    (CATEGORIES as readonly string[]).map((category, index) => [category, index]),
  )
  // Normaliza categorías viejas (Frutas, Almacén, Especias…) al mostrarlas.
  const normalized = items.map((item) => ({
    ...item,
    category: normalizeCategory(item.category, item.text.split(' · ')[0]),
  }))
  return normalized.sort((a, b) => {
    const byCategory = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99)
    if (byCategory !== 0) return byCategory
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    return a.text.localeCompare(b.text, 'es')
  })
}

export type IngredientDraft = Ingredient
