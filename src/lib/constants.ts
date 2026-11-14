import type { DayMode, Difficulty } from '../types'

export interface ModeMeta {
  id: DayMode
  label: string
  short: string
  emoji: string
  hint: string
  color: string
  soft: string
}

export const MODES: ModeMeta[] = [
  {
    id: 'freezer',
    label: 'Del freezer',
    short: 'Freezer',
    emoji: '🧊',
    hint: 'Sacar y listo',
    color: 'var(--mode-freezer)',
    soft: 'var(--mode-freezer-soft)',
  },
  {
    id: 'muy-facil',
    label: 'Muy fácil',
    short: 'Muy fácil',
    emoji: '⚡',
    hint: 'Menos de 15 min',
    color: 'var(--mode-muy-facil)',
    soft: 'var(--mode-muy-facil-soft)',
  },
  {
    id: 'facil',
    label: 'Fácil',
    short: 'Fácil',
    emoji: '🌿',
    hint: '15 a 30 min',
    color: 'var(--mode-facil)',
    soft: 'var(--mode-facil-soft)',
  },
  {
    id: 'media',
    label: 'Media',
    short: 'Media',
    emoji: '🍳',
    hint: '30 a 50 min',
    color: 'var(--mode-media)',
    soft: 'var(--mode-media-soft)',
  },
  {
    id: 'elaborada',
    label: 'Elaborada',
    short: 'Elaborada',
    emoji: '👩‍🍳',
    hint: 'Más de 50 min',
    color: 'var(--mode-elaborada)',
    soft: 'var(--mode-elaborada-soft)',
  },
]

/** Borde translúcido que funciona tanto con colores hex como con variables CSS. */
export function modeBorder(color: string): string {
  return `color-mix(in srgb, ${color} 38%, transparent)`
}

export const COOK_MODES = MODES.filter((m) => m.id !== 'freezer')

export const DIFFICULTY_RANK: Record<Difficulty, number> = {
  'muy-facil': 1,
  facil: 2,
  media: 3,
  elaborada: 4,
}

export function modeMeta(mode: DayMode | null | undefined): ModeMeta | undefined {
  return MODES.find((m) => m.id === mode)
}

export const CATEGORIES = ['Verdulería', 'Supermercado', 'Dietética', 'Otros'] as const

export const CATEGORY_COLORS: Record<string, string> = {
  Verdulería: '#5c8a3a',
  Supermercado: '#3e7cb1',
  Dietética: '#a8792e',
  Otros: '#6b7a70',
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Verdulería: [
    'tomate', 'cebolla', 'morron', 'morrón', 'zapallito', 'zapallo', 'calabaza', 'papa', 'batata',
    'zanahoria', 'apio', 'puerro', 'ajo', 'lechuga', 'rucula', 'rúcula', 'espinaca', 'acelga',
    'brocoli', 'brócoli', 'coliflor', 'berenjena', 'zucchini', 'pepino', 'repollo', 'choclo',
    'champiñon', 'champiñón', 'hongo', 'jengibre', 'limon', 'limón', 'perejil', 'cilantro',
    'albahaca', 'verdeo', 'cebolla de verdeo', 'palta', 'remolacha', 'radicheta', 'kale',
    'manzana', 'banana', 'pera', 'naranja', 'mandarina', 'frutilla', 'arandano', 'arándano',
    'durazno', 'ciruela', 'kiwi', 'uva', 'mango', 'anana', 'ananá', 'lima',
  ],
  Supermercado: [
    'leche', 'queso', 'crema', 'manteca', 'yogur', 'yogurt', 'ricota', 'muzzarella', 'mozzarella',
    'parmesano', 'huevo', 'huevos', 'provoleta', 'port salut', 'crema de leche', 'dulce de leche',
    'pan', 'pan rallado', 'baguette', 'tortilla', 'rap', 'pita', 'bizcocho', 'factura',
    'arvejas', 'guisantes', 'choclo congelado', 'espinaca congelada', 'papas fritas', 'hielo',
    'masa de tarta', 'masa', 'empanada', 'medallon', 'medallón',
    'pimienta', 'oregano', 'orégano', 'comino', 'pimenton', 'pimentón', 'curry', 'canela',
    'nuez moscada', 'aji', 'ají', 'laurel', 'tomillo', 'romero', 'cúrcuma', 'curcuma', 'provenzal',
    'condimento',
    'fideos', 'arroz', 'harina', 'polenta', 'aceite', 'vinagre', 'sal', 'azucar', 'azúcar',
    'conserva', 'tomate triturado', 'pure', 'puré', 'caldo', 'salsa', 'miel', 'mostaza',
    'mayonesa', 'ketchup', 'levadura', 'leche de coco', 'pasta', 'cafe', 'café', 'hummus',
    'alcaparras', 'vino', 'ñoquis', 'noquis',
  ],
  Dietética: [
    'lentejas', 'garbanzos', 'porotos', 'quinoa', 'avena', 'couscous', 'nuez', 'almendra',
    'castaña', 'semilla', 'soja', 'seitan', 'tofu', 'tahini', 'granola', 'ajonjoli', 'ajonjolí',
    'arroz integral', 'harina integral', 'levadura nutricional',
  ],
}

/** Todos los pares categoría/palabra, para quedarse con la coincidencia más específica. */
const CATEGORY_WORDS = Object.entries(CATEGORY_KEYWORDS).flatMap(([category, words]) =>
  words.map((word) => ({ category, word })),
)

export function guessCategory(ingredientName: string): string {
  const name = ingredientName.toLowerCase()
  let best: { category: string; length: number } | null = null
  for (const { category, word } of CATEGORY_WORDS) {
    if (name.includes(word) && (!best || word.length > best.length)) {
      best = { category, length: word.length }
    }
  }
  return best?.category ?? 'Otros'
}

/**
 * Devuelve una categoría válida para los cuatro rubros actuales.
 * Las categorías viejas (Frutas, Almacén, Lácteos y huevos…) se reasignan
 * según el nombre del ingrediente.
 */
export function normalizeCategory(category: string | undefined, ingredientName = ''): string {
  if (category && (CATEGORIES as readonly string[]).includes(category)) return category
  return ingredientName.trim() ? guessCategory(ingredientName) : 'Otros'
}
