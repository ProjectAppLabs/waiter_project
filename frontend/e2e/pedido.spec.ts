import { USERS, api, ensureOpenShift, expect, restaurantId, signIn, test } from './helpers/waiter'

// Falla si el asistente de pedidos no muestra las adiciones del plato desde la carta propia, si no crea el pedido con la
// adición, la nota y su precio, o si el cobro en efectivo del asistente no deja el pedido pagado.
test('pedido para llevar con adición, nota y cobro en efectivo', async ({ page }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  const name = `Cliente e2e ${Date.now()}`
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para llevar o domicilio' }).click()
  await page.getByRole('radio', { name: 'Para llevar' }).check()
  await page.getByRole('textbox', { name: 'Nombre del cliente' }).fill(name)
  await page.getByRole('button', { name: 'Continuar' }).click()

  await page.getByRole('listitem').filter({ hasText: 'Hamburguesa Clásica' }).getByRole('button', { name: 'Agregar' }).click()
  const add = page.getByRole('dialog', { name: 'Agregar plato' })
  await expect(add.getByRole('group', { name: /Acompañamientos/ })).toBeVisible()
  await add.getByRole('checkbox', { name: /Adición de tocineta/ }).click()
  await add.getByRole('textbox', { name: 'Nota para cocina' }).fill('término medio e2e')
  await add.getByRole('button', { name: 'Agregar al carrito' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Adición: Adición de tocineta')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar al pago' }).click()

  const pay = page.getByRole('dialog', { name: 'Pago', exact: true })
  await expect(pay).toContainText(name)
  await pay.getByRole('button', { name: '50.000' }).click()
  await pay.getByRole('button', { name: 'Pagar ahora' }).click()
  await expect(page.getByRole('dialog', { name: '¡Pago exitoso!' })).toBeVisible({ timeout: 30_000 })

  type Row = { id: number; customer_name: string; state: string; total: number; lines: { name: string; note: string; options: { name: string }[] }[] }
  const orders = (await api<{ orders: Row[] }>(page, `sales/orders?restaurant_id=${rid}&limit=20`)).orders
  const order = orders.find((o) => o.customer_name === name)
  expect(order, 'el pedido del asistente no está en el historial').toBeTruthy()
  expect(order!.state).toBe('paid')
  const detail = (await api<{ order: Row }>(page, `orders/${order!.id}`)).order
  const burger = detail.lines.find((l) => l.name === 'Hamburguesa Clásica')!
  expect(burger.note).toBe('término medio e2e')
  expect(burger.options.map((o) => o.name)).toEqual(['Adición de tocineta'])
  expect(detail.total).toBe(38900)
})
