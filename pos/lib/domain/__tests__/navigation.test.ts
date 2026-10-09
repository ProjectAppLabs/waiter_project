import { DEFAULT_ROLE_POLICY, type RoleView } from '@/lib/domain/permissions'
import { administrationPath, ADMIN_SUBTABS, TAB_ROUTES, adminSubtabsFor, tabForPath, tabsFor, homePath, withShell, pathAllowed } from '@/lib/domain/navigation'
import { allowedPath } from '@/lib/domain/roles'

// Falla si el mesero ve pestañas de cocina o administración, o si el cajero y el admin las pierden.
it('gives each role its tabs', () => {
  expect(tabsFor('waiter')).toEqual(['tables'])
  expect(tabsFor('cashier')).toEqual(['orders'])
  expect(tabsFor('admin')).toContain('admin')
})

// Falla si el cajero ve chips de administración que no le tocan (catálogo, configuración).
it('filters the administration row by role', () => {
  expect(adminSubtabsFor('cashier').map(([key]) => key)).toEqual([])
  expect(adminSubtabsFor('admin')).toHaveLength(ADMIN_SUBTABS.length)
})

// Falla si una ruta de administración deja de activar la pestaña Administración.
it('maps paths to tabs, including admin subtabs', () => {
  expect(tabForPath('/salon/12/agregar')).toBe('tables')
  expect(tabForPath('/configuracion')).toBe('admin')
  expect(tabForPath('/pedidos')).toBe('orders')
  expect(tabForPath('/loquesea')).toBeNull()
  expect(ADMIN_SUBTABS.map(([, href]) => href)).toContain(TAB_ROUTES.admin)
})

// Falla si un mesero puede entrar a /ventas o si pierde /reservas; si el cajero pierde facturación o gana catálogo.
it('allowedPath follows the tabs and the admin row', () => {
  expect(allowedPath('waiter', '/reservas')).toBe(false)
  expect(allowedPath('waiter', '/ventas')).toBe(false)
  expect(allowedPath('cashier', '/facturacion')).toBe(false)
  expect(allowedPath('cashier', '/catalogo')).toBe(false)
  expect(allowedPath('admin', '/configuracion')).toBe(true)
  expect(allowedPath('admin', '/kit')).toBe(true)
  expect(allowedPath('cashier', '/kit')).toBe(false)
})

// Falla si la gestión del restaurante exige caja abierta o si pedidos, cobro o cocina se abren sin caja.
it('keeps restaurant management available without cash while blocking order operations', () => {
  // Inicio pasó a este grupo: es visión general (semanas, meses), no operación del turno.
  for (const path of ['/dashboard', '/salon', '/inventario', '/reservas', '/catalogo', '/configuracion', '/ventas', '/historial']) expect(administrationPath(path)).toBe(true)
  for (const path of ['/pedidos', '/pedidos/nuevo', '/pago/3', '/kds']) expect(administrationPath(path)).toBe(false)
})

// Falla si el administrador vuelve a caer en Mesas al entrar (lo pidió el dueño: su pantalla es Inicio, con la visión
// general); si el cajero y el mesero dejan de ir a Mesas con la caja abierta; si el cajero deja de ir a abrir caja con
// ella cerrada; o si el mesero —a quien el servidor NO deja abrir caja— cae en ese formulario en vez de ir a Mesas.
it('sends each role to its own home screen', () => {
  expect(homePath('admin', true)).toBe('/dashboard')
  expect(homePath('admin', false)).toBe('/dashboard')
  expect(homePath('waiter', true)).toBe('/salon')
  expect(homePath('cashier', true)).toBe('/pedidos')
  expect(homePath('cashier', false)).toBe('/caja')
  expect(homePath('waiter', false)).toBe('/salon')
})

// Falla si Inicio vuelve a exigir caja abierta al administrador: el guardia de rutas lo mandaba a «Abrir caja» y la
// visión general de semanas y meses no necesita un turno.
it('lets an admin open Inicio with the register closed', () => {
  expect(administrationPath('/dashboard')).toBe(true)
})

// Falla si la barra de navegación aparece en las pantallas a pantalla completa (cocina, operación en vivo) o desaparece
// de las demás, ahora que la pinta el layout y no cada página.
it('knows which screens carry the navigation bar', () => {
  for (const path of ['/dashboard', '/pedidos', '/salon', '/reservas', '/ventas', '/configuracion']) expect(withShell(path)).toBe(true)
  for (const path of ['/kds', '/operacion']) expect(withShell(path)).toBe(false)
})

// Falla si Administración del POS vuelve a ofrecer lo que es del dueño (clientes, facturación, retorno de inversión), o
// si un cajero con permiso de ventas no ve Ventas, o si ve los cuadres y la rentabilidad del encargado (plan Q).
it('Administración del POS solo trae lo del restaurante', () => {
  expect(adminSubtabsFor('admin').map(([key]) => key)).toEqual(['sales', 'cash', 'profit', 'settings'])
  const policy = { ...DEFAULT_ROLE_POLICY, cashier: { views: ['orders', 'sales', 'billing', 'customers'] as RoleView[], actions: [] } }
  expect(adminSubtabsFor('cashier', policy).map(([key]) => key)).toEqual(['sales'])
  expect(pathAllowed('cashier', '/facturacion', policy)).toBe(false)
})


// Falla si la política de roles guardada no se aplica a pestañas y rutas, o si da acciones que no otorga.
it('uses the saved policy for links, direct routes and action routes', () => {
  const policy = JSON.parse(JSON.stringify(DEFAULT_ROLE_POLICY))
  policy.waiter.views.push('orders', 'history')
  policy.waiter.actions.push('charge_orders')
  policy.cashier.actions = ['charge_orders']
  expect(tabsFor('waiter', policy)).toEqual(['orders', 'tables', 'history'])
  expect(allowedPath('waiter', '/pago/1', policy)).toBe(true)
  expect(allowedPath('waiter', '/pago/1')).toBe(false)
  expect(allowedPath('waiter', '/salon/nuevo')).toBe(true)
  expect(allowedPath('waiter', '/pedidos/nuevo')).toBe(false)
  expect(allowedPath('cashier', '/pedidos/nuevo', policy)).toBe(false)
  expect(allowedPath('cashier', '/pedidos/1/agregar', policy)).toBe(false)
  expect(allowedPath('cashier', '/pago/1', policy)).toBe(true)
})
