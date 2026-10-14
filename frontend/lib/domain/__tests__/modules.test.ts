import { hasModule, moduleForPath, pathEnabled } from '@/lib/domain/modules'
import { adminSubtabsFor, tabsFor } from '@/lib/domain/navigation'

// Falla si un servidor que todavía no manda módulos apaga secciones (todo debe seguir como antes), o si el núcleo se
// puede apagar.
it('sin lista de módulos todo sigue activo y el núcleo nunca se apaga', () => {
  expect(hasModule(null, 'inventario')).toBe(true)
  expect(hasModule(undefined, 'reservas')).toBe(true)
  expect(hasModule([], 'nucleo')).toBe(true)
  expect(hasModule(['nucleo'], 'cocina')).toBe(false)
})

// Falla si la barra del POS muestra una pestaña o un chip de Administración de un módulo apagado, incluso al encargado.
it('las pestañas siguen a los módulos antes que al rol', () => {
  expect(tabsFor('admin', undefined, ['nucleo', 'salon'])).toEqual(['dashboard', 'orders', 'tables', 'history', 'admin'])
  expect(tabsFor('admin')).toContain('inventory')
  expect(adminSubtabsFor('admin', undefined, ['nucleo']).map(([k]) => k)).toEqual(['sales', 'cash', 'settings'])
})

// Falla si una pantalla de un módulo queda sin asignar (no se podría explicar al entrar por la dirección).
it('cada pantalla de módulo tiene su módulo', () => {
  expect(moduleForPath('/salon/nuevo')).toBe('salon')
  expect(moduleForPath('/kds')).toBe('cocina')
  expect(moduleForPath('/rentabilidad')).toBe('inventario')
  expect(moduleForPath('/organizacion/facturacion')).toBe('facturacion')
  expect(moduleForPath('/organizacion/clientes')).toBe('fidelizacion')
  expect(moduleForPath('/organizacion/pagos')).toBe('pagos_en_linea')
  expect(moduleForPath('/pedidos')).toBeNull()
  expect(moduleForPath('/organizacion/consumo')).toBeNull()
})

// Falla si la página del asistente se cierra a quien tiene solo uno de los dos módulos del asistente, o se abre sin ninguno.
it('abre el asistente con el módulo del menú o con el de WhatsApp', () => {
  expect(pathEnabled(['asistente_whatsapp'], '/organizacion/asistente')).toBe(true)
  expect(pathEnabled(['asistente_menu'], '/organizacion/asistente')).toBe(true)
  expect(pathEnabled(['salon'], '/organizacion/asistente')).toBe(false)
  expect(pathEnabled(['salon'], '/organizacion/whatsapp')).toBe(false)
  expect(pathEnabled(['salon'], '/organizacion/equipo')).toBe(true)
})
