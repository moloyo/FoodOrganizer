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
  /** Hogar al que pertenece la sesión. Si falta, se usa el id de usuario (modo local). */
  householdId?: string | null
  householdName?: string | null
}

/** Un hogar comparte platos, semana, compras e historial entre todos sus miembros. */
export interface Household {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
}

export interface HouseholdMember {
  userId: string
  email: string
  role: 'owner' | 'member'
  joinedAt: string
}

export interface HouseholdInvite {
  token: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  usedCount: number
}

/** Datos públicos de una invitación (los ve quien todavía no es miembro). */
export interface InviteInfo {
  householdId: string
  householdName: string
  memberCount: number
  expiresAt: string
}

/** Operaciones de hogar. El modo local las resuelve en memoria para los tests. */
export interface HouseholdAdapter {
  getHousehold(): Promise<Household | null>
  renameHousehold(name: string): Promise<void>
  listHouseholdMembers(): Promise<HouseholdMember[]>
  createHouseholdInvite(): Promise<HouseholdInvite>
  listHouseholdInvites(): Promise<HouseholdInvite[]>
  revokeHouseholdInvite(token: string): Promise<void>
  getHouseholdInviteInfo(token: string): Promise<InviteInfo | null>
  joinHousehold(token: string): Promise<Household>
  leaveHousehold(): Promise<void>
}

export type AdapterKind = 'local' | 'cloud'

export interface OfflineStatus {
  /** Hay red según el navegador (navigator.onLine). */
  online: boolean
  /** Escrituras guardadas localmente que todavía no llegaron al servidor. */
  pending: number
  /** Se está reintentando la cola. */
  syncing: boolean
  /** Último error al sincronizar un cambio (para avisar sin perder datos). */
  lastError: { message: string; at: number } | null
}

export interface OfflineSupport {
  getStatus(): OfflineStatus
  subscribe(cb: (status: OfflineStatus) => void): () => void
  /** Reintenta la cola si hay red. No hace nada si ya está sincronizando. */
  flush(): Promise<void>
  /** Cambia el ámbito de caché/cola (al entrar o salir de un hogar). */
  rescope?(scopeId: string | null): void
}

export interface DataAdapter extends HouseholdAdapter {
  kind: AdapterKind
  /** Solo en adaptadores con caché y cola offline. */
  offline?: OfflineSupport
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
