import { USERS, api, createOrder, ensureOpenShift, expect, restaurantId, signIn, test } from './helpers/waiter'

// Falla si la encargada no puede devolver una parte de un pedido cobrado desde Historial, si la cuenta no muestra lo
// devuelto, si el efectivo devuelto no baja el esperado del cuadre, o si el dueño no la ve en Devoluciones (plan U1).
test('devolución parcial en efectivo desde Historial', async ({ page, browser }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  // Un pedido de dos platos, cobrado en efectivo.
  const { order } = await createOrder(page, rid, 'devolución e2e')
  await api(page, `orders/${order.id}/lines`, { method: 'POST', data: { lines: [{ uuid: crypto.randomUUID(), product_id: order.lines[0].product_id, qty: 1 }], fire: true } })
  const full = (await api<{ order: { total: number } }>(page, `orders/${order.id}`)).order
  const cash = (await api<{ methods: { id: number; type: string }[] }>(page, `payment-methods?restaurant_id=${rid}`)).methods.find((m) => m.type === 'cash')!
  await api(page, `orders/${order.id}/payments`, { method: 'POST', data: { method_id: cash.id, amount: full.total, request_key: `e2e-${crypto.randomUUID()}` } })
  await api(page, `orders/${order.id}/pay`, { method: 'POST' })
  const shift = (await api<{ shift: { id: number } }>(page, `shifts/open?restaurant_id=${rid}`)).shift
  const before = (await api<{ expected_cash: number }>(page, `shifts/${shift.id}/closing`)).expected_cash

  await page.goto('/historial')
  await page.getByText(order.number).first().click()
  await page.getByRole('button', { name: 'Devolver' }).click()
  const dialog = page.getByRole('dialog', { name: `Devolver pedido ${order.number}` })
  const lineName = order.lines[0].name
  await dialog.getByRole('button', { name: `Uno más de ${lineName}` }).first().click()
  const reason = `Plato frío e2e ${Date.now()}`
  await dialog.getByLabel('Motivo de la devolución').fill(reason)
  const confirm = dialog.getByRole('button', { name: /^Devolver \$/ })
  await expect(confirm).toBeEnabled()
  const label = (await confirm.textContent()) ?? ''
  const amount = Number(label.replace(/\D/g, ''))
  await confirm.click()
  await expect(page.getByText(/Devolución de \$ .* registrada/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('Cuenta').or(page.locator('aside')).filter({ hasText: 'Devuelto' }).first()).toBeVisible()

  const after = (await api<{ expected_cash: number; refunds_cash: number }>(page, `shifts/${shift.id}/closing`))
  expect(before - after.expected_cash).toBe(amount)
  expect(after.refunds_cash).toBeGreaterThanOrEqual(amount)

  const owner = await (await browser.newContext()).newPage()
  await signIn(owner, USERS.owner)
  await owner.waitForURL('**/organizacion')
  await owner.goto('/organizacion/devoluciones')
  await expect(owner.getByRole('table', { name: 'Devoluciones' }).getByRole('row').filter({ hasText: reason })).toContainText(order.number)
  await owner.context().close()
})
