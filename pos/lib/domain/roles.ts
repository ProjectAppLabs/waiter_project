import { roleCan, type RolePolicy } from '@/lib/domain/permissions'
import { pathAllowed } from '@/lib/domain/navigation'

// Módulos del POS anteriores al kit; siguen nombrando las pantallas de administración (Shell y navFor).
export const NAV_ITEMS = ['operation', 'sales', 'catalog', 'inventory', 'customers', 'automation', 'billing', 'settings'] as const
export type NavItem = (typeof NAV_ITEMS)[number]

export type Role = 'waiter' | 'cashier' | 'admin'
export type AccountRole = Role | 'owner'
// Los que se asignan dentro de un restaurante (listas de invitar y cambiar rol).
export const ROLES: Role[] = ['waiter', 'cashier', 'admin']
const RANK: AccountRole[] = ['waiter', 'cashier', 'admin', 'owner']

// Quién manda en la pantalla: el empleado que inició turno, nunca la credencial del terminal. Si la tablet
// entró como administrador y luego marca su PIN un mesero, la pantalla es la del mesero. Y al revés, un
// empleado tampoco gana permisos que su terminal no tiene: se aplica el menor de los dos. Dentro del POS de un
// restaurante el dueño trabaja como su encargado (`admin`): la consola de la organización se decide con `isOwner`.
export function effectiveRole(userRole: AccountRole | null | undefined, employeeRole: AccountRole | null | undefined): Role {
  const user = userRole ?? 'waiter'
  const lower = !employeeRole ? user : RANK.indexOf(employeeRole) < RANK.indexOf(user) ? employeeRole : user
  return lower === 'owner' ? 'admin' : lower
}

// La consola de la organización es del dueño: lo es la credencial del terminal y, si ya marcó su PIN, también el empleado.
export function isOwner(userRole: AccountRole | null | undefined, employeeRole: AccountRole | null | undefined): boolean {
  return userRole === 'owner' && (!employeeRole || employeeRole === 'owner')
}

const NAV: Record<Role, NavItem[]> = {
  waiter: ['operation', 'customers'],
  cashier: ['operation', 'sales', 'customers', 'billing'],
  admin: ['operation', 'sales', 'catalog', 'inventory', 'customers', 'automation', 'billing', 'settings'],
}
export function navFor(role: Role): NavItem[] {
  return NAV[role]
}

// Desde la oleada I.1 la guarda sigue a las pestañas del kit (lib/domain/navigation.ts).
export function allowedPath(role: Role, pathname: string, policy?: RolePolicy): boolean {
  return pathAllowed(role, pathname, policy)
}

// Acciones puntuales que no son una pantalla entera.
export const can = {
  closeRegister: (role: Role) => role !== 'waiter',
  manageUsers: (role: Role) => role === 'admin',
  // Crear, editar o desactivar pisos y planos: configuración del local, no trabajo de sala.
  manageFloors: (role: Role) => role === 'admin',
  // Cobrar. Lo decide el restaurante en Configuración: con `waiterCanCharge` apagado, cobrar es de caja y
  // el mesero deja la mesa servida para que el cajero la elija en el plano.
  charge: (role: Role, waiterCanCharge: boolean, policy?: RolePolicy) => policy ? roleCan(role, 'charge_orders', policy) : role !== 'waiter' || waiterCanCharge,
  // Ver el inventario lo hace cualquiera; crear, editar o borrar platos e ingredientes, no. Apagado por
  // defecto para la sala; el restaurante lo enciende si quiere dárselo.
  editInventory: (role: Role, waiterCanEditInventory: boolean, policy?: RolePolicy) => policy ? roleCan(role, 'edit_inventory', policy) : role !== 'waiter' || waiterCanEditInventory,
}
