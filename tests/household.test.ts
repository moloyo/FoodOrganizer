import { describe, expect, it } from 'vitest'
import type { Household } from '../src/types'
import { canLeaveHousehold } from '../src/lib/household'

const hogar = (memberCount: number): Household => ({
  id: 'hogar-1',
  name: 'Casa',
  role: 'owner',
  memberCount,
})

describe('salir del hogar', () => {
  it('bloquea la salida si sos el único miembro', () => {
    expect(canLeaveHousehold(hogar(1))).toBe(false)
    expect(canLeaveHousehold(hogar(0))).toBe(false)
  })

  it('permite salir cuando quedan otros miembros', () => {
    expect(canLeaveHousehold(hogar(2))).toBe(true)
    expect(canLeaveHousehold(hogar(5))).toBe(true)
  })

  it('sin hogar cargado no permite salir', () => {
    expect(canLeaveHousehold(null)).toBe(false)
  })
})
