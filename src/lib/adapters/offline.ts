import type {
  DataAdapter,
  Dish,
  OfflineStatus,
  PlanRow,
  SessionUser,
  ShoppingItem,
  ShoppingRow,
  Snapshot,
} from '../../types'
import { isUuid, newUuid } from '../uuid'

/**
 * Adaptador que envuelve al de Supabase para que la app siga funcionando sin red:
 *
 * - **Caché de lectura** por usuario en `localStorage`: platos, planes y compras.
 *   Si una lectura falla por falta de conexión, se devuelven los últimos datos guardados.
 * - **Cola de escrituras** por usuario: si una escritura falla por red, se guarda la
 *   operación y se reintenta en orden al volver la conexión (o al abrir la app).
 * - Los datos de usuarios distintos nunca se mezclan: cada clave incluye el id de usuario.
 *
 * Solo se envuelve el adaptador de nube; el modo local ya persiste en `localStorage`.
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key?(index: number): string | null
  readonly length?: number
}

export interface OfflineOptions {
  /** Permite inyectar un storage en tests; `null` desactiva la persistencia. */
  storage?: StorageLike | null
  isOnline?: () => boolean
  now?: () => number
}

const CACHE_PREFIX = 'comidas:cache:v1'
const QUEUE_PREFIX = 'comidas:queue:v1'

type ShoppingCache = Record<string, ShoppingItem[]>

type QueueOp =
  | { type: 'saveDish'; dish: Dish }
  | { type: 'deleteDish'; id: string }
  | { type: 'savePlan'; row: PlanRow }
  | { type: 'clearWeek'; weekStart: string }
  | { type: 'replaceShopping'; weekStart: string; items: ShoppingItem[] }
  | { type: 'deleteShoppingItem'; id: string }

const NETWORK_HINTS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'fetch failed',
  'err_internet_disconnected',
  'internet connection appears to be offline',
  'the internet connection appears to be offline',
  'network request failed',
  'timeout',
  'timed out',
  'the operation was aborted',
  'aborterror',
  'service unavailable',
  'bad gateway',
  'gateway timeout',
]

/** ¿El error parece de red (y por lo tanto conviene encolarlo)? */
export function isOfflineError(error: unknown, online: boolean): boolean {
  if (!online) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  return NETWORK_HINTS.some((hint) => lower.includes(hint))
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    localStorage.getItem(CACHE_PREFIX)
    return localStorage
  } catch {
    return null
  }
}

function readJson<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // sin espacio o modo privado: seguimos en memoria
  }
}

function cacheKey(userId: string, name: 'dishes' | 'plans' | 'shopping'): string {
  return `${CACHE_PREFIX}:${userId}:${name}`
}

