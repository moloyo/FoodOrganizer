import type { DayMode, DayPlan, Dish, Ingredient, ShoppingItem } from '../types'
import { CATEGORIES, DIFFICULTY_RANK, normalizeCategory } from './constants'

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

export function suggestWeek(
  dishes: Dish[],
  days: DayPlan[],
): { day: number; dishId: string; mode: DayMode }[] {
  const used: string[] = []
  const picks: { day: number; dishId: string; mode: DayMode }[] = []
  for (const day of days) {
    if (day.dishId) {
      used.push(day.dishId)
      continue
    }
    const mode = day.mode ?? 'facil'
    const dish = pickSuggestion(dishes, mode, { excludeIds: used })
    if (dish) {
      used.push(dish.id)
      picks.push({ day: day.day, dishId: dish.id, mode })
    }
  }
  return picks
}

/* ------------------------------ Lista de compras ------------------------------ */

interface GroupedIngredient {
  name: string
  quantities: string[]
  unit: string
  category: string
  dishId: string | null
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

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function buildShoppingItems(days: DayPlan[], dishes: Dish[]): Omit<ShoppingItem, 'id'>[] {
  const groups = new Map<string, GroupedIngredient>()

  for (const day of days) {
    if (!day.dishId) continue
    const dish = dishes.find((d) => d.id === day.dishId)
    if (!dish) continue
    for (const ingredient of dish.ingredients) {
      const name = ingredient.name.trim()
      if (!name) continue
      const unit = (ingredient.unit ?? '').trim()
      const category = normalizeCategory(ingredient.category, name)
      const key = `${category}|${name.toLowerCase()}|${unit.toLowerCase()}`
      const existing = groups.get(key)
      if (existing) {
        if (ingredient.qty.trim()) existing.quantities.push(ingredient.qty.trim())
      } else {
        groups.set(key, {
          name,
          quantities: ingredient.qty.trim() ? [ingredient.qty.trim()] : [],
          unit,
          category,
          dishId: dish.id,
        })
      }
    }
  }

  const items: Omit<ShoppingItem, 'id'>[] = []
  for (const group of groups.values()) {
    let quantityText = ''
    const numeric = group.quantities.map(parseQty)
    if (group.quantities.length > 0 && numeric.every((n) => n !== null)) {
      const sum = (numeric as number[]).reduce((total, n) => total + n, 0)
      quantityText = formatQty(sum)
    } else if (group.quantities.length > 0) {
      quantityText = [...new Set(group.quantities)].join(' + ')
    }

    const detail = [quantityText, group.unit].filter(Boolean).join(' ')
    items.push({
      text: `${capitalizeFirst(group.name)}${detail ? ` · ${detail}` : ''}`,
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
