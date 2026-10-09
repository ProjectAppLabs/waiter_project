import { canOpenRegister, homePath } from '@/lib/domain/navigation'

// Falla si el cajero deja de ir a abrir caja con ella cerrada, o si el mesero —a quien el servidor NO deja abrir caja
// (experience/sales/api.py)— vuelve a caer en ese formulario, que siempre le fallaría, en vez de ir a Mesas.
it('sin caja abierta solo va a abrir caja quien puede abrirla', () => {
  expect(homePath('cashier', false)).toBe('/caja')
  expect(homePath('waiter', false)).toBe('/salon')
})

// Falla si la regla de quién abre caja en el POS se aparta de la del servidor (dueño/encargado y cajero sí; mesero no).
it('quién puede abrir caja coincide con la regla del servidor', () => {
  expect(canOpenRegister('admin')).toBe(true)
  expect(canOpenRegister('cashier')).toBe(true)
  expect(canOpenRegister('waiter')).toBe(false)
})
