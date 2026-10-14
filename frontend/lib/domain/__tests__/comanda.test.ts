import { byStation, fromOrder, fromTicket, type Comanda } from '@/lib/domain/comanda'
import type { KitOrder } from '@/lib/domain/orderState'
import type { KitchenTicket } from '@/lib/services/kitchen'

const ticket = (service: KitchenTicket['service']): KitchenTicket => ({
  id: 7, orderId: 3, tableId: 12, service, tracking: 'DI-004', waiter: 'Sofía', note: 'Alérgico al maní', firedAt: '2026-10-03T15:00:00Z', readyAt: null,
  lines: [
    { id: 1, name: 'Hamburguesa', qty: 2, note: 'término medio', station: 'Plancha', options: ['Doble', 'Tocineta'], readyAt: null, servedAt: null },
    { id: 2, name: 'Limonada', qty: 1, note: '', station: 'Barra', readyAt: null, servedAt: null },
    { id: 3, name: 'Pan', qty: 1, note: '', station: null, readyAt: null, servedAt: null },
  ],
})

// Falla si la comanda pierde las opciones o la nota del plato, o si un pedido para llevar sale con «Mesa 0».
it('arma la comanda desde el ticket de cocina', () => {
  const c = fromTicket(ticket('dine_in'))
  expect(c.place).toEqual({ kind: 'table', number: 12 })
  expect(c.lines[0]).toEqual({ qty: 2, name: 'Hamburguesa', options: ['Doble', 'Tocineta'], note: 'término medio', station: 'Plancha' })
  expect(c.note).toBe('Alérgico al maní')
  expect(fromTicket(ticket('takeout')).place).toEqual({ kind: 'takeout' })
  expect(fromTicket(ticket('delivery')).place).toEqual({ kind: 'delivery' })
})

// Falla si no sale una hoja por estación, si un equipo imprime estaciones que no son suyas, o si los platos sin
// estación se quedan sin imprimir.
it('una hoja por estación y solo las de este equipo', () => {
  const c: Comanda = fromTicket(ticket('dine_in'))
  expect(byStation(c).map((s) => [s.station, s.lines.map((l) => l.name)])).toEqual([['Plancha', ['Hamburguesa']], ['Barra', ['Limonada']], [null, ['Pan']]])
  expect(byStation(c, ['Barra']).map((s) => s.station)).toEqual(['Barra', null])
  expect(byStation({ ...c, lines: [] })).toEqual([])
})

// Falla si la comanda del detalle del pedido incluye platos que aún no se enviaron a cocina o pierde la estación.
it('desde el detalle del pedido solo lo enviado', () => {
  const order = { id: 3, number: 'TA-002', type: 'takeout', tableNumber: null, waiter: 'Carlos', lines: [
    { id: 1, uuid: 'a', productId: 10, name: 'Hamburguesa', qty: 1, unitPrice: 0, subtotal: 0, total: 0, note: '', courseId: 5, readyAt: null, servedAt: null, options: ['Doble'] },
    { id: 2, uuid: 'b', productId: 11, name: 'Postre', qty: 1, unitPrice: 0, subtotal: 0, total: 0, note: '', courseId: null, readyAt: null, servedAt: null },
  ] } as unknown as KitOrder
  const c = fromOrder(order, (id) => (id === 10 ? 'Plancha' : null))
  expect(c.place).toEqual({ kind: 'takeout' })
  expect(c.lines).toEqual([{ qty: 1, name: 'Hamburguesa', options: ['Doble'], note: '', station: 'Plancha' }])
})
