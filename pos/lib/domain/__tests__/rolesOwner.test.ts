import { effectiveRole, isOwner } from '../roles'

// Falla si el dueño deja de trabajar como encargado dentro del POS de un restaurante, si un empleado de menor rango no
// baja los permisos del terminal, o si alguien que no es dueño llega a la consola de la organización.
it('el dueño opera el POS como encargado y solo él tiene la consola', () => {
  expect(effectiveRole('owner', null)).toBe('admin')
  expect(effectiveRole('owner', 'owner')).toBe('admin')
  expect(effectiveRole('owner', 'waiter')).toBe('waiter')
  expect(effectiveRole('admin', 'owner')).toBe('admin')
  expect(isOwner('owner', null)).toBe(true)
  expect(isOwner('owner', 'owner')).toBe(true)
  expect(isOwner('owner', 'cashier')).toBe(false)
  expect(isOwner('admin', null)).toBe(false)
})
