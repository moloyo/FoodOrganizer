import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  DayMode,
  DayPlan,
  Dish,
  Household,
  HouseholdInvite,
  HouseholdMember,
  InviteInfo,
  OfflineStatus,
  PlanRow,
  SessionUser,
  ShoppingItem,
  Snapshot,
} from '../types'
import { getAdapter, cloudConfigured, makeId } from '../lib/adapters'
import { currentWeekStart } from '../lib/date'
import { normalizeCategory } from '../lib/constants'
import {
  buildIngredientCatalog,
  canonicalIngredientName,
} from '../lib/ingredients'
import {
  buildShoppingItems,
  matchesMode,
  mergeShopping,
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
  /** Los datos iniciales (platos y planes) ya se cargaron al menos una vez. */
  loaded: boolean
  busy: boolean
  /** Estado de red y cambios pendientes de sincronizar (modo nube). */
  offlineStatus: OfflineStatus
  /** Reintenta a mano la cola de cambios pendientes. */
  retrySync: () => void
  user: SessionUser | null
  /** Hogar compartido al que pertenece la sesión. */
  household: Household | null
  householdMembers: HouseholdMember[]
  householdInvites: HouseholdInvite[]
  refreshHousehold: () => Promise<void>
  createInvite: () => Promise<HouseholdInvite>
  revokeInvite: (token: string) => Promise<void>
  renameHousehold: (name: string) => Promise<void>
  leaveHousehold: () => Promise<void>
  joinHousehold: (token: string) => Promise<Household>
  getInviteInfo: (token: string) => Promise<InviteInfo | null>
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
  setDayNote: (day: number, note: string) => Promise<void>
  shuffleDay: (day: number) => Promise<void>
  fillEmptyDays: () => Promise<number>
  clearWeek: () => Promise<void>
  repeatWeek: (sourceWeekStart: string) => Promise<number>
  saveDish: (dish: Dish) => Promise<void>
  deleteDish: (id: string) => Promise<void>
  normalizeIngredients: () => Promise<number>
  regenerateShopping: () => Promise<void>
  toggleShopping: (id: string) => Promise<void>
  addShoppingItem: (text: string, category: string) => Promise<void>
  updateShoppingItem: (id: string, text: string, category?: string) => Promise<void>
  deleteShoppingItem: (id: string) => Promise<void>
  clearCheckedShopping: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  deleteAccount: () => Promise<void>
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
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([])
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([])
  const [weekStart, setWeekStart] = useState(currentWeekStart)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [allPlans, setAllPlans] = useState<PlanRow[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>(() =>
    adapter.offline?.getStatus() ?? {
      online: true,
      pending: 0,
      syncing: false,
      lastError: null,
    },
  )

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

  const refreshHousehold = useCallback(async () => {
    const [nextHousehold, nextMembers, nextInvites] = await Promise.all([
      adapter.getHousehold(),
      adapter.listHouseholdMembers(),
      adapter.listHouseholdInvites(),
    ])
    setHousehold(nextHousehold)
    setHouseholdMembers(nextMembers)
    setHouseholdInvites(nextInvites)
  }, [adapter])

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
      .catch((error: unknown) => {
        if (alive) {
          setReady(true)
          toast(
            error instanceof Error ? error.message : 'No pudimos iniciar tu sesión.',
            'error',
          )
        }
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
  }, [adapter, toast])

  useEffect(() => {
    if (!user) {
      setHousehold(null)
      setHouseholdMembers([])
      setHouseholdInvites([])
      return
    }
    void refreshHousehold().catch((error: unknown) => {
      toast(
        error instanceof Error ? error.message : 'No pudimos cargar tu hogar.',
        'error',
      )
    })
  }, [user?.id, user?.householdId, refreshHousehold, toast])

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

  /** Tras unirnos o salir de un hogar cambia el ámbito: recargamos todo. */
  const refreshAfterMembershipChange = useCallback(async () => {
    const nextUser = await adapter.getUser()
    setUser(nextUser)
    adapter.offline?.rescope?.(nextUser?.householdId ?? nextUser?.id ?? null)
    await Promise.all([
      reloadAll().catch(() => {}),
      adapter
        .listShopping(weekStart)
        .then(setShopping)
        .catch(() => {}),
      refreshHousehold(),
    ])
  }, [adapter, reloadAll, refreshHousehold, weekStart])

  const createInvite = useCallback(async () => {
    const invite = await adapter.createHouseholdInvite()
    await refreshHousehold()
    return invite
  }, [adapter, refreshHousehold])

  const revokeInvite = useCallback(
    async (token: string) => {
      await adapter.revokeHouseholdInvite(token)
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const renameHousehold = useCallback(
    async (name: string) => {
      await adapter.renameHousehold(name)
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const joinHousehold = useCallback(
    async (token: string) => {
      const joined = await adapter.joinHousehold(token)
      await refreshAfterMembershipChange()
      toast(`Te uniste a ${joined.name}.`, 'success')
      return joined
    },
    [adapter, refreshAfterMembershipChange, toast],
  )

  const leaveHousehold = useCallback(async () => {
    await adapter.leaveHousehold()
    await refreshAfterMembershipChange()
    toast('Saliste del hogar. Tus datos compartidos quedan ahí.', 'success')
  }, [adapter, refreshAfterMembershipChange, toast])

  const getInviteInfo = useCallback(
    (token: string) => adapter.getHouseholdInviteInfo(token),
    [adapter],
  )

  useEffect(() => {
    if (!user) {
      setDishes([])
      setAllPlans([])
      setHistory([])
      setShopping([])
      setLoaded(true)
      return
    }
    let alive = true
    setBusy(true)
    setLoaded(false)
    reloadAll()
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : 'No pudimos cargar tus datos.', 'error')
      })
      .finally(() => {
        if (alive) {
          setBusy(false)
          setLoaded(true)
        }
      })
    return () => {
      alive = false
    }
  }, [user?.id, user?.householdId, reloadAll, toast])

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
  }, [user?.id, user?.householdId, weekStart, adapter, toast])

  /* --------------------------- Offline / sincronización --------------------------- */

  const wasSyncing = useRef(false)
  const lastErrorAt = useRef(0)

  useEffect(() => {
    const support = adapter.offline
    if (!support) {
      setOfflineStatus({ online: true, pending: 0, syncing: false, lastError: null })
      return
    }
    setOfflineStatus(support.getStatus())
    return support.subscribe(setOfflineStatus)
  }, [adapter])

  useEffect(() => {
    // Cuando termina una sincronización sin pendientes, releemos del servidor
    // para confirmar que la cola dejó la misma foto que mostramos en pantalla.
    if (wasSyncing.current && !offlineStatus.syncing && offlineStatus.pending === 0) {
      void reloadAll().catch(() => {})
      void adapter
        .listShopping(weekStart)
        .then(setShopping)
        .catch(() => {})
    }
    wasSyncing.current = offlineStatus.syncing

    const error = offlineStatus.lastError
    if (error && error.at !== lastErrorAt.current) {
      lastErrorAt.current = error.at
      toast(`No pudimos sincronizar un cambio: ${error.message}`, 'error')
    }
  }, [adapter, offlineStatus, reloadAll, toast, weekStart])

  const retrySync = useCallback(() => {
    void adapter.offline?.flush()
  }, [adapter])

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

  const setDayNote = useCallback(
    async (day: number, note: string) => {
      await persistDay(day, { note })
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

  const normalizeIngredients = useCallback(async () => {
    // Unifica variantes viejas ("queso", "eso") con el nombre canónico y reasigna
    // rubros anteriores. Solo guarda los platos que realmente cambian.
    const catalog = buildIngredientCatalog(dishes)
    const changed: Dish[] = []
    for (const dish of dishes) {
      let dirty = false
      const ingredients = dish.ingredients.map((ingredient) => {
        const name = canonicalIngredientName(catalog, ingredient.name)
        const category = ingredient.category
          ? normalizeCategory(ingredient.category, name)
          : ingredient.category
        if (name !== ingredient.name || category !== ingredient.category) dirty = true
        return { ...ingredient, name, category }
      })
      if (dirty) changed.push({ ...dish, ingredients })
    }

    if (changed.length === 0) {
      toast('Los ingredientes ya están normalizados.', 'info')
      return 0
    }

    const byId = new Map(changed.map((dish) => [dish.id, dish]))
    setDishes((prev) => prev.map((dish) => byId.get(dish.id) ?? dish))
    try {
      await Promise.all(changed.map((dish) => adapter.saveDish(dish)))
      toast(
        `${changed.length} plato${changed.length === 1 ? '' : 's'} con ingredientes normalizados.`,
        'success',
      )
      return changed.length
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'No pudimos normalizar los ingredientes.',
        'error',
      )
      await reloadAll()
      return 0
    }
  }, [adapter, dishes, reloadAll, toast])

  const regenerateShopping = useCallback(async () => {
    const fresh = buildShoppingItems(days, dishes)
    const merged = mergeShopping(shopping, fresh, makeId)
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

  const updateShoppingItem = useCallback(
    async (id: string, text: string, category?: string) => {
      const next = shopping.map((item) =>
        item.id === id ? { ...item, text, ...(category ? { category } : {}) } : item,
      )
      setShopping(next)
      try {
        await adapter.replaceShopping(weekStart, next)
        toast('Ítem actualizado.', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos editar el ítem.', 'error')
        await reloadAll()
      }
    },
    [adapter, reloadAll, shopping, toast, weekStart],
  )

  const deleteShoppingItem = useCallback(
    async (id: string) => {
      const next = shopping.filter((item) => item.id !== id)
      setShopping(next)
      try {
        await adapter.deleteShoppingItem(id)
        toast('Ítem quitado de la lista.', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos quitar el ítem.', 'error')
      }
    },
    [adapter, shopping, toast],
  )

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

  const resetPassword = useCallback(
    async (email: string) => {
      await adapter.resetPassword(email)
    },
    [adapter],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      await adapter.updatePassword(password)
    },
    [adapter],
  )

  const deleteAccount = useCallback(async () => {
    await adapter.deleteAccount()
    setUser(null)
    setDishes([])
    setAllPlans([])
    setShopping([])
    setHistory([])
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
    loaded,
    busy,
    offlineStatus,
    retrySync,
    user,
    household,
    householdMembers,
    householdInvites,
    refreshHousehold,
    createInvite,
    revokeInvite,
    renameHousehold,
    leaveHousehold,
    joinHousehold,
    getInviteInfo,
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
    setDayNote,
    shuffleDay,
    fillEmptyDays,
    clearWeek,
    repeatWeek,
    saveDish,
    deleteDish,
    normalizeIngredients,
    regenerateShopping,
    toggleShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    clearCheckedShopping,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    deleteAccount,
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
