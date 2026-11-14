import type { Dish } from '../types'
import { guessCategory } from './constants'

export interface IngredientSuggestion {
  /** Clave normalizada (sin mayúsculas, tildes ni espacios de más). */
  key: string
  /** Nombre canónico para mostrar y guardar. */
  name: string
  category: string
  /** Cuántas veces aparece en el recetario (las sugerencias más usadas van primero). */
  count: number
}

/**
 * Ingredientes comunes para que el autocompletado sirva incluso con el recetario vacío.
 * No hace falta que estén todos: el catálogo se completa con los platos del usuario.
 */
const COMMON_INGREDIENTS = [
  'Aceite',
  'Aceite de oliva',
  'Agua',
  'Ajo',
  'Albahaca',
  'Almendras',
  'Arroz',
  'Arvejas',
  'Avena',
  'Berenjena',
  'Brócoli',
  'Calabaza',
  'Caldo de verduras',
  'Cebolla',
  'Cebolla de verdeo',
  'Cebolla morada',
  'Champiñones',
  'Choclo',
  'Cilantro',
  'Comino',
  'Crema',
  'Cúrcuma',
  'Curry',
  'Cuscús',
  'Espinaca',
  'Fideos',
  'Garbanzos',
  'Harina',
  'Huevo',
  'Huevos',
  'Jengibre',
  'Laurel',
  'Leche',
  'Leche de coco',
  'Lechuga',
  'Lentejas',
  'Limón',
  'Manteca',
  'Masa de tarta',
  'Mayonesa',
  'Miel',
  'Morrón',
  'Mostaza',
  'Nueces',
  'Orégano',
  'Palta',
  'Pan',
  'Pan rallado',
  'Papa',
  'Papas',
  'Perejil',
  'Pimienta',
  'Pimentón',
  'Porotos',
  'Puré de tomate',
  'Queso',
  'Queso crema',
  'Queso rallado',
  'Quinoa',
  'Sal',
  'Salsa de soja',
  'Semillas',
  'Tofu',
  'Tomate',
  'Tomate triturado',
  'Vinagre',
  'Yogur',
  'Zanahoria',
  'Zapallito',
  'Zapallo',
] as const

/** Unifica mayúsculas, tildes y espacios: " Queso  Rallado " → "queso rallado". */
export function normalizeIngredientName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Deja el nombre prolijo sin cambiar el resto del texto. */
export function formatIngredientName(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** Si el nombre coincide con uno conocido, devuelve el nombre canónico. */
export function canonicalIngredientName(
  catalog: IngredientSuggestion[],
  value: string,
): string {
  const key = normalizeIngredientName(value)
  if (!key) return ''
  return catalog.find((item) => item.key === key)?.name ?? formatIngredientName(value)
}

interface CatalogBucket {
  spellings: Map<string, number>
  categories: Map<string, number>
  count: number
}

/**
 * Construye el catálogo con los ingredientes ya usados en el recetario y la lista base.
 * Los ingredientes usados pesan más para que aparezcan primero al enfocar el campo.
 */
export function buildIngredientCatalog(dishes: Dish[]): IngredientSuggestion[] {
  const buckets = new Map<string, CatalogBucket>()

  function add(rawName: string, category: string | undefined, weight: number) {
    const name = rawName.replace(/\s+/g, ' ').trim()
    const key = normalizeIngredientName(name)
    if (!key) return

    const bucket =
      buckets.get(key) ?? { spellings: new Map(), categories: new Map(), count: 0 }
    bucket.spellings.set(name, (bucket.spellings.get(name) ?? 0) + weight)
    if (category) {
      bucket.categories.set(category, (bucket.categories.get(category) ?? 0) + weight)
    }
    bucket.count += weight
    buckets.set(key, bucket)
  }

  for (const dish of dishes) {
    for (const ingredient of dish.ingredients) {
      add(ingredient.name, ingredient.category, 10)
    }
  }
  for (const name of COMMON_INGREDIENTS) {
    add(name, undefined, 1)
  }

  const suggestions: IngredientSuggestion[] = []
  for (const [key, bucket] of buckets) {
    const bestSpelling =
      [...bucket.spellings.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        const aCapitalized = /^[A-ZÁÉÍÓÚÑ]/.test(a[0]) ? 1 : 0
        const bCapitalized = /^[A-ZÁÉÍÓÚÑ]/.test(b[0]) ? 1 : 0
        if (aCapitalized !== bCapitalized) return bCapitalized - aCapitalized
        return a[0].localeCompare(b[0], 'es')
      })[0]?.[0] ?? key

    const bestCategory =
      [...bucket.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      guessCategory(bestSpelling)

    suggestions.push({
      key,
      name: formatIngredientName(bestSpelling),
      category: bestCategory,
      count: bucket.count,
    })
  }

  return suggestions.sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'),
  )
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      )
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * Busca sugerencias por coincidencia exacta, prefijo, palabra, substring y errores
 * de tipeo (distancia de edición). "eso" encuentra "Queso"; "qeso" también.
 */
export function searchIngredients(
  catalog: IngredientSuggestion[],
  query: string,
  limit = 6,
): IngredientSuggestion[] {
  const normalized = normalizeIngredientName(query)
  if (!normalized) return catalog.slice(0, limit)

  const scored: { item: IngredientSuggestion; score: number }[] = []

  for (const item of catalog) {
    const name = normalizeIngredientName(item.name)
    let score = 0

    if (name === normalized) {
      score = 1000
    } else if (name.startsWith(normalized)) {
      score = 850 - (name.length - normalized.length)
    } else {
      const words = name.split(' ')
      const wordIndex = words.findIndex((word) => word.startsWith(normalized))
      if (wordIndex >= 0) {
        score = 760 - wordIndex * 10
      } else {
        const index = name.indexOf(normalized)
        if (index >= 0) score = 650 - index * 5
      }
    }

    if (score === 0 && normalized.length >= 3) {
      let bestDistance = Number.POSITIVE_INFINITY
      for (const word of name.split(' ')) {
        bestDistance = Math.min(bestDistance, editDistance(normalized, word))
      }
      if (bestDistance <= 2) score = 520 - bestDistance * 60
    }

    if (score > 0) scored.push({ item, score })
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.count - a.item.count ||
        a.item.name.localeCompare(b.item.name, 'es'),
    )
    .slice(0, limit)
    .map((entry) => entry.item)
}
