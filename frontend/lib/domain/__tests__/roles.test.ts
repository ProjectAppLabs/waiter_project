import { allowedPath, can, effectiveRole, navFor } from '@/lib/domain/roles'

// Falla si un mesero llega a Configuración o a la caja, o si un cajero pierde Facturación.
it('limits navigation and routes by role', () => {
  expect(navFor('waiter')).toEqual(['operation', 'customers'])
  expect(allowedPath('waiter', '/configuracion')).toBe(false)
  expect(allowedPath('waiter', '/salon/3/agregar')).toBe(true)
  expect(allowedPath('cashier', '/facturacion')).toBe(false)
  expect(allowedPath('cashier', '/catalogo')).toBe(false)
  expect(allowedPath('admin', '/configuracion')).toBe(true)
})

// Falla si un mesero puede cerrar caja o si el cajero o el encargado la pierden. «Forzar cierre» ya no existe: el sistema
// propio no tiene descuadre contable que forzar (plan T).
it('keeps register closing away from waiters', () => {
  expect([can.closeRegister('waiter'), can.closeRegister('cashier'), can.closeRegister('admin')]).toEqual([false, true, true])
  expect(can).not.toHaveProperty('forceCloseRegister')
})

// Falla si la pantalla vuelve a seguir a la credencial del terminal: con la tablet abierta como
// administrador, un mesero que marca su PIN veía Administración y podía entrar a Configuración.
it('the shift employee decides the role, never the terminal credential', () => {
  expect(effectiveRole('admin', 'waiter')).toBe('waiter')
  expect(effectiveRole('admin', 'cashier')).toBe('cashier')
})

// Falla si un empleado gana permisos que su terminal no tiene.
it('an employee never outranks the terminal', () => {
  expect(effectiveRole('waiter', 'admin')).toBe('waiter')
  expect(effectiveRole('cashier', 'admin')).toBe('cashier')
  expect(effectiveRole('admin', null)).toBe('admin')
})
