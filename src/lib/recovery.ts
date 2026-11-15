/**
 * Detecta el link de recuperación de contraseña apenas carga la app.
 *
 * Supabase lee el hash (#access_token=…&type=recovery) al inicializar y puede
 * borrarlo antes de que React monte la pantalla. Guardamos la intención acá,
 * en el primer módulo que se evalúa, y la conservamos en sessionStorage por si
 * la página se recarga antes de elegir la contraseña nueva.
 */
const KEY = 'comidas:recovery'

const hash = typeof window !== 'undefined' ? window.location.hash : ''
let pending = /(?:^|[#&?])type=recovery(?:&|$)/.test(hash)

if (typeof window !== 'undefined') {
  try {
    if (pending) sessionStorage.setItem(KEY, '1')
    else pending = sessionStorage.getItem(KEY) === '1'
  } catch {
    // sessionStorage bloqueado: seguimos con el hash de esta carga.
  }
}

export function recoveryPending(): boolean {
  return pending
}

export function clearRecovery(): void {
  pending = false
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // sin sessionStorage no hay nada que limpiar.
  }
}
