import { canRequest, filterByTab, productOf, unreadCount, type Notification } from '@/lib/domain/notifications'

const make = (over: Partial<Notification>): Notification => ({
  id: 1, kind: 'inventory', title: 'Stock bajo', body: '', resModel: 'product.product', resId: 7,
  action: 'request_ingredient', actionDone: false, read: false, at: '2026-09-06 10:00:00', ...over,
})

// Falla si la pestaña Inventario o Cocina deja pasar avisos del otro tipo, o si el conteo cuenta leídos.
it('filters by tab and counts only the unread ones', () => {
  const items = [make({}), make({ id: 2, kind: 'kitchen', read: true }), make({ id: 3, kind: 'system' })]
  expect(filterByTab(items, 'all')).toHaveLength(3)
  expect(filterByTab(items, 'inventory').map((n) => n.id)).toEqual([1])
  expect(filterByTab(items, 'kitchen').map((n) => n.id)).toEqual([2])
  expect(unreadCount(items)).toBe(2)
})

// Falla si "Solicitar ingredientes" aparece en un aviso ya atendido, de cocina, o sin producto en res_id.
it('offers the ingredient request only on a pending inventory alert with a product', () => {
  expect(productOf(make({}))).toBe(7)
  expect(canRequest(make({}))).toBe(true)
  expect(canRequest(make({ actionDone: true }))).toBe(false)
  expect(canRequest(make({ kind: 'kitchen', resModel: 'pos.order', action: 'serve' }))).toBe(false)
  expect(canRequest(make({ resId: null }))).toBe(false)
})
