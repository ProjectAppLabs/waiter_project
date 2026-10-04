import type { KitTab } from '@/lib/domain/navigation'
import type { RoleAction, RoleView } from '@/lib/domain/permissions'

// Plan W: los módulos del producto (catálogo en el servidor, tenancy/modules.py). El POS solo los consulta: el servidor
// resuelve local → organización → plantilla y manda la lista de activos. Un módulo apagado oculta su sección; si se
// entra por la dirección, se explica en vez de romper la página.
export const MODULE_KEYS = ['nucleo', 'salon', 'cocina', 'inventario', 'facturacion', 'menu_comensal', 'pagos_en_linea', 'datafono',
  'fidelizacion', 'reservas', 'asistente_menu', 'asistente_whatsapp', 'multisucursal'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export const MODULE_NAMES: Record<ModuleKey, string> = {
  nucleo: 'Núcleo', salon: 'Salón', cocina: 'Cocina', inventario: 'Inventario', facturacion: 'Facturación electrónica',
  menu_comensal: 'Menú del comensal', pagos_en_linea: 'Pagos en línea', datafono: 'Datáfono integrado', fidelizacion: 'Fidelización',
  reservas: 'Reservas', asistente_menu: 'Asistente en el menú', asistente_whatsapp: 'Asistente de WhatsApp', multisucursal: 'Varios locales',
}

// `null`: el servidor no mandó la lista (versión anterior): todo activo, como antes de los módulos.
export type ActiveModules = readonly string[] | null | undefined
export const hasModule = (active: ActiveModules, key: ModuleKey) => key === 'nucleo' || !active || active.includes(key)

// Pestañas del POS y vistas de la política por rol.
export const TAB_MODULE: Record<KitTab, ModuleKey> = {
  dashboard: 'nucleo', orders: 'nucleo', history: 'nucleo', admin: 'nucleo', tables: 'salon', kitchen: 'cocina', inventory: 'inventario', reservations: 'reservas',
}
export const VIEW_MODULE: Record<RoleView, ModuleKey> = {
  dashboard: 'nucleo', orders: 'nucleo', history: 'nucleo', sales: 'nucleo', tables: 'salon', kitchen: 'cocina', inventory: 'inventario',
  reservations: 'reservas', customers: 'fidelizacion', billing: 'facturacion',
}

export const ACTION_MODULE: Record<RoleAction, ModuleKey> = {
  create_orders: 'nucleo', charge_orders: 'nucleo', refund_orders: 'nucleo', serve_orders: 'salon', edit_inventory: 'inventario',
}

// La pantalla de una dirección del POS o de la consola del dueño, y su módulo (null: del núcleo o sin módulo).
const PATH_MODULE: [RegExp, ModuleKey][] = [
  [/^\/salon(\/|$)/, 'salon'], [/^\/kds(\/|$)/, 'cocina'], [/^\/(inventario|rentabilidad)(\/|$)/, 'inventario'], [/^\/reservas(\/|$)/, 'reservas'],
  [/^\/organizacion\/rentabilidad(\/|$)/, 'inventario'], [/^\/organizacion\/facturacion(\/|$)/, 'facturacion'], [/^\/organizacion\/pagos(\/|$)/, 'pagos_en_linea'],
  [/^\/organizacion\/(clientes|promociones)(\/|$)/, 'fidelizacion'], [/^\/organizacion\/diseno(\/|$)/, 'menu_comensal'],
  [/^\/organizacion\/integraciones(\/|$)/, 'menu_comensal'],
]
export const moduleForPath = (pathname: string): ModuleKey | null => PATH_MODULE.find(([re]) => re.test(pathname))?.[1] ?? null
