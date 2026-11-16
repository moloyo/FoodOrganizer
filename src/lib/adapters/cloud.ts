import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type {
  DataAdapter,
  Difficulty,
  Dish,
  Household,
  HouseholdInvite,
  HouseholdMember,
  Ingredient,
  InviteInfo,
  MealPlanRow,
  PlanRow,
  SessionUser,
  ShoppingItem,
  ShoppingRow,
  Snapshot,
} from '../../types'
import { isUuid, newUuid } from '../uuid'
import { isOfflineError } from './offline'

interface DishRow {
  id: string
  household_id: string
  name: string
  difficulty: Difficulty
  minutes: number | null
  freezer_friendly: boolean
  favorite: boolean
  tags: string[] | null
  ingredients: Ingredient[] | null
  steps: string | null
  source_url: string | null
  created_at: string
}

interface PlanDbRow {
  household_id: string
  week_start: string
  day: number
  /** Ausente en el schema viejo: se normaliza a 0. */
  slot?: number | null
  mode: string | null
  dish_id: string | null
  note: string
}

interface ShoppingDbRow {
  id: string
  household_id: string
  week_start: string
  text: string
  checked: boolean
  category: string
  dish_id: string | null
}

interface HouseholdRow {
  id: string
  name: string
  role: 'owner' | 'member'
  member_count: number | string
}

interface MemberRow {
  user_id: string
  email: string | null
  role: 'owner' | 'member'
  joined_at: string
}

interface InviteRow {
  token: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  used_count: number | string
}

interface InviteInfoRow {
  household_id: string
  household_name: string
  member_count: number | string
  expires_at: string
}

interface JoinRow {
  household_id: string
  name: string
}

function householdStorageKey(userId: string): string {
  return `comidas:household:v1:${userId}`
}

function readCachedHouseholdId(userId: string): string | null {
  try {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(householdStorageKey(userId))
  } catch {
    return null
  }
}

function writeCachedHouseholdId(userId: string, householdId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(householdStorageKey(userId), householdId)
    }
  } catch {
    // sin storage disponible: la resolución por RPC sigue funcionando
  }
}

function toUser(
  user: User | null | undefined,
  householdId?: string | null,
  householdName?: string | null,
): SessionUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    householdId: householdId ?? null,
    householdName: householdName ?? null,
  }
}

