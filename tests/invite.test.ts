import { describe, expect, it } from 'vitest'
import { buildInviteLink, inviteTokenFromHash } from '../src/lib/invite'

describe('links de invitación', () => {
  it('reconoce un token uuid en el hash', () => {
    const token = '3e26e041-6162-4d60-8e0f-99aec06bf4e6'
    expect(inviteTokenFromHash(`#/unirse/${token}`)).toBe(token)
    expect(inviteTokenFromHash(`#/unirse/${token.toUpperCase()}`)).toBe(token.toUpperCase())
  })

  it('ignora rutas que no son invitaciones o tokens inválidos', () => {
    expect(inviteTokenFromHash('#/')).toBeNull()
    expect(inviteTokenFromHash('#/ajustes')).toBeNull()
    expect(inviteTokenFromHash('#/unirse/no-es-uuid')).toBeNull()
    expect(inviteTokenFromHash('')).toBeNull()
    expect(inviteTokenFromHash('#/unirse/3e26e041')).toBeNull()
  })

  it('arma el link con el hash del HashRouter', () => {
    const stubWindow = {
      location: { origin: 'https://comidas-pi.vercel.app', pathname: '/' },
    }
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = stubWindow
    try {
      const token = '3e26e041-6162-4d60-8e0f-99aec06bf4e6'
      const link = buildInviteLink(token)
      expect(link).toBe(`https://comidas-pi.vercel.app/#/unirse/${token}`)
      expect(inviteTokenFromHash(`#${link.split('#')[1]}`)).toBe(token)
    } finally {
      ;(globalThis as { window?: unknown }).window = previous
    }
  })
})
