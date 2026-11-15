import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type {
  DataAdapter,
  Difficulty,
  Dish,
  Ingredient,
  PlanRow,
  SessionUser,
  ShoppingItem,
  ShoppingRow,
  Snapshot,
} from '../../types'
import { isUuid, newUuid } from '../uuid'

interface DishRow {
  id: string
  user_id: string
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
  user_id: string
  week_start: string
  day: number
  mode: string | null
  dish_id: string | null
  note: string
}

interface ShoppingDbRow {
  id: string
  user_id: string
  week_start: string
  text: string
  checked: boolean
  category: string
  dish_id: string | null
}

function toUser(user: User | null | undefined): SessionUser | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? '' }
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

function toDishRow(dish: Dish, userId: string): DishRow {
  return {
    id: dish.id,
    user_id: userId,
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
    mode: (row.mode as PlanRow['mode']) ?? null,
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

  let cachedUserId: string | null = null

  async function requireUserId(): Promise<string> {
    if (cachedUserId) return cachedUserId
    const { data } = await client.auth.getSession()
    const user = toUser(data.session?.user)
    if (!user) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    cachedUserId = user.id
    return user.id
  }

  return {
    kind: 'cloud',

    async getUser() {
      const { data } = await client.auth.getSession()
      const user = toUser(data.session?.user)
      cachedUserId = user?.id ?? null
      return user
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = toUser(session?.user)
        cachedUserId = user?.id ?? null
        cb(user)
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      cachedUserId = null
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
            'Falta actualizar el schema de Supabase: ejecutá supabase/schema.sql para habilitar el borrado de cuenta.',
          )
        }
        throw new Error(error.message)
      }
      cachedUserId = null
      await client.auth.signOut().catch(() => {})
    },

    async listDishes() {
      const { data, error } = await client
        .from('dishes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as DishRow[]).map(mapDish)
    },

    async saveDish(dish) {
      const userId = await requireUserId()
      const { error } = await client
        .from('dishes')
        .upsert(toDishRow(dish, userId), { onConflict: 'id' })
      if (error) throw new Error(error.message)
      return dish
    },

    async deleteDish(id) {
      const { error } = await client.from('dishes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async seedDishes(dishes) {
      const userId = await requireUserId()
      const rows = dishes.map((dish) =>
        toDishRow({ ...dish, id: isUuid(dish.id) ? dish.id : newUuid() }, userId),
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
      const userId = await requireUserId()
      const payload: PlanDbRow = {
        user_id: userId,
        week_start: row.weekStart,
        day: row.day,
        mode: row.mode,
        dish_id: row.dishId,
        note: row.note ?? '',
      }
      const { error } = await client
        .from('plans')
        .upsert(payload, { onConflict: 'user_id,week_start,day' })
      if (error) throw new Error(error.message)
    },

    async clearWeek(weekStart) {
      const userId = await requireUserId()
      const { error } = await client
        .from('plans')
        .delete()
        .eq('user_id', userId)
        .eq('week_start', weekStart)
      if (error) throw new Error(error.message)
      const shopping = await client
        .from('shopping_items')
        .delete()
        .eq('user_id', userId)
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
      const userId = await requireUserId()
      const removal = await client
        .from('shopping_items')
        .delete()
        .eq('user_id', userId)
        .eq('week_start', weekStart)
      if (removal.error) throw new Error(removal.error.message)
      if (items.length === 0) return
      const rows = items.map((item) => ({
        id: item.id,
        user_id: userId,
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
      const userId = await requireUserId()
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
      const userId = await requireUserId()

      // Normalizamos ids para que funcionen con las columnas uuid de Supabase.
      // También remapeamos las referencias de planes y compras a los platos.
      const idMap = new Map<string, string>()
      const dishes = snapshot.dishes.map((dish) => {
        const id = isUuid(dish.id) ? dish.id : newUuid()
        idMap.set(dish.id, id)
        return toDishRow({ ...dish, id }, userId)
      })
      const knownDishIds = new Set(dishes.map((dish) => dish.id))
      const mapDishId = (id: string | null): string | null => {
        if (!id) return null
        const mapped = idMap.get(id) ?? id
        return knownDishIds.has(mapped) ? mapped : null
      }

      await client.from('plans').delete().eq('user_id', userId)
      await client.from('shopping_items').delete().eq('user_id', userId)
      await client.from('dishes').delete().eq('user_id', userId)

      if (dishes.length > 0) {
        const { error } = await client.from('dishes').insert(dishes)
        if (error) throw new Error(error.message)
      }
      if (snapshot.plans.length > 0) {
        const rows: PlanDbRow[] = snapshot.plans.map((plan) => ({
          user_id: userId,
          week_start: plan.weekStart,
          day: plan.day,
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
          user_id: userId,
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
      const userId = await requireUserId()
      await client.from('plans').delete().eq('user_id', userId)
      await client.from('shopping_items').delete().eq('user_id', userId)
      const { error } = await client.from('dishes').delete().eq('user_id', userId)
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
