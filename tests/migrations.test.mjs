import { describe, expect, it } from 'vitest'
import {
  baselineCommand,
  listMigrations,
  validateMigrations,
} from '../scripts/migrations.mjs'

describe('migraciones versionadas', () => {
  it('las migraciones del repo tienen nombres válidos, únicos y en orden', () => {
    const migrations = listMigrations()
    expect(migrations.length).toBe(3)
    expect(migrations.map((item) => item.version)).toEqual([
      '20261113000000',
      '20261115000000',
      '20261116000000',
    ])
    expect(validateMigrations(migrations)).toMatchObject({ ok: true, count: 3 })
  })

  it('detecta timestamps duplicados', () => {
    const check = validateMigrations([
      { version: '20261113000000', file: 'a.sql' },
      { version: '20261113000000', file: 'b.sql' },
    ])
    expect(check.ok).toBe(false)
    expect(check.duplicates).toEqual(['20261113000000'])
  })

  it('detecta una lista desordenada', () => {
    const check = validateMigrations([
      { version: '20261116000000', file: 'c.sql' },
      { version: '20261113000000', file: 'a.sql' },
    ])
    expect(check.ok).toBe(false)
    expect(check.sorted).toBe(false)
  })

  it('el baseline marca todas las versiones como aplicadas', () => {
    const command = baselineCommand([
      { version: '20261113000000', file: 'a.sql' },
      { version: '20261115000000', file: 'b.sql' },
      { version: '20261116000000', file: 'c.sql' },
    ])
    expect(command).toBe(
      'supabase migration repair 20261113000000 20261115000000 20261116000000 --status applied --remote',
    )
  })
})
