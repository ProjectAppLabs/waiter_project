import { USERS, api, ensureOpenShift, expect, restaurantId, signIn, test } from './helpers/waiter'

// Plan U2 y U3: el POS sigue tomando pedidos sin internet, imprime la comanda y lo envía todo al volver la red.
test.describe.configure({ mode: 'serial' })

// Falla si al enviar a cocina no sale la comanda impresa (con su estación y las opciones del plato) en un equipo que
// imprime comandas.
test('la comanda se imprime al enviar a cocina', async ({ page }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  await ensureOpenShift(page, await restaurantId(page))
  await page.evaluate(() => localStorage.setItem('waiter.print', JSON.stringify({ autoComanda: true })))
  await page.goto('/pedidos/nuevo')
  await page.evaluate(() => {
    ;(window as unknown as { printed: string[] }).printed = []
    window.print = () => { (window as unknown as { printed: string[] }).printed.push(document.querySelector('.comanda-print')?.textContent ?? '') }
  })
  const name = `Comanda e2e ${Date.now()}`
  await page.getByRole('button', { name: 'Para llevar o domicilio' }).click()
  await page.getByRole('radio', { name: 'Para llevar' }).check()
  await page.getByRole('textbox', { name: 'Nombre del cliente' }).fill(name)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Hamburguesa Clásica' }).getByRole('button', { name: 'Agregar' }).click()
  const add = page.getByRole('dialog', { name: 'Agregar plato' })
  await add.getByRole('checkbox', { name: /Adición de tocineta/ }).click()
  await add.getByRole('button', { name: 'Agregar al carrito' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar al pago' }).click()
  const pay = page.getByRole('dialog', { name: 'Pago', exact: true })
  await pay.getByRole('button', { name: '50.000' }).click()
  await pay.getByRole('button', { name: 'Pagar ahora' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: string[] }).printed.join('\n')), { timeout: 30_000 }).toContain('Hamburguesa Clásica')
  const printed = await page.evaluate(() => (window as unknown as { printed: string[] }).printed.join('\n'))
  expect(printed).toContain('+ Adición de tocineta')
  expect(printed).toContain('Para llevar')
})

// Falla si sin conexión no se puede crear y cobrar un pedido para llevar, si no se avisa que hay operaciones por
// enviar, o si al volver la red el pedido no llega al servidor pagado y una sola vez.
test('pedido y cobro sin conexión se envían al volver la red', async ({ page, context }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  await page.goto('/pedidos/nuevo')
  const name = `Sin red e2e ${Date.now()}`
  await page.getByRole('button', { name: 'Para llevar o domicilio' }).click()
  await page.getByRole('radio', { name: 'Para llevar' }).check()
  await page.getByRole('textbox', { name: 'Nombre del cliente' }).fill(name)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Hamburguesa Clásica' }).getByRole('button', { name: 'Agregar' }).click()
  await page.getByRole('dialog', { name: 'Agregar plato' }).getByRole('button', { name: 'Agregar al carrito' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Continuar al pago' }).click()
  const pay = page.getByRole('dialog', { name: 'Cobrar sin conexión' })
  await pay.getByLabel('Efectivo recibido').fill('50000')
  await pay.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Sin conexión/ })).toContainText(/la operación pasa a la caja · 4 por enviar/)

  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: /por enviar|Enviando/ })).toHaveCount(0, { timeout: 60_000 })
  const orders = (await api<{ orders: { customer_name: string; state: string }[] }>(page, `sales/orders?restaurant_id=${rid}&limit=30`)).orders
  expect(orders.filter((o) => o.customer_name === name).map((o) => o.state)).toEqual(['paid'])
})
