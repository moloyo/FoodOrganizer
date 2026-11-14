export type ThemeId = 'clasico' | 'cool' | 'oscuro'

export interface ThemeMeta {
  id: ThemeId
  label: string
  hint: string
  /** Color de la barra del navegador / status bar en móvil. */
  themeColor: string
  preview: {
    background: string
    surface: string
    brand: string
    accent: string
  }
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'clasico',
    label: 'Clásico',
    hint: 'Cálido y natural',
    themeColor: '#FAF6EF',
    preview: {
      background: '#faf6ef',
      surface: '#ffffff',
      brand: '#2f6a4f',
      accent: '#d9763d',
    },
  },
  {
    id: 'cool',
    label: 'Cool',
    hint: 'Fresco y moderno',
    themeColor: '#EEF3FA',
    preview: {
      background: '#eef3fa',
      surface: '#ffffff',
      brand: '#2563eb',
      accent: '#0d9488',
    },
  },
  {
    id: 'oscuro',
    label: 'Oscuro',
    hint: 'Para la noche',
    themeColor: '#0F1512',
    preview: {
      background: '#0f1512',
      surface: '#17201b',
      brand: '#5db98d',
      accent: '#e98a5d',
    },
  },
]

export const THEME_STORAGE_KEY = 'comidas:theme'

const THEME_IDS = THEMES.map((theme) => theme.id)

function isThemeId(value: string | null): value is ThemeId {
  return Boolean(value && THEME_IDS.includes(value as ThemeId))
}

/** Tema guardado en este dispositivo. Si no hay nada válido, usa el clásico. */
export function readTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(stored)) return stored
  } catch {
    // localStorage puede fallar en modo privado; seguimos con el tema por defecto.
  }
  return 'clasico'
}

/** Aplica el tema al documento y actualiza el color de la barra del navegador. */
export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement
  if (theme === 'clasico') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = theme
  }

  const meta = document.querySelector('meta[name="theme-color"]')
  const themeColor = THEMES.find((item) => item.id === theme)?.themeColor
  if (meta && themeColor) meta.setAttribute('content', themeColor)
}

/** Guarda la preferencia en este dispositivo y la aplica en el acto. */
export function storeTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Si no se puede guardar, al menos aplicamos el tema en esta sesión.
  }
  applyTheme(theme)
}
