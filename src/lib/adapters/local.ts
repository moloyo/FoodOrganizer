import type {
  DataAdapter,
  Dish,
  PlanRow,
  SessionUser,
  ShoppingItem,
  ShoppingRow,
  Snapshot,
} from '../../types'
import { SEED_DISHES } from '../../data/seed'

const DB_KEY = 'comidas:db:v1'

const LOCAL_USER: SessionUser = { id: 'local', email: 'local@comidas.app' }

interface LocalDB {
  dishes: Dish[]
  plans: PlanRow[]
  shopping: ShoppingRow[]
  seeded: boolean
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function read(): LocalDB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDB
      if (parsed && Array.isArray(parsed.dishes)) {
        return {
          dishes: parsed.dishes ?? [],
          plans: parsed.plans ?? [],
          shopping: parsed.shopping ?? [],
          seeded: Boolean(parsed.seeded),
        }
      }
    }
  } catch {
    // datos corruptos: arrancamos de cero
  }
  const fresh: LocalDB = {
    dishes: SEED_DISHES.map((dish) => ({ ...dish })),
    plans: [],
    shopping: [],
    seeded: true,
  }
  write(fresh)
  return fresh
}

function write(db: LocalDB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // sin espacio o modo privado: la app sigue funcionando en memoria
  }
}

export function createLocalAdapter(): DataAdapter {
  return {
    kind: 'local',

    async getUser() {
      return LOCAL_USER
    },

    onAuthChange() {
      return () => {}
    },

    async signIn() {
      throw new Error('Estás en modo local. Configurá Supabase para usar cuentas.')
    },

    async signUp() {
      throw new Error('Estás en modo local. Configurá Supabase para usar cuentas.')
    },

    async signOut() {
      // no-op
    },

    async resetPassword() {
      throw new Error('Estás en modo local. Configurá Supabase para recuperar contraseñas.')
    },

    async updatePassword() {
      throw new Error('Estás en modo local. Configurá Supabase para cambiar contraseñas.')
    },

    async deleteAccount() {
      throw new Error('Estás en modo local. No hay cuenta que eliminar.')
    },

    async listDishes() {
      return read().dishes
    },

    async saveDish(dish) {
      const db = read()
      const index = db.dishes.findIndex((item) => item.id === dish.id)
      if (index >= 0) db.dishes[index] = dish
      else db.dishes.unshift(dish)
      write(db)
      return dish
    },

    async deleteDish(id) {
      const db = read()
      db.dishes = db.dishes.filter((dish) => dish.id !== id)
      db.plans = db.plans.map((plan) =>
        plan.dishId === id ? { ...plan, dishId: null } : plan,
      ) as PlanRow[]
      write(db)
    },

    async seedDishes(dishes) {
      const db = read()
      const created = dishes.map((dish) => ({ ...dish, id: newId() }))
      db.dishes = [...created, ...db.dishes]
      db.seeded = true
      write(db)
      return created
    },

    async listPlans() {
      return read().plans
    },

    async savePlan(row) {
      const db = read()
      const index = db.plans.findIndex(
        (plan) => plan.weekStart === row.weekStart && plan.day === row.day,
      )
      if (index >= 0) db.plans[index] = row
      else db.plans.push(row)
      write(db)
    },

    async clearWeek(weekStart) {
      const db = read()
      db.plans = db.plans.filter((plan) => plan.weekStart !== weekStart)
      db.shopping = db.shopping.filter((item) => item.weekStart !== weekStart)
      write(db)
    },

    async listShopping(weekStart) {
      return read()
        .shopping.filter((item) => item.weekStart === weekStart)
        .map(({ weekStart: _weekStart, ...item }) => item)
    },

    async replaceShopping(weekStart, items) {
      const db = read()
      db.shopping = [
        ...db.shopping.filter((item) => item.weekStart !== weekStart),
        ...items.map((item) => ({ ...item, weekStart })),
      ]
      write(db)
    },

    async deleteShoppingItem(id) {
      const db = read()
      db.shopping = db.shopping.filter((item) => item.id !== id)
      write(db)
    },

    async exportAll(): Promise<Snapshot> {
      const db = read()
      return {
        app: 'comidas',
        version: 1,
        exportedAt: new Date().toISOString(),
        dishes: db.dishes,
        plans: db.plans,
        shopping: db.shopping,
      }
    },

    async importAll(snapshot) {
      const db: LocalDB = {
        dishes: snapshot.dishes ?? [],
        plans: snapshot.plans ?? [],
        shopping: snapshot.shopping ?? [],
        seeded: true,
      }
      write(db)
    },

    async wipe() {
      write({ dishes: [], plans: [], shopping: [], seeded: true })
    },
  }
}

export function makeLocalId(): string {
  return newId()
}

export function emptyShoppingItem(partial: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: newId(),
    text: '',
    checked: false,
    category: 'Otros',
    dishId: null,
    ...partial,
  }
}
