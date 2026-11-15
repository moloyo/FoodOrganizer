export type Difficulty = 'muy-facil' | 'facil' | 'media' | 'elaborada'

/** Lo que se elige por día: una dificultad de cocina o sacar algo del freezer. */
export type DayMode = Difficulty | 'freezer'

export interface Ingredient {
  id: string
  name: string
  qty: string
  unit: string
  category?: string
}

export interface Dish {
  id: string
  name: string
  difficulty: Difficulty
  minutes: number | null
  freezerFriendly: boolean
  favorite: boolean
  tags: string[]
  ingredients: Ingredient[]
  steps: string
  sourceUrl: string
  createdAt: string
}

export interface DayPlan {
  day: number
  mode: DayMode | null
  dishId: string | null
  note: string
}

export interface WeekPlan {
  weekStart: string
  days: DayPlan[]
}

export interface ShoppingItem {
  id: string
  text: string
  checked: boolean
  category: string
  dishId: string | null
}

export interface PlanRow extends DayPlan {
  weekStart: string
}

export interface ShoppingRow extends ShoppingItem {
  weekStart: string
}

export interface Snapshot {
  app: 'comidas'
  version: 1
  exportedAt: string
  dishes: Dish[]
  plans: PlanRow[]
  shopping: ShoppingRow[]
}

export interface SessionUser {
  id: string
  email: string
}

export type AdapterKind = 'local' | 'cloud'

export interface DataAdapter {
  kind: AdapterKind
  getUser(): Promise<SessionUser | null>
  onAuthChange(cb: (user: SessionUser | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  deleteAccount(): Promise<void>

  listDishes(): Promise<Dish[]>
  saveDish(dish: Dish): Promise<Dish>
  deleteDish(id: string): Promise<void>
  seedDishes(dishes: Dish[]): Promise<Dish[]>

  listPlans(): Promise<PlanRow[]>
  savePlan(row: PlanRow): Promise<void>
  clearWeek(weekStart: string): Promise<void>

  listShopping(weekStart: string): Promise<ShoppingItem[]>
  replaceShopping(weekStart: string, items: ShoppingItem[]): Promise<void>
  deleteShoppingItem(id: string): Promise<void>

  exportAll(): Promise<Snapshot>
  importAll(snapshot: Snapshot): Promise<void>
  wipe(): Promise<void>
}
