import { roleCan, DEFAULT_ROLE_POLICY, type RolePolicy, type RoleView } from '@/lib/domain/permissions'
import { hasModule, TAB_MODULE, type ActiveModules } from '@/lib/domain/modules'
import type { Role } from '@/lib/domain/roles'

// Pestañas disponibles. La política guardada del restaurante decide cuáles ve cada rol.
export const KIT_TABS = ['dashboard', 'orders', 'tables', 'reservations', 'history', 'inventory', 'kitchen', 'admin'] as const
export type KitTab = (typeof KIT_TABS)[number]

export const TAB_ROUTES: Record<KitTab, string> = {
  dashboard: '/dashboard', orders: '/pedidos', tables: '/salon', reservations: '/reservas', history: '/historial',
  inventory: '/inventario', kitchen: '/kds', admin: '/ventas',
}

// Segunda fila de Administración (chips "Tab Menu" del kit): lo del restaurante. Plan Q: Clientes, Facturación y Retorno
// de inversión son del negocio y viven en la consola del dueño; sus rutas viejas redirigen (MovedToConsole).
// El encargado ve además los cuadres de caja y la rentabilidad de su sede (solo su restaurante; los de todos, el dueño).
export const ADMIN_SUBTABS = [['sales', '/ventas'], ['cash', '/cuadres'], ['profit', '/rentabilidad'], ['settings', '/configuracion']] as const
export type AdminSubtab = (typeof ADMIN_SUBTABS)[number][0]

// Plan W: una pestaña de un módulo apagado no se muestra, ni siquiera al encargado.
export const tabsFor = (role: Role, policy: RolePolicy = DEFAULT_ROLE_POLICY, modules?: ActiveModules): KitTab[] => KIT_TABS.filter((tab) =>
  hasModule(modules, TAB_MODULE[tab]) && (tab === 'admin' ? role === 'admin' || policy[role].views.includes('sales') : roleCan(role, tab, policy)))
export const adminSubtabsFor = (role: Role, policy: RolePolicy = DEFAULT_ROLE_POLICY, modules?: ActiveModules) => ADMIN_SUBTABS.filter(([key]) =>
  (key !== 'profit' || hasModule(modules, 'inventario')) && (role === 'admin' || policy[role].views.includes(key as RoleView)))

const PATH_TAB: [RegExp, KitTab][] = [
  [/^\/dashboard/, 'dashboard'], [/^\/(pedidos|operacion)/, 'orders'], [/^\/salon/, 'tables'], [/^\/reservas/, 'reservations'],
  [/^\/historial/, 'history'], [/^\/inventario/, 'inventory'], [/^\/kds/, 'kitchen'],
  [/^\/(ventas|cuadres|rentabilidad|catalogo|clientes|facturacion|automatizacion|configuracion|kit)/, 'admin'],
]
export const tabForPath = (pathname: string): KitTab | null => PATH_TAB.find(([re]) => re.test(pathname))?.[1] ?? null
export const adminSubtabForPath = (pathname: string): AdminSubtab | null => ADMIN_SUBTABS.find(([, href]) => pathname.startsWith(href))?.[0] ?? null

// Una ruta se permite si su pestaña es del rol y, dentro de Administración, si su chip también lo es. Rutas sin pestaña (galería, etc.) pasan.
export function pathAllowed(role: Role, pathname: string, policy: RolePolicy = DEFAULT_ROLE_POLICY): boolean {
  if (/^\/pago(\/|$)/.test(pathname)) return roleCan(role, 'charge_orders', policy)
  if (/^\/(salon|pedidos)\/(nuevo|\d+\/agregar)(\/|$)/.test(pathname) && !roleCan(role, 'create_orders', policy)) return false
  const tab = tabForPath(pathname)
  if (!tab) return true
  if (!tabsFor(role, policy).includes(tab)) return false
  if (tab !== 'admin') return true
  const sub = adminSubtabForPath(pathname)
  return sub ? adminSubtabsFor(role, policy).some(([key]) => key === sub) : role === 'admin'
}

// Inicio por rol y por vistas autorizadas. Sin caja, el equipo operativo va a abrirla.
export function homePath(role: Role, hasOpenSession: boolean, policy: RolePolicy = DEFAULT_ROLE_POLICY): string {
  if (role === 'admin') return '/dashboard'
  if (!hasOpenSession) return '/caja'
  const preferred: KitTab[] = role === 'waiter' ? ['tables', 'orders'] : ['orders', 'tables']
  const tab = [...preferred, ...tabsFor(role, policy)].find((entry) => tabsFor(role, policy).includes(entry))
  return tab === 'admin' ? adminSubtabsFor(role, policy)[0]?.[1] ?? '/salon' : TAB_ROUTES[tab ?? 'tables']
}

// Pantallas a pantalla completa, sin la barra de navegación: la cocina y la operación en vivo.
export function withShell(pathname: string): boolean {
  return !/^\/(kds|operacion)(\/|$)/.test(pathname)
}

export function administrationPath(pathname: string): boolean {
  return /^\/(dashboard|salon|inventario|reservas|historial|ventas|cuadres|rentabilidad|catalogo|clientes|facturacion|automatizacion|configuracion|kit)(\/|$)/.test(pathname)
}
