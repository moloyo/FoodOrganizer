import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  DayMode,
  DayPlan,
  Dish,
  PlanRow,
  SessionUser,
  ShoppingItem,
  Snapshot,
} from '../types'
import { getAdapter, cloudConfigured, makeId } from '../lib/adapters'
import { currentWeekStart } from '../lib/date'
import {
  buildShoppingItems,
  matchesMode,
  mergeChecked,
  pickSuggestion,
  suggestWeek,
} from '../lib/suggest'
import { SEED_DISHES } from '../data/seed'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
}

interface AppContextValue {
  ready: boolean
  busy: boolean
  user: SessionUser | null
  isCloud: boolean
  cloudConfigured: boolean
  weekStart: string
  days: DayPlan[]
  dishes: Dish[]
  shopping: ShoppingItem[]
  shoppingOutdated: boolean
  history: string[]
  plansForWeek: (week: string) => DayPlan[]
  toasts: Toast[]
  toast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: string) => void
  goToWeek: (weekStart: string) => void
  shiftWeek: (amount: number) => void
  setDayMode: (day: number, mode: DayMode | null) => Promise<void>
  setDayDish: (day: number, dishId: string | null) => Promise<void>
  shuffleDay: (day: number) => Promise<void>
  fillEmptyDays: () => Promise<number>
  clearWeek: () => Promise<void>
  repeatWeek: (sourceWeekStart: string) => Promise<number>
  saveDish: (dish: Dish) => Promise<void>
  deleteDish: (id: string) => Promise<void>
  regenerateShopping: () => Promise<void>
  toggleShopping: (id: string) => Promise<void>
  addShoppingItem: (text: string, category: string) => Promise<void>
  clearCheckedShopping: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  loadExamples: () => Promise<number>
  exportData: () => Promise<Snapshot>
  importData: (snapshot: Snapshot) => Promise<void>
  wipeData: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function emptyDay(day: number): DayPlan {
  return { day, mode: null, dishId: null, note: '' }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => getAdapter(), [])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [weekStart, setWeekStart] = useState(currentWeekStart)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [allPlans, setAllPlans] = useState<PlanRow[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = makeId()
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3800)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  /* ------------------------------- Sesión ------------------------------- */

  useEffect(() => {
    let alive = true
    adapter
      .getUser()
      .then((sessionUser) => {
        if (!alive) return
        setUser(sessionUser)
        setReady(true)
      })
      .catch(() => {
        if (alive) setReady(true)
      })

    const unsubscribe = adapter.onAuthChange((sessionUser) => {
      if (!alive) return
      setUser(sessionUser)
      setReady(true)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [adapter])

  /* --------------------------- Datos iniciales --------------------------- */

  const reloadAll = useCallback(async () => {
    const [nextDishes, nextPlans] = await Promise.all([
      adapter.listDishes(),
      adapter.listPlans(),
    ])
    setDishes(nextDishes)
    setAllPlans(nextPlans)
    const weeks = [...new Set(nextPlans.filter((p) => p.mode || p.dishId).map((p) => p.weekStart))]
    setHistory(weeks.sort((a, b) => b.localeCompare(a)))
  }, [adapter])

  useEffect(() => {
    if (!user) {
      setDishes([])
      setAllPlans([])
      setHistory([])
      setShopping([])
      return
    }
    let alive = true
    setBusy(true)
    reloadAll()
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : 'No pudimos cargar tus datos.', 'error')
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [user?.id, reloadAll, toast])

  useEffect(() => {
    if (!user) return
    let alive = true
    adapter
      .listShopping(weekStart)
      .then((items) => {
        if (alive) setShopping(items)
      })
      .catch((error: unknown) => {
        if (alive) toast(error instanceof Error ? error.message : 'No pudimos cargar la lista.', 'error')
      })
    return () => {
      alive = false
    }
  }, [user?.id, weekStart, adapter, toast])

  /* ------------------------------- Derivados ------------------------------- */

  const days = useMemo<DayPlan[]>(() => {
    return Array.from({ length: 7 }, (_, day) => {
      const row = allPlans.find((plan) => plan.weekStart === weekStart && plan.day === day)
      if (!row) return emptyDay(day)
      return { day: row.day, mode: row.mode, dishId: row.dishId, note: row.note }
    })
  }, [allPlans, weekStart])

  const plannedDishIds = useMemo(
    () => days.map((day) => day.dishId).filter((id): id is string => Boolean(id)),
    [days],
  )

  const shoppingOutdated = useMemo(() => {
    const shoppingDishes = new Set(
      shopping.map((item) => item.dishId).filter((id): id is string => Boolean(id)),
    )
    return plannedDishIds.some((id) => !shoppingDishes.has(id))
  }, [shopping, plannedDishIds])

  /* ------------------------------- Acciones ------------------------------- */

  const persistDay = useCallback(
    async (day: number, patch: Partial<DayPlan>) => {
      const existing = allPlans.find(
        (plan) => plan.weekStart === weekStart && plan.day === day,
      )
      const next: PlanRow = {
        weekStart,
        day,
        mode: patch.mode !== undefined ? patch.mode : (existing?.mode ?? null),
        dishId: patch.dishId !== undefined ? patch.dishId : (existing?.dishId ?? null),
        note: patch.note !== undefined ? patch.note : (existing?.note ?? ''),
      }

      setAllPlans((prev) => {
        const rest = prev.filter(
          (plan) => !(plan.weekStart === weekStart && plan.day === day),
        )
        return [...rest, next]
      })
      setHistory((prev) => {
        if (!next.mode && !next.dishId) return prev
        return prev.includes(weekStart) ? prev : [weekStart, ...prev].sort((a, b) => b.localeCompare(a))
      })

      try {
        await adapter.savePlan(next)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos guardar el día.', 'error')
        await reloadAll()
      }
    },
    [adapter, allPlans, reloadAll, toast, weekStart],
  )

  const setDayMode = useCallback(
    async (day: number, mode: DayMode | null) => {
      const current = allPlans.find(
        (plan) => plan.weekStart === weekStart && plan.day === day,
      )
      const dish = current?.dishId
        ? dishes.find((item) => item.id === current.dishId)
        : undefined
      // Si el plato elegido sigue entrando en la nueva dificultad, lo conservamos.
      const keepDish = Boolean(dish && matchesMode(dish, mode))
      await persistDay(day, keepDish ? { mode } : { mode, dishId: null })
    },
    [allPlans, dishes, persistDay, weekStart],
  )

  const setDayDish = useCallback(
    async (day: number, dishId: string | null) => {
      await persistDay(day, { dishId })
    },
    [persistDay],
  )

  const shuffleDay = useCallback(
    async (day: number) => {
      const current = days.find((item) => item.day === day)
      const mode = current?.mode ?? 'facil'
      const suggestion = pickSuggestion(dishes, mode, { excludeIds: plannedDishIds })
      if (!suggestion) {
        toast(
          mode === 'freezer'
            ? 'No hay platos marcados como aptos para freezer.'
            : 'No hay platos con esa dificultad. Sumá alguno al recetario.',
          'error',
        )
        return
      }
      await persistDay(day, {
        mode: current?.mode ?? mode,
        dishId: suggestion.id,
      })
    },
    [days, dishes, persistDay, plannedDishIds, toast],
  )

  const fillEmptyDays = useCallback(async () => {
    const emptyDays = days.filter((day) => !day.dishId)
    if (emptyDays.length === 0) {
      toast('La semana ya está completa.', 'info')
      return 0
    }
    const picks = suggestWeek(dishes, days)
    if (picks.length === 0) {
      toast('No encontramos platos para esas dificultades.', 'error')
      return 0
    }
    for (const pick of picks) {
      await persistDay(pick.day, { dishId: pick.dishId, mode: pick.mode })
    }
    toast(`${picks.length} cena${picks.length === 1 ? '' : 's'} asignada${picks.length === 1 ? '' : 's'}.`, 'success')
    return picks.length
  }, [days, dishes, persistDay, toast])

  const clearWeek = useCallback(async () => {
    setAllPlans((prev) => prev.filter((plan) => plan.weekStart !== weekStart))
    setShopping([])
    try {
      await adapter.clearWeek(weekStart)
      setHistory((prev) => prev.filter((week) => week !== weekStart))
      toast('Semana vaciada.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos vaciar la semana.', 'error')
      await reloadAll()
    }
  }, [adapter, reloadAll, toast, weekStart])

  const goToWeek = useCallback((next: string) => setWeekStart(next), [])

  const plansForWeek = useCallback(
    (week: string): DayPlan[] =>
      Array.from({ length: 7 }, (_, day) => {
        const row = allPlans.find((plan) => plan.weekStart === week && plan.day === day)
        if (!row) return emptyDay(day)
        return { day: row.day, mode: row.mode, dishId: row.dishId, note: row.note }
      }),
    [allPlans],
  )

  const repeatWeek = useCallback(
    async (source: string) => {
      const sourcePlans = allPlans.filter((plan) => plan.weekStart === source)
      if (sourcePlans.length === 0) return 0
      let copied = 0
      for (const plan of sourcePlans) {
        if (!plan.mode && !plan.dishId) continue
        await persistDay(plan.day, { mode: plan.mode, dishId: plan.dishId, note: plan.note })
        copied += 1
      }
      if (copied > 0) toast('Menú copiado a esta semana.', 'success')
      return copied
    },
    [allPlans, persistDay, toast],
  )

  const shiftWeek = useCallback((amount: number) => {
    setWeekStart((prev) => {
      const date = new Date(`${prev}T12:00:00`)
      date.setDate(date.getDate() + amount * 7)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    })
  }, [])

  const saveDish = useCallback(
    async (dish: Dish) => {
      const withDate = dish.createdAt ? dish : { ...dish, createdAt: new Date().toISOString() }
      setDishes((prev) => {
        const exists = prev.some((item) => item.id === dish.id)
        return exists
          ? prev.map((item) => (item.id === dish.id ? withDate : item))
          : [withDate, ...prev]
      })
      try {
        await adapter.saveDish(withDate)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos guardar el plato.', 'error')
        await reloadAll()
      }
    },
    [adapter, reloadAll, toast],
  )

  const deleteDish = useCallback(
    async (id: string) => {
      setDishes((prev) => prev.filter((item) => item.id !== id))
      setAllPlans((prev) =>
        prev.map((plan) => (plan.dishId === id ? { ...plan, dishId: null } : plan)),
      )
      try {
        await adapter.deleteDish(id)
        toast('Plato eliminado.', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos eliminar el plato.', 'error')
        await reloadAll()
      }
    },
    [adapter, reloadAll, toast],
  )

  const regenerateShopping = useCallback(async () => {
    const fresh = buildShoppingItems(days, dishes)
    const merged = mergeChecked(shopping, fresh, makeId)
    setShopping(merged)
    try {
      await adapter.replaceShopping(weekStart, merged)
      toast('Lista actualizada con los platos de la semana.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos guardar la lista.', 'error')
    }
  }, [adapter, days, dishes, shopping, toast, weekStart])

  const toggleShopping = useCallback(
    async (id: string) => {
      const target = shopping.find((item) => item.id === id)
      if (!target) return
      const updated = { ...target, checked: !target.checked }
      const next = shopping.map((item) => (item.id === id ? updated : item))
      setShopping(next)
      try {
        await adapter.replaceShopping(weekStart, next)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos actualizar el ítem.', 'error')
      }
    },
    [adapter, shopping, toast, weekStart],
  )

  const addShoppingItem = useCallback(
    async (text: string, category: string) => {
      const item: ShoppingItem = {
        id: makeId(),
        text,
        checked: false,
        category,
        dishId: null,
      }
      const next = [...shopping, item]
      setShopping(next)
      try {
        await adapter.replaceShopping(weekStart, next)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos agregar el ítem.', 'error')
      }
    },
    [adapter, shopping, toast, weekStart],
  )

  const clearCheckedShopping = useCallback(async () => {
    const next = shopping.filter((item) => !item.checked)
    setShopping(next)
    try {
      await adapter.replaceShopping(weekStart, next)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos limpiar la lista.', 'error')
    }
  }, [adapter, shopping, toast, weekStart])

  const signIn = useCallback(
    async (email: string, password: string) => {
      await adapter.signIn(email, password)
    },
    [adapter],
  )

  const signUp = useCallback(
    async (email: string, password: string) => adapter.signUp(email, password),
    [adapter],
  )

  const signOut = useCallback(async () => {
    await adapter.signOut()
    setUser(null)
  }, [adapter])

  const loadExamples = useCallback(async () => {
    const existingNames = new Set(dishes.map((dish) => dish.name.toLowerCase()))
    const missing = SEED_DISHES.filter((dish) => !existingNames.has(dish.name.toLowerCase()))
    if (missing.length === 0) {
      toast('Ya tenés todos los platos de ejemplo.', 'info')
      return 0
    }
    try {
      const created = await adapter.seedDishes(missing)
      setDishes((prev) => [...created, ...prev])
      toast(`${created.length} platos de ejemplo agregados.`, 'success')
      return created.length
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos cargar los ejemplos.', 'error')
      return 0
    }
  }, [adapter, dishes, toast])

  const exportData = useCallback(() => adapter.exportAll(), [adapter])

  const importData = useCallback(
    async (snapshot: Snapshot) => {
      await adapter.importAll(snapshot)
      await reloadAll()
      const items = await adapter.listShopping(weekStart)
      setShopping(items)
      toast('Datos importados.', 'success')
    },
    [adapter, reloadAll, toast, weekStart],
  )

  const wipeData = useCallback(async () => {
    await adapter.wipe()
    setDishes([])
    setAllPlans([])
    setShopping([])
    setHistory([])
    toast('Datos borrados.', 'success')
  }, [adapter, toast])

  const value: AppContextValue = {
    ready,
    busy,
    user,
    isCloud: cloudConfigured,
    cloudConfigured,
    weekStart,
    days,
    dishes,
    shopping,
    shoppingOutdated,
    history,
    plansForWeek,
    toasts,
    toast,
    dismissToast,
    goToWeek,
    shiftWeek,
    setDayMode,
    setDayDish,
    shuffleDay,
    fillEmptyDays,
    clearWeek,
    repeatWeek,
    saveDish,
    deleteDish,
    regenerateShopping,
    toggleShopping,
    addShoppingItem,
    clearCheckedShopping,
    signIn,
    signUp,
    signOut,
    loadExamples,
    exportData,
    importData,
    wipeData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider')
  return context
}
