import { USERS, api, createOrder, ensureOpenShift, expect, restaurantId, settleOpenOrders, signIn, test } from './helpers/waiter'

// El turno de punta a punta en Burger House: caja abierta, pedido en mesa, cocina a dos manos, cobro y cierre con nota.
test.describe.configure({ mode: 'serial' })

// Falla si un pedido en mesa no aparece en Pedidos y en el salón, o si cocina no lo recibe con su nota en la estación.
test('el pedido llega a pedidos, al salón y a cocina', async ({ page }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  const { order, table } = await createOrder(page, rid, 'sin cebolla e2e')
  await page.goto('/pedidos')
  await expect(page.getByText(order.number).first()).toBeVisible({ timeout: 30_000 })
  await page.goto('/kds')
  const ticket = page.getByRole('article').filter({ hasText: order.number }).first()
  await expect(ticket).toContainText('sin cebolla e2e')
  await ticket.getByRole('button', { name: /Iniciar preparación/ }).click()
  await ticket.getByRole('button', { name: /Listo todo/ }).click()
  // Cocina no entrega: el plato listo espera al salón.
  await expect.poll(async () => (await api<{ order: { lines: { ready_at: string | null; served_at: string | null }[] } }>(page, `orders/${order.id}`)).order.lines.every((l) => l.ready_at && !l.served_at)).toBe(true)
  await page.goto('/salon')
  await expect(page.getByText(/Listo para servir/).first()).toBeVisible({ timeout: 30_000 })
  void table
})

// Falla si el cobro en efectivo no da el cambio, no deja el pedido pagado o no aparece en Historial.
test('cobro en efectivo con cambio e historial', async ({ page }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  const { order } = await createOrder(page, rid)
  const cash = (await api<{ methods: { id: number; type: string }[] }>(page, `payment-methods?restaurant_id=${rid}`)).methods.find((m) => m.type === 'cash')!
  await api(page, `courses/${order.courses[0].id}/ready`, { method: 'POST' })
  await api(page, `orders/${order.id}/payments`, { method: 'POST', data: { method_id: cash.id, amount: order.total, received: order.total + 10000, request_key: `e2e-${crypto.randomUUID()}` } })
  const paid = (await api<{ order: { state: string; change: number } }>(page, `orders/${order.id}/pay`, { method: 'POST' })).order
  expect(paid.state).toBe('paid')
  expect(paid.change).toBe(10000)
  await page.goto('/historial')
  await expect(page.getByText(order.number).first()).toBeVisible({ timeout: 30_000 })
})

// Falla si se puede cerrar la caja con diferencia sin nota, o si la nota no llega a Cuadres de caja del dueño (plan Q).
test('cierre con diferencia exige nota y el dueño la ve', async ({ page, browser }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  await settleOpenOrders(page, rid)
  await page.goto('/ventas')
  await page.getByRole('button', { name: /Cerrar caja/ }).first().click()
  const dialog = page.getByRole('dialog')
  const shift = (await api<{ shift: { id: number } }>(page, `shifts/open?restaurant_id=${rid}`)).shift
  const expected = (await api<{ expected_cash: number }>(page, `shifts/${shift.id}/closing`)).expected_cash
  await dialog.getByLabel('Efectivo contado (COP)').fill(String(expected - 3000))
  await expect(dialog.getByRole('button', { name: /^Cerrar caja/ })).toBeDisabled()
  await expect(dialog).toContainText('Escribe el motivo')
  const note = `Faltante de prueba e2e ${Date.now()}`
  await dialog.getByLabel(/¿Por qué|Notas de cierre/).fill(note)
  await dialog.getByRole('button', { name: /^Cerrar caja/ }).click()
  await expect.poll(async () => (await api<{ shift: unknown }>(page, `shifts/open?restaurant_id=${rid}`)).shift).toBeNull()
  const owner = await (await browser.newContext()).newPage()
  await signIn(owner, USERS.owner)
  await owner.waitForURL('**/organizacion')
  await owner.goto('/organizacion/cuadres')
  await expect(owner.getByRole('row').filter({ hasText: note })).toContainText('3.000')
  await owner.context().close()
})