function queueKey(userId: string): string {
  return `${QUEUE_PREFIX}:${userId}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Error desconocido')
}

function noCacheError(): Error {
  return new Error('Sin conexión y no hay datos guardados todavía. Probá de nuevo cuando tengas red.')
}

function noSessionError(): Error {
  return new Error('Tu sesión expiró. Volvé a ingresar.')
}

/** Une operaciones equivalentes para que la cola no crezca de más. */
function compactQueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  const next = queue.filter((existing) => {
    if (op.type === 'saveDish') {
      if (existing.type === 'saveDish') return existing.dish.id !== op.dish.id
      if (existing.type === 'deleteDish') return existing.id !== op.dish.id
    }
    if (op.type === 'deleteDish') {
      if (existing.type === 'saveDish') return existing.dish.id !== op.id
      if (existing.type === 'deleteDish') return existing.id !== op.id
    }
    if (op.type === 'savePlan' && existing.type === 'savePlan') {
      return !(
        existing.row.weekStart === op.row.weekStart && existing.row.day === op.row.day
      )
    }
    if (op.type === 'replaceShopping' && existing.type === 'replaceShopping') {
      return existing.weekStart !== op.weekStart
    }
    if (op.type === 'deleteShoppingItem' && existing.type === 'deleteShoppingItem') {
      return existing.id !== op.id
    }
    if (op.type === 'clearWeek') {
      if (existing.type === 'clearWeek') return existing.weekStart !== op.weekStart
      if (existing.type === 'savePlan') return existing.row.weekStart !== op.weekStart
      if (existing.type === 'replaceShopping') return existing.weekStart !== op.weekStart
    }
    return true
  })
  next.push(op)
  return next
}

export function createOfflineAdapter(
  base: DataAdapter,
  options: OfflineOptions = {},
): DataAdapter {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const isOnline = options.isOnline ?? defaultIsOnline
  const now = options.now ?? (() => Date.now())

  const memoryQueues = new Map<string, QueueOp[]>()

  let userId: string | null = null
  let status: OfflineStatus = {
    online: isOnline(),
    pending: 0,
    syncing: false,
    lastError: null,
  }
  let flushPromise: Promise<void> | null = null
  const listeners = new Set<(next: OfflineStatus) => void>()

  function emit(): void {
    const snapshot = { ...status }
    for (const listener of listeners) listener(snapshot)
  }

  function patchStatus(partial: Partial<OfflineStatus>): void {
    status = { ...status, ...partial }
    emit()
  }

  function readQueue(uid: string): QueueOp[] {
    if (!storage) return memoryQueues.get(uid) ?? []
    return readJson<QueueOp[]>(storage, queueKey(uid)) ?? []
  }

  function writeQueue(uid: string, queue: QueueOp[]): void {
    if (!storage) {
      memoryQueues.set(uid, queue)
      return
    }
    if (queue.length === 0) {
      try {
        storage.removeItem(queueKey(uid))
      } catch {
        // ignoramos
      }
      return
    }
    writeJson(storage, queueKey(uid), queue)
  }

  function enqueue(uid: string, op: QueueOp): void {
    writeQueue(uid, compactQueue(readQueue(uid), op))
    patchStatus({ pending: readQueue(uid).length })
  }

  async function ensureUserId(): Promise<string | null> {
    if (userId) return userId
    const user = await base.getUser()
    userId = user?.id ?? null
    return userId
  }

  /* ------------------------------- Caché ------------------------------- */

  function cacheGet<T>(uid: string, name: 'dishes' | 'plans' | 'shopping'): T | null {
    return readJson<T>(storage, cacheKey(uid, name))
  }

  function cacheSet(uid: string, name: 'dishes' | 'plans' | 'shopping', value: unknown): void {
    writeJson(storage, cacheKey(uid, name), value)
  }

  function cacheClearUser(uid: string): void {
    if (!storage) return
    for (const name of ['dishes', 'plans', 'shopping'] as const) {
      try {
        storage.removeItem(cacheKey(uid, name))
      } catch {
        // ignoramos
      }
    }
  }

  function cacheUpsertDish(uid: string, dish: Dish): void {
    const dishes = cacheGet<Dish[]>(uid, 'dishes')
    if (!dishes) return
    const index = dishes.findIndex((item) => item.id === dish.id)
    if (index >= 0) dishes[index] = dish
    else dishes.unshift(dish)
    cacheSet(uid, 'dishes', dishes)
  }

  function cachePrependDishes(uid: string, created: Dish[]): void {
    const dishes = cacheGet<Dish[]>(uid, 'dishes')
    if (!dishes) return
    const known = new Set(dishes.map((dish) => dish.id))
    cacheSet(uid, 'dishes', [...created.filter((dish) => !known.has(dish.id)), ...dishes])
  }

  function cacheRemoveDish(uid: string, id: string): void {
    const dishes = cacheGet<Dish[]>(uid, 'dishes')
    if (dishes) cacheSet(uid, 'dishes', dishes.filter((dish) => dish.id !== id))
    const plans = cacheGet<PlanRow[]>(uid, 'plans')
    if (plans) {
      cacheSet(
        uid,
        'plans',
        plans.map((plan) => (plan.dishId === id ? { ...plan, dishId: null } : plan)),
      )
    }
  }

  function cacheUpsertPlan(uid: string, row: PlanRow): void {
    const plans = cacheGet<PlanRow[]>(uid, 'plans')
    if (!plans) return
    const index = plans.findIndex(
      (plan) => plan.weekStart === row.weekStart && plan.day === row.day,
    )
    if (index >= 0) plans[index] = row
    else plans.push(row)
    cacheSet(uid, 'plans', plans)
  }

  function cacheClearWeek(uid: string, weekStart: string): void {
    const plans = cacheGet<PlanRow[]>(uid, 'plans')
    if (plans) {
      cacheSet(uid, 'plans', plans.filter((plan) => plan.weekStart !== weekStart))
    }
    const shopping = cacheGet<ShoppingCache>(uid, 'shopping')
    if (shopping && shopping[weekStart]) {
      delete shopping[weekStart]
      cacheSet(uid, 'shopping', shopping)
    }
  }

  function shoppingCacheFor(uid: string): ShoppingCache {
    return cacheGet<ShoppingCache>(uid, 'shopping') ?? {}
  }

  function cacheHasShoppingWeek(uid: string, weekStart: string): boolean {
    return Array.isArray(shoppingCacheFor(uid)[weekStart])
  }

  function cacheSetShoppingWeek(uid: string, weekStart: string, items: ShoppingItem[]): void {
    const shopping = shoppingCacheFor(uid)
    shopping[weekStart] = items
    cacheSet(uid, 'shopping', shopping)
  }

  function cacheRemoveShoppingWeek(uid: string, weekStart: string): void {
    const shopping = cacheGet<ShoppingCache>(uid, 'shopping')
    if (!shopping) return
    delete shopping[weekStart]
    cacheSet(uid, 'shopping', shopping)
  }

  function cacheRemoveShoppingItem(uid: string, id: string): void {
    const shopping = cacheGet<ShoppingCache>(uid, 'shopping')
    if (!shopping) return
    for (const week of Object.keys(shopping)) {
      shopping[week] = shopping[week].filter((item) => item.id !== id)
    }
    cacheSet(uid, 'shopping', shopping)
  }

  /* ------------------------------- Cola ------------------------------- */

  async function applyOp(op: QueueOp): Promise<void> {
    switch (op.type) {
      case 'saveDish':
        await base.saveDish(op.dish)
        return
      case 'deleteDish':
        await base.deleteDish(op.id)
        return
      case 'savePlan':
        await base.savePlan(op.row)
        return
      case 'clearWeek':
        await base.clearWeek(op.weekStart)
        return
      case 'replaceShopping':
        await base.replaceShopping(op.weekStart, op.items)
        return
      case 'deleteShoppingItem':
        await base.deleteShoppingItem(op.id)
        return
    }
  }

  async function flush(): Promise<void> {
    if (flushPromise) return flushPromise
    const uid = userId
    if (!uid || !isOnline()) {
      patchStatus({ online: isOnline(), pending: userId ? readQueue(userId).length : 0 })
      return
    }
    const queue = readQueue(uid)
    if (queue.length === 0) {
      if (status.pending !== 0 || status.lastError) {
        patchStatus({ pending: 0, lastError: null })
      }
      return
    }

    flushPromise = (async () => {
      patchStatus({ syncing: true, online: true })
      while (true) {
        // Si el usuario cambió (logout / otra cuenta), no escribimos con la sesión nueva.
        if (userId !== uid) break
        const current = readQueue(uid)
        const op = current[0]
        if (!op) break
        try {
          await applyOp(op)
          writeQueue(uid, current.slice(1))
          patchStatus({
            pending: current.length - 1,
            lastError: current.length - 1 === 0 ? null : status.lastError,
          })
        } catch (error) {
          if (isOfflineError(error, isOnline())) {
            patchStatus({
              online: false,
              lastError: {
                message: 'Sin conexión. Los cambios quedan guardados para reintentar.',
                at: now(),
              },
            })
            break
          }
          // Error definitivo (validación, permisos): descartamos solo esa operación.
          writeQueue(uid, current.slice(1))
          patchStatus({
            pending: current.length - 1,
            lastError: { message: errorMessage(error), at: now() },
          })
        }
      }
      patchStatus({ syncing: false, online: isOnline() })
    })().finally(() => {
      flushPromise = null
      if (userId) patchStatus({ pending: readQueue(userId).length })
    })

    return flushPromise
  }

  /* ------------------------------- Eventos ------------------------------- */

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
      patchStatus({ online: false })
    })
    window.addEventListener('online', () => {
      patchStatus({ online: true })
      void flush()
    })
  }

  function cacheSnapshot(uid: string): Snapshot | null {
    const dishes = cacheGet<Dish[]>(uid, 'dishes')
    const plans = cacheGet<PlanRow[]>(uid, 'plans')
    if (!dishes || !plans) return null
    const shopping: ShoppingRow[] = Object.entries(shoppingCacheFor(uid)).flatMap(
      ([weekStart, items]) => items.map((item) => ({ ...item, weekStart })),
    )
    return {
      app: 'comidas',
      version: 1,
      exportedAt: new Date().toISOString(),
      dishes,
      plans,
      shopping,
    }
  }

  /* --------------------------- Adaptador final --------------------------- */

  return {
    kind: base.kind,
    offline: {
      getStatus: () => ({ ...status }),
      subscribe(cb) {
        listeners.add(cb)
        cb({ ...status })
        return () => {
          listeners.delete(cb)
        }
      },
      flush,
    },

    async getUser(): Promise<SessionUser | null> {
      const user = await base.getUser()
      userId = user?.id ?? null
      patchStatus({ pending: userId ? readQueue(userId).length : 0 })
      if (userId && isOnline()) void flush()
      return user
    },

    onAuthChange(cb) {
      return base.onAuthChange((user) => {
        userId = user?.id ?? null
        patchStatus({ pending: userId ? readQueue(userId).length : 0 })
        cb(user)
        if (userId && isOnline()) void flush()
      })
    },

    async signIn(email, password) {
      await base.signIn(email, password)
    },

    async signUp(email, password) {
      return base.signUp(email, password)
    },

    async signOut() {
      // Intentamos vaciar la cola antes de cerrar sesión; si no se puede, queda guardada.
      if (userId && isOnline()) await flush()
      await base.signOut()
      userId = null
      patchStatus({ pending: 0 })
    },

    resetPassword: (email) => base.resetPassword(email),
    updatePassword: (password) => base.updatePassword(password),

    async deleteAccount() {
      const uid = userId
      await base.deleteAccount()
      if (uid) {
        cacheClearUser(uid)
        writeQueue(uid, [])
      }
      userId = null
      patchStatus({ pending: 0, lastError: null })
    },

    async listDishes() {
      const uid = await ensureUserId()
      if (!isOnline()) {
        const cached = uid ? cacheGet<Dish[]>(uid, 'dishes') : null
        if (cached) return cached
        throw noCacheError()
      }
      try {
        const dishes = await base.listDishes()
        if (uid) cacheSet(uid, 'dishes', dishes)
        return dishes
      } catch (error) {
        const cached = uid ? cacheGet<Dish[]>(uid, 'dishes') : null
        if (cached && isOfflineError(error, isOnline())) return cached
        throw error
      }
    },

    async saveDish(dish) {
      const uid = await ensureUserId()
      if (uid) cacheUpsertDish(uid, dish)
      if (!isOnline()) {
        if (!uid) throw noSessionError()
        enqueue(uid, { type: 'saveDish', dish })
        return dish
      }
      try {
        return await base.saveDish(dish)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'saveDish', dish })
          return dish
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async deleteDish(id) {
      const uid = await ensureUserId()
      if (uid) cacheRemoveDish(uid, id)
      if (!isOnline()) {
        if (!uid) throw noSessionError()
        enqueue(uid, { type: 'deleteDish', id })
        return
      }
      try {
        await base.deleteDish(id)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'deleteDish', id })
          return
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async seedDishes(dishes) {
      const uid = await ensureUserId()
      // Normalizamos los ids antes de enviar: si la red falla después de insertar,
      // el reintento hace upsert con los mismos ids y no duplica platos.
      const prepared = dishes.map((dish) =>
        isUuid(dish.id) ? dish : { ...dish, id: newUuid() },
      )
      if (isOnline()) {
        try {
          const created = await base.seedDishes(prepared)
          if (uid) cachePrependDishes(uid, created)
          return created
        } catch (error) {
          if (!uid || !isOfflineError(error, isOnline())) {
            if (uid) cacheClearUser(uid)
            throw error
          }
        }
      }
      if (!uid) throw new Error('Tu sesión expiró. Volvé a ingresar.')
      for (const dish of prepared) enqueue(uid, { type: 'saveDish', dish })
      cachePrependDishes(uid, prepared)
      return prepared
    },

    async listPlans() {
      const uid = await ensureUserId()
      if (!isOnline()) {
        const cached = uid ? cacheGet<PlanRow[]>(uid, 'plans') : null
        if (cached) return cached
        throw noCacheError()
      }
      try {
        const plans = await base.listPlans()
        if (uid) cacheSet(uid, 'plans', plans)
        return plans
      } catch (error) {
        const cached = uid ? cacheGet<PlanRow[]>(uid, 'plans') : null
        if (cached && isOfflineError(error, isOnline())) return cached
        throw error
      }
    },

    async savePlan(row) {
      const uid = await ensureUserId()
      if (uid) cacheUpsertPlan(uid, row)
      if (!isOnline()) {
        if (!uid) throw noSessionError()
        enqueue(uid, { type: 'savePlan', row })
        return
      }
      try {
        await base.savePlan(row)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'savePlan', row })
          return
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async clearWeek(weekStart) {
      const uid = await ensureUserId()
      if (uid) cacheClearWeek(uid, weekStart)
      if (!isOnline()) {
        if (!uid) throw noSessionError()
        enqueue(uid, { type: 'clearWeek', weekStart })
        return
      }
      try {
        await base.clearWeek(weekStart)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'clearWeek', weekStart })
          return
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async listShopping(weekStart) {
      const uid = await ensureUserId()
      if (!isOnline()) {
        const cached = uid ? shoppingCacheFor(uid)[weekStart] : null
        if (Array.isArray(cached)) return cached
        throw noCacheError()
      }
      try {
        const items = await base.listShopping(weekStart)
        if (uid) cacheSetShoppingWeek(uid, weekStart, items)
        return items
      } catch (error) {
        const cached = uid ? shoppingCacheFor(uid)[weekStart] : null
        if (Array.isArray(cached) && isOfflineError(error, isOnline())) return cached
        throw error
      }
    },

    async replaceShopping(weekStart, items) {
      const uid = await ensureUserId()
      // Solo encolamos si teníamos la lista cacheada: así evitamos pisar en el
      // servidor una lista que nunca llegamos a leer (por ejemplo, primer arranque offline).
      const hadCache = uid ? cacheHasShoppingWeek(uid, weekStart) : false
      if (uid) cacheSetShoppingWeek(uid, weekStart, items)
      if (!isOnline()) {
        if (!uid || !hadCache) {
          if (uid) cacheRemoveShoppingWeek(uid, weekStart)
          throw noCacheError()
        }
        enqueue(uid, { type: 'replaceShopping', weekStart, items })
        return
      }
      try {
        await base.replaceShopping(weekStart, items)
      } catch (error) {
        if (uid && hadCache && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'replaceShopping', weekStart, items })
          return
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async deleteShoppingItem(id) {
      const uid = await ensureUserId()
      if (uid) cacheRemoveShoppingItem(uid, id)
      if (!isOnline()) {
        if (!uid) throw noSessionError()
        enqueue(uid, { type: 'deleteShoppingItem', id })
        return
      }
      try {
        await base.deleteShoppingItem(id)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'deleteShoppingItem', id })
          return
        }
        if (uid) cacheClearUser(uid)
        throw error
      }
    },

    async exportAll() {
      const uid = await ensureUserId()
      if (!isOnline()) {
        const cached = uid ? cacheSnapshot(uid) : null
        if (cached) return cached
        throw noCacheError()
      }
      try {
        return await base.exportAll()
      } catch (error) {
        const cached = uid ? cacheSnapshot(uid) : null
        if (cached && isOfflineError(error, isOnline())) return cached
        throw error
      }
    },

    async importAll(snapshot) {
      const uid = await ensureUserId()
      await base.importAll(snapshot)
      if (uid) cacheClearUser(uid)
    },

    async wipe() {
      const uid = await ensureUserId()
      await base.wipe()
      if (uid) cacheClearUser(uid)
    },
  }
}
