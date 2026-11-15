import { describe, expect, it } from 'vitest'
import type {
  DataAdapter,
  Dish,
  PlanRow,
  SessionUser,
  ShoppingItem,
} from '../src/types'
import {
  createOfflineAdapter,
  isOfflineError,
  type StorageLike,
} from '../src/lib/adapters/offline'

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}

function dish(id: string, name: string): Dish {
  return {
    id,
    name,
    difficulty: 'facil',
    minutes: 20,
    freezerFriendly: false,
    favorite: false,
    tags: [],
    ingredients: [{ id: `${id}-ing`, name: 'Tomate', qty: '2', unit: 'u' }],
    steps: '',
    sourceUrl: '',
    createdAt: '2026-11-15T00:00:00.000Z',
  }
}

const plan = (dishId: string | null, note = ''): PlanRow => ({
  weekStart: '2026-11-16',
  day: 0,
  mode: dishId ? 'facil' : null,
  dishId,
  note,
})

const shopping: ShoppingItem[] = [
  { id: 's1', text: 'Tomate · 2 u', checked: false, category: 'Verdulería', dishId: 'd1' },
]

function stubAdapter(overrides: Partial<DataAdapter> = {}): DataAdapter {
  const fail = async (): Promise<never> => {
    throw new Error('no implementado')
  }
  return {
    kind: 'cloud',
    getUser: async () => null,
    onAuthChange: () => () => {},
    signIn: fail,
    signUp: fail,
    signOut: async () => {},
    resetPassword: fail,
    updatePassword: fail,
    deleteAccount: async () => {},
    getHousehold: async () => null,
    renameHousehold: async () => {},
    listHouseholdMembers: async () => [],
    createHouseholdInvite: async () => ({
      token: 'invite-1',
      createdAt: '2026-11-15T00:00:00.000Z',
      expiresAt: '2026-11-22T00:00:00.000Z',
      revokedAt: null,
      usedCount: 0,
    }),
    listHouseholdInvites: async () => [],
    revokeHouseholdInvite: async () => {},
    getHouseholdInviteInfo: async () => null,
    joinHousehold: async () => ({
      id: 'hogar-1',
      name: 'Hogar',
      role: 'member' as const,
      memberCount: 2,
    }),
    leaveHousehold: async () => {},
    listDishes: fail,
    saveDish: fail,
    deleteDish: fail,
    seedDishes: fail,
    listPlans: fail,
    savePlan: fail,
    clearWeek: fail,
    listShopping: fail,
    replaceShopping: fail,
    deleteShoppingItem: fail,
    exportAll: fail,
    importAll: fail,
    wipe: fail,
    ...overrides,
  }
}

function harness(overrides: Partial<DataAdapter> = {}) {
  const storage = new MemoryStorage()
  let online = true
  let currentUser: SessionUser | null = {
    id: 'user-a',
    email: 'a@comidas.app',
    householdId: 'hogar-1',
  }
  const base = stubAdapter({
    getUser: async () => currentUser,
    ...overrides,
  })
  const adapter = createOfflineAdapter(base, { storage, isOnline: () => online })
  return {
    adapter,
    storage,
    setOnline: (value: boolean) => {
      online = value
    },
    setUser: (user: SessionUser | null) => {
      currentUser = user
    },
  }
}

describe('detección de errores de red', () => {
  it('reconoce fallas de fetch y el modo sin conexión', () => {
    expect(isOfflineError(new Error('Failed to fetch'), true)).toBe(true)
    expect(isOfflineError(new Error('TypeError: Load failed'), true)).toBe(true)
    expect(isOfflineError(new Error('timeout'), true)).toBe(true)
    expect(isOfflineError(new Error('cualquier cosa'), false)).toBe(true)
  })

  it('no encola errores de permisos o validación', () => {
    expect(
      isOfflineError(new Error('new row violates row-level security policy'), true),
    ).toBe(false)
    expect(isOfflineError(new Error('Email o contraseña incorrectos.'), true)).toBe(false)
  })
})

describe('caché de lectura', () => {
  it('devuelve los últimos platos cuando la lectura falla sin red', async () => {
    let online = true
    const cached = dish('d1', 'Tarta')
    const { adapter, setOnline } = harness({
      listDishes: async () => {
        if (!online) throw new Error('Failed to fetch')
        return [cached]
      },
    })

    await adapter.getUser()
    expect(await adapter.listDishes()).toEqual([cached])

    online = false
    setOnline(false)
    expect(await adapter.listDishes()).toEqual([cached])
  })

  it('cachea compras por semana', async () => {
    const { adapter, setOnline } = harness({
      listShopping: async () => shopping,
    })
    setOnline(false)

    await adapter.getUser()
    setOnline(true)
    expect(await adapter.listShopping('2026-11-16')).toEqual(shopping)

    setOnline(false)
    expect(await adapter.listShopping('2026-11-16')).toEqual(shopping)
  })

  it('no inventa una lista vacía si nunca se leyó esa semana', async () => {
    const { adapter, setOnline } = harness({
      listShopping: async () => {
        throw new Error('Failed to fetch')
      },
    })
    await adapter.getUser()
    setOnline(false)
    await expect(adapter.listShopping('2026-12-07')).rejects.toThrow(/Sin conexión/)
  })
})

