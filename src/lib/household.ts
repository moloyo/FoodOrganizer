import type { Household } from '../types'

/**
 * Salir de un hogar deja los datos compartidos con los miembros que quedan.
 * Si el usuario es el único, la RPC `household_leave()` borra el hogar vacío
 * y el cascade se lleva platos, planes y compras. Por eso la UI no lo permite:
 * para cambiar de hogar se usa un link de invitación (`household_join` mueve
 * los datos al destino) y para empezar de cero existe «Borrar todos mis datos».
 */
export function canLeaveHousehold(household: Household | null): boolean {
  return Boolean(household && household.memberCount > 1)
}
