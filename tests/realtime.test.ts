import { describe, expect, it } from 'vitest'
import type { OfflineStatus } from '../src/types'
import { isOwnBroadcast, shouldRefreshFromRealtime } from '../src/lib/realtime'

const status = (overrides: Partial<OfflineStatus> = {}): OfflineStatus => ({
  online: true,
  pending: 0,
  syncing: false,
  lastError: null,
  ...overrides,
})

describe('refresco desde Realtime', () => {
  it('refresca cuando no hay nada pendiente', () => {
    expect(shouldRefreshFromRealtime(status())).toBe(true)
  })

  it('no pisa cambios pendientes ni una sincronización en curso', () => {
    expect(shouldRefreshFromRealtime(status({ pending: 2 }))).toBe(false)
    expect(shouldRefreshFromRealtime(status({ syncing: true }))).toBe(false)
    expect(shouldRefreshFromRealtime(status({ online: false }))).toBe(false)
  })

  it('distingue el broadcast propio del de otra pestaña o miembro', () => {
    expect(isOwnBroadcast('tab-1', 'tab-1')).toBe(true)
    expect(isOwnBroadcast('tab-2', 'tab-1')).toBe(false)
    expect(isOwnBroadcast(undefined, 'tab-1')).toBe(false)
    expect(isOwnBroadcast(42, 'tab-1')).toBe(false)
  })
})