describe('cola de escrituras', () => {
  it('guarda un plan sin red y lo reintenta al volver la conexión', async () => {
    const saved: PlanRow[] = []
    const { adapter, setOnline } = harness({
      savePlan: async (row) => {
        saved.push(row)
      },
    })

    await adapter.getUser()
    setOnline(false)
    await adapter.savePlan(plan('d1', 'Nota sin red'))
    expect(adapter.offline?.getStatus().pending).toBe(1)

    setOnline(true)
    await adapter.offline?.flush()

    expect(saved).toEqual([plan('d1', 'Nota sin red')])
    expect(adapter.offline?.getStatus().pending).toBe(0)
  })

  it('compacta escrituras repetidas del mismo día', async () => {
    const saved: PlanRow[] = []
    const { adapter, setOnline } = harness({
      savePlan: async (row) => {
        saved.push(row)
      },
    })

    await adapter.getUser()
    setOnline(false)
    await adapter.savePlan(plan('d1', 'primera'))
    await adapter.savePlan(plan('d2', 'segunda'))
    expect(adapter.offline?.getStatus().pending).toBe(1)

    setOnline(true)
    await adapter.offline?.flush()
    expect(saved).toEqual([plan('d2', 'segunda')])
  })

  it('separa la cola por hogar y no escribe con otra sesión', async () => {
    const saved: PlanRow[] = []
    const { adapter, setOnline, setUser } = harness({
      savePlan: async (row) => {
        saved.push(row)
      },
    })

    await adapter.getUser()
    setOnline(false)
    await adapter.savePlan(plan('d1', 'de A'))
    expect(adapter.offline?.getStatus().pending).toBe(1)

    // Otra persona de otro hogar no hereda los cambios pendientes.
    setUser({ id: 'user-b', email: 'b@comidas.app', householdId: 'hogar-2' })
    await adapter.getUser()
    expect(adapter.offline?.getStatus().pending).toBe(0)

    setOnline(true)
    await adapter.offline?.flush()
    expect(saved).toHaveLength(0)

    setUser({ id: 'user-a', email: 'a@comidas.app', householdId: 'hogar-1' })
    await adapter.getUser()
    expect(adapter.offline?.getStatus().pending).toBe(1)

    await adapter.offline?.flush()
    expect(saved).toEqual([plan('d1', 'de A')])
  })

  it('comparte la cola entre dos miembros del mismo hogar', async () => {
    const saved: PlanRow[] = []
    const { adapter, setOnline, setUser } = harness({
      savePlan: async (row) => {
        saved.push(row)
      },
    })

    await adapter.getUser()
    setOnline(false)
    await adapter.savePlan(plan('d1', 'escrito por A'))

    // La pareja usa la misma caché/cola: ve el cambio pendiente y lo sincroniza.
    setUser({ id: 'user-b', email: 'b@comidas.app', householdId: 'hogar-1' })
    await adapter.getUser()
    expect(adapter.offline?.getStatus().pending).toBe(1)

    setOnline(true)
    await adapter.offline?.flush()
    expect(saved).toEqual([plan('d1', 'escrito por A')])
    expect(adapter.offline?.getStatus().pending).toBe(0)
  })

  it('rescope cambia el ámbito de la cola al unirse a otro hogar', async () => {
    const { adapter, setOnline } = harness({
      savePlan: async () => {},
    })

    await adapter.getUser()
    setOnline(false)
    await adapter.savePlan(plan('d1', 'pendiente'))
    expect(adapter.offline?.getStatus().pending).toBe(1)

    adapter.offline?.rescope?.('hogar-2')
    expect(adapter.offline?.getStatus().pending).toBe(0)

    adapter.offline?.rescope?.('hogar-1')
    expect(adapter.offline?.getStatus().pending).toBe(1)
  })

  it('no oculta errores que no son de red', async () => {
    const { adapter } = harness({
      saveDish: async () => {
        throw new Error('new row violates row-level security policy')
      },
    })

    await adapter.getUser()
    await expect(adapter.saveDish(dish('d1', 'Tarta'))).rejects.toThrow(/row-level security/)
    expect(adapter.offline?.getStatus().pending).toBe(0)
  })

  it('solo encola compras si la semana ya estaba cacheada', async () => {
    const { adapter, setOnline } = harness({
      listShopping: async () => [],
      replaceShopping: async () => {
        throw new Error('Failed to fetch')
      },
    })

    await adapter.getUser()
    setOnline(false)
    await expect(adapter.replaceShopping('2026-11-16', shopping)).rejects.toThrow(
      /Sin conexión/,
    )

    setOnline(true)
    await adapter.listShopping('2026-11-16')
    setOnline(false)
    await adapter.replaceShopping('2026-11-16', shopping)
    expect(adapter.offline?.getStatus().pending).toBe(1)
  })

  it('carga ejemplos sin red con ids uuid y los sincroniza', async () => {
    const saved: Dish[] = []
    const { adapter, setOnline } = harness({
      saveDish: async (item) => {
        saved.push(item)
        return item
      },
    })

    await adapter.getUser()
    setOnline(false)
    const created = await adapter.seedDishes([dish('seed-dish-1', 'Faina')])

    expect(created).toHaveLength(1)
    expect(created[0].id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(adapter.offline?.getStatus().pending).toBe(1)

    setOnline(true)
    await adapter.offline?.flush()
    expect(saved.map((item) => item.name)).toEqual(['Faina'])
  })
})
