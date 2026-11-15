import { describe, expect, it } from 'vitest'
import { resolveAppMode } from '../src/lib/appMode'

describe('modo de la app', () => {
  it('sin credenciales queda sin configurar: no hay app local para usuarios', () => {
    expect(
      resolveAppMode({ url: '', key: '', mode: 'production', e2eLocal: undefined }),
    ).toBe('unconfigured')
  })

  it('con URL y clave funciona en la nube y exige cuenta', () => {
    expect(
      resolveAppMode({
        url: 'https://proyecto.supabase.co',
        key: 'sb_publishable_x',
        mode: 'production',
        e2eLocal: undefined,
      }),
    ).toBe('cloud')
  })

  it('el modo local solo existe en los tests e2e', () => {
    expect(resolveAppMode({ url: '', key: '', mode: 'e2e', e2eLocal: '1' })).toBe(
      'e2e-local',
    )
    expect(
      resolveAppMode({ url: '', key: '', mode: 'production', e2eLocal: '1' }),
    ).toBe('unconfigured')
    expect(resolveAppMode({ url: '', key: '', mode: 'e2e', e2eLocal: undefined })).toBe(
      'unconfigured',
    )
  })
})