/** Las RPC que devuelven `table` llegan como array; las escalares, como valor. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null
  return (data as T) ?? null
}

function rpcRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : data ? [data as T] : []
}

function migrationHint(error: { message?: string; code?: string }): Error {
  const message = error.message ?? 'Error desconocido'
  if (
    error.code === 'PGRST202' ||
    /function .* does not exist/i.test(message) ||
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return new Error(
      'Falta aplicar la migración de hogares: ejecutá supabase/migration_hogares.sql en el SQL Editor de Supabase.',
    )
  }
  return new Error(message)
}

function mapDish(row: DishRow): Dish {
  return {
    id: row.id,
    name: row.name,
    difficulty: row.difficulty,
    minutes: row.minutes,
    freezerFriendly: row.freezer_friendly,
    favorite: row.favorite,
    tags: row.tags ?? [],
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? '',
    sourceUrl: row.source_url ?? '',
    createdAt: row.created_at,
  }
}

function toDishRow(dish: Dish, householdId: string): DishRow {
  return {
    id: dish.id,
    household_id: householdId,
    name: dish.name,
    difficulty: dish.difficulty,
    minutes: dish.minutes,
    freezer_friendly: dish.freezerFriendly,
    favorite: dish.favorite,
    tags: dish.tags,
    ingredients: dish.ingredients,
    steps: dish.steps,
    source_url: dish.sourceUrl,
    created_at: dish.createdAt,
  }
}

function mapPlan(row: PlanDbRow): PlanRow {
  return {
    weekStart: row.week_start,
    day: row.day,
    slot: row.slot ?? 0,
    mode: (row.mode as PlanRow['mode']) ?? null,
    dishId: row.dish_id,
    note: row.note ?? '',
  }
}

function mapMealPlan(row: PlanDbRow): MealPlanRow {
  return {
    weekStart: row.week_start,
    day: row.day,
    slot: row.slot ?? 0,
    mode: (row.mode as MealPlanRow['mode']) ?? null,
    dishId: row.dish_id,
    note: row.note ?? '',
  }
}

function mapShopping(row: ShoppingDbRow): ShoppingItem {
  return {
    id: row.id,
    text: row.text,
    checked: row.checked,
    category: row.category,
    dishId: row.dish_id,
  }
}

export function createCloudAdapter(url: string, anonKey: string): DataAdapter {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  /** Sesión ya resuelta con su hogar; se invalida al entrar/salir de uno. */
  let cachedSession: { userId: string; user: SessionUser } | null = null

  function invalidateSession(): void {
    cachedSession = null
  }

  async function resolveSession(): Promise<SessionUser | null> {
    const { data } = await client.auth.getSession()
    const authUser = data.session?.user
    if (!authUser) {
      cachedSession = null
      return null
    }
    if (cachedSession?.userId === authUser.id) return cachedSession.user

    // Si no hay red, usamos el último hogar conocido para que la caché offline
    // siga apuntando a los datos correctos.
    let householdId = readCachedHouseholdId(authUser.id)
    let householdName: string | null = null
    try {
      const { data: rpcData, error } = await client.rpc('my_household')
      if (error) throw error
      const row = firstRow<HouseholdRow>(rpcData)
      if (!row) throw new Error('No se pudo resolver el hogar de la cuenta.')
      householdId = row.id
      householdName = row.name
      writeCachedHouseholdId(authUser.id, row.id)
    } catch (error) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false
      if (householdId && isOfflineError(error, online)) {
        // sin conexión: seguimos con el hogar guardado en este dispositivo
      } else {
        throw migrationHint(error as { message?: string; code?: string })
      }
    }

    const user = toUser(authUser, householdId, householdName)
    if (!user) return null
    cachedSession = { userId: authUser.id, user }
    return user
  }

  async function requireHouseholdId(): Promise<string> {
    const user = await resolveSession()
    if (!user) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    if (!user.householdId) {
      throw new Error('No pudimos cargar tu hogar. Conectate a internet y volvé a intentar.')
    }
    return user.householdId
  }

  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) throw migrationHint(error)
    return data as T
  }

  async function refreshAfterMembershipChange(): Promise<Household> {
    invalidateSession()
    const user = await resolveSession()
    if (user?.householdId) writeCachedHouseholdId(user.id, user.householdId)
    const household = await getHousehold()
    if (!household) throw new Error('No se pudo cargar el hogar después del cambio.')
    return household
  }

  async function getHousehold(): Promise<Household | null> {
    const data = await rpc<unknown>('my_household')
    const row = firstRow<HouseholdRow>(data)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      memberCount: Number(row.member_count ?? 0),
    }
  }

  return {
    kind: 'cloud',

    async getUser() {
      return resolveSession()
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          invalidateSession()
          cb(null)
          return
        }
        // No hacemos RPC dentro del callback de auth: Supabase desaconseja
        // await allí. El hogar completo se resuelve con getUser() al cargar.
        invalidateSession()
        cb(toUser(session.user, readCachedHouseholdId(session.user.id)))
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      invalidateSession()
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
      await resolveSession()
    },

    async signUp(email, password) {
      invalidateSession()
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
      if (data.session) await resolveSession()
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      invalidateSession()
      const { error } = await client.auth.signOut()
      if (error) throw new Error(error.message)
    },

    async resetPassword(email) {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : undefined
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw new Error(traducirAuthError(error.message))
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) throw new Error(traducirAuthError(error.message))
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account')
      if (error) {
        if (
          error.code === 'PGRST202' ||
          /delete_my_account/i.test(error.message) ||
          /function .* does not exist/i.test(error.message)
        ) {
          throw new Error(
            'Falta actualizar el schema de Supabase: ejecutá supabase/migration_hogares.sql para habilitar el borrado de cuenta.',
          )
        }
        throw new Error(error.message)
      }
      invalidateSession()
      await client.auth.signOut().catch(() => {})
    },

    /* ----------------------------- Hogar ----------------------------- */

    getHousehold,

    async renameHousehold(name) {
      await rpc('household_rename', { p_name: name.trim() })
    },

    async listHouseholdMembers() {
      const data = await rpc<unknown>('household_members_list')
      return rpcRows<MemberRow>(data).map((row) => ({
        userId: row.user_id,
        email: row.email ?? '',
        role: row.role,
        joinedAt: row.joined_at,
      }))
    },

    async createHouseholdInvite() {
      const token = await rpc<string>('household_invite_create')
      const invites = await this.listHouseholdInvites()
      return (
        invites.find((invite) => invite.token === token) ?? {
          token,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          revokedAt: null,
          usedCount: 0,
        }
      )
    },

    async listHouseholdInvites() {
      const data = await rpc<unknown>('household_invite_list')
      return rpcRows<InviteRow>(data).map((row) => ({
        token: row.token,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at ?? null,
        usedCount: Number(row.used_count ?? 0),
      }))
    },

    async revokeHouseholdInvite(token) {
      await rpc('household_invite_revoke', { p_token: token })
    },

    async getHouseholdInviteInfo(token) {
      const data = await rpc<unknown>('household_invite_info', { p_token: token })
      const row = firstRow<InviteInfoRow>(data)
      if (!row) return null
      return {
        householdId: row.household_id,
        householdName: row.household_name,
        memberCount: Number(row.member_count ?? 0),
        expiresAt: row.expires_at,
      }
    },

    async joinHousehold(token) {
      const data = await rpc<unknown>('household_join', { p_token: token })
      const row = firstRow<JoinRow>(data)
      if (!row) throw new Error('La invitación no es válida o ya venció.')
      return refreshAfterMembershipChange()
    },

    async leaveHousehold() {
      await rpc('household_leave')
      await refreshAfterMembershipChange()
    },

    /* ----------------------------- Datos ----------------------------- */

    async listDishes() {
      const { data, error } = await client
        .from('dishes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as DishRow[]).map(mapDish)
    },

    async saveDish(dish) {
      const householdId = await requireHouseholdId()
      const { error } = await client
        .from('dishes')
        .upsert(toDishRow(dish, householdId), { onConflict: 'id' })
      if (error) throw new Error(error.message)
      return dish
    },

    async deleteDish(id) {
      const { error } = await client.from('dishes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async seedDishes(dishes) {
      const householdId = await requireHouseholdId()
      const rows = dishes.map((dish) =>
        toDishRow({ ...dish, id: isUuid(dish.id) ? dish.id : newUuid() }, householdId),
      )
      const { data, error } = await client.from('dishes').insert(rows).select('*')
      if (error) throw new Error(error.message)
      return ((data ?? []) as DishRow[]).map(mapDish)
    },

    async listPlans() {
      const { data, error } = await client.from('plans').select('*')
      if (error) throw new Error(error.message)
      return ((data ?? []) as PlanDbRow[]).map(mapPlan)
    },

    async savePlan(row) {
      const householdId = await requireHouseholdId()
      const payload: PlanDbRow = {
        household_id: householdId,
        week_start: row.weekStart,
        day: row.day,
        mode: row.mode,
        dish_id: row.dishId,
        note: row.note ?? '',
      }
      const { error } = await client
        .from('plans')
        .upsert(payload, { onConflict: 'household_id,week_start,day' })
      if (error) throw new Error(error.message)
    },

    /* --------------------- N comidas por día (schema nuevo) --------------------- */

    async listMealPlans() {
      const { data, error } = await client.from('plans').select('*')
      if (error) throw new Error(error.message)
      // `slot` no existe en el schema viejo: se normaliza a 0.
      return ((data ?? []) as PlanDbRow[]).map(mapMealPlan)
    },

    async replaceDayMeals(weekStart, day, rows) {
      const householdId = await requireHouseholdId()
      const removal = await client
        .from('plans')
        .delete()
        .eq('household_id', householdId)
        .eq('week_start', weekStart)
        .eq('day', day)
      if (removal.error) throw new Error(removal.error.message)
      if (rows.length === 0) return
      const payload = rows.map((row) => ({
        household_id: householdId,
        week_start: weekStart,
        day,
        slot: row.slot,
        mode: row.mode,
        dish_id: row.dishId,
        note: row.note ?? '',
      }))
      const { error } = await client.from('plans').insert(payload)
      if (error) throw new Error(error.message)
    },

    async clearWeek(weekStart) {
      const householdId = await requireHouseholdId()
      const { error } = await client
        .from('plans')
        .delete()
        .eq('household_id', householdId)
        .eq('week_start', weekStart)
      if (error) throw new Error(error.message)
      const shopping = await client
        .from('shopping_items')
        .delete()
        .eq('household_id', householdId)
        .eq('week_start', weekStart)
      if (shopping.error) throw new Error(shopping.error.message)
    },

    async listShopping(weekStart) {
      const { data, error } = await client
        .from('shopping_items')
        .select('*')
        .eq('week_start', weekStart)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return ((data ?? []) as ShoppingDbRow[]).map(mapShopping)
    },

    async replaceShopping(weekStart, items) {
      const householdId = await requireHouseholdId()
      const removal = await client
        .from('shopping_items')
        .delete()
        .eq('household_id', householdId)
        .eq('week_start', weekStart)
      if (removal.error) throw new Error(removal.error.message)
      if (items.length === 0) return
      const rows = items.map((item) => ({
        id: item.id,
        household_id: householdId,
        week_start: weekStart,
        text: item.text,
        checked: item.checked,
        category: item.category,
        dish_id: item.dishId,
      }))
      const { error } = await client.from('shopping_items').insert(rows)
      if (error) throw new Error(error.message)
    },

    async deleteShoppingItem(id) {
      const { error } = await client.from('shopping_items').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async exportAll(): Promise<Snapshot> {
      const [dishesRes, plansRes, shoppingRes] = await Promise.all([
        client.from('dishes').select('*'),
        client.from('plans').select('*'),
        client.from('shopping_items').select('*'),
      ])
      const firstError = dishesRes.error ?? plansRes.error ?? shoppingRes.error
      if (firstError) throw new Error(firstError.message)
      return {
        app: 'comidas',
        version: 1,
        exportedAt: new Date().toISOString(),
        dishes: ((dishesRes.data ?? []) as DishRow[]).map(mapDish),
        plans: ((plansRes.data ?? []) as PlanDbRow[]).map(mapPlan),
        shopping: ((shoppingRes.data ?? []) as (ShoppingDbRow & { week_start: string })[]).map(
          (row) => ({ ...mapShopping(row), weekStart: row.week_start }),
        ),
      }
    },

    async importAll(snapshot) {
      const householdId = await requireHouseholdId()

      // Normalizamos ids para que funcionen con las columnas uuid de Supabase.
      // También remapeamos las referencias de planes y compras a los platos.
      const idMap = new Map<string, string>()
      const dishes = snapshot.dishes.map((dish) => {
        const id = isUuid(dish.id) ? dish.id : newUuid()
        idMap.set(dish.id, id)
        return toDishRow({ ...dish, id }, householdId)
      })
      const knownDishIds = new Set(dishes.map((dish) => dish.id))
      const mapDishId = (id: string | null): string | null => {
        if (!id) return null
        const mapped = idMap.get(id) ?? id
        return knownDishIds.has(mapped) ? mapped : null
      }

      await client.from('plans').delete().eq('household_id', householdId)
      await client.from('shopping_items').delete().eq('household_id', householdId)
      await client.from('dishes').delete().eq('household_id', householdId)

      if (dishes.length > 0) {
        const { error } = await client.from('dishes').insert(dishes)
        if (error) throw new Error(error.message)
      }
      if (snapshot.plans.length > 0) {
        // Si el backup no tiene slots (v1), no enviamos la columna: así el
        // import sigue funcionando contra el schema viejo. Un backup con
        // varias comidas (slot > 0) sí la incluye.
        const hasSlots = snapshot.plans.some((plan) => (plan.slot ?? 0) > 0)
        const rows: PlanDbRow[] = snapshot.plans.map((plan) => ({
          household_id: householdId,
          week_start: plan.weekStart,
          day: plan.day,
          ...(hasSlots ? { slot: plan.slot ?? 0 } : {}),
          mode: plan.mode,
          dish_id: mapDishId(plan.dishId),
          note: plan.note ?? '',
        }))
        const { error } = await client.from('plans').insert(rows)
        if (error) throw new Error(error.message)
      }
      if (snapshot.shopping.length > 0) {
        const rows = snapshot.shopping.map((item) => ({
          id: isUuid(item.id) ? item.id : newUuid(),
          household_id: householdId,
          week_start: item.weekStart,
          text: item.text,
          checked: item.checked,
          category: item.category,
          dish_id: mapDishId(item.dishId),
        }))
        const { error } = await client.from('shopping_items').insert(rows)
        if (error) throw new Error(error.message)
      }
    },

    async wipe() {
      const householdId = await requireHouseholdId()
      await client.from('plans').delete().eq('household_id', householdId)
      await client.from('shopping_items').delete().eq('household_id', householdId)
      const { error } = await client.from('dishes').delete().eq('household_id', householdId)
      if (error) throw new Error(error.message)
    },
  }
}

function traducirAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (lower.includes('email not confirmed')) return 'Confirmá tu email antes de ingresar.'
  if (lower.includes('user already registered')) return 'Ese email ya tiene una cuenta.'
  if (lower.includes('password should be at least')) return 'La contraseña necesita al menos 6 caracteres.'
  if (lower.includes('new password should be different')) {
    return 'La contraseña nueva tiene que ser distinta de la anterior.'
  }
  if (lower.includes('email rate limit exceeded')) {
    return 'Mandaste demasiados emails seguidos. Esperá unos minutos y probá de nuevo.'
  }
  if (lower.includes('unable to validate email')) return 'El email no parece válido.'
  return message
}
