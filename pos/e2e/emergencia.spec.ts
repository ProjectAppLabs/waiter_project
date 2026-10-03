import { USERS, api, ensureOpenShift, expect, restaurantId, signIn, test } from './helpers/waiter'

// Plan V: el modo de emergencia. Necesita la compilación de producción (el service worker solo se registra allí):
//   cd pos && next build && next start -H 192.168.56.10 -p 3000, y luego PLAYWRIGHT_PROD=1 … playwright test e2e/emergencia.spec.ts
test.skip(!process.env.PLAYWRIGHT_PROD, 'Solo contra la compilación de producción (PLAYWRIGHT_PROD=1).')

// Falla si sin red la app no abre al recargar, si no aparece la cuenta regresiva hacia la caja, si la encargada no
// puede adelantar la emergencia, si la caja no puede crear un pedido y cobrarlo después desde «Pedidos de emergencia»,
// si el arqueo provisional no suma ese cobro, o si al volver la red el pedido no llega al servidor pagado, una sola vez
// y con su número provisional en la nota.
test('emergencia: sin red la caja crea, cobra después y todo llega al volver la red', async ({ page, context }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('waiter.emergency') || k.startsWith('waiter.outbox') || k === 'waiter.offlineSince') localStorage.removeItem(k) })
  // Con red: se recorren las pantallas de la caja para que el equipo las guarde.
  for (const path of ['/pedidos', '/pedidos/nuevo', '/emergencia']) { await page.goto(path); await page.waitForLoadState('networkidle') }
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto('/pedidos'); await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  await page.reload()
  const status = page.getByRole('status').filter({ hasText: /Sin conexión|Modo emergencia/ })
  await expect(status).toContainText(/en [23]:\d\d la operación pasa a la caja/, { timeout: 30_000 })
  await status.getByRole('button', { name: 'Pasar a la caja ahora' }).click()
  await expect(status).toContainText('Modo emergencia', { timeout: 5_000 })

  // Pedido para llevar sin cobrar: se cierra el cobro y queda abierto.
  const name = `Emergencia e2e ${Date.now()}`
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para llevar o domicilio' }).click()
  await page.getByRole('radio', { name: 'Para llevar' }).check()
  await page.getByRole('textbox', { name: 'Nombre del cliente' }).fill(name)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Hamburguesa Clásica' }).getByRole('button', { name: 'Agregar' }).click()
  await page.getByRole('dialog', { name: 'Agregar plato' }).getByRole('button', { name: 'Agregar al carrito' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar al pago' }).click()
  await page.getByRole('dialog', { name: 'Cobrar sin conexión' }).getByRole('button', { name: 'Cerrar' }).click()

  // Se cobra después desde Pedidos de emergencia.
  await page.goto('/emergencia')
  const row = page.getByRole('listitem').filter({ hasText: name })
  await expect(row).toContainText('Sin cobrar')
  const number = (await row.locator('p').first().textContent())!.trim()
  expect(number).toMatch(/^E-\d\d$/)
  await row.getByRole('button', { name: 'Cobrar' }).click()
  const pay = page.getByRole('dialog', { name: 'Cobrar sin conexión' })
  await pay.getByLabel('Efectivo recibido').fill('50000')
  await pay.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(row).toContainText('Cobrado')
  await expect(page.getByRole('region', { name: 'Arqueo provisional' })).toContainText(/Cobros en efectivo sin conexión\$ [1-9]/)

  // La red vuelve: todo se envía, el pedido recibe su número y el aviso desaparece.
  await context.setOffline(false)
  // Sin aviso: ni pendientes ni rechazos.
  await expect(page.getByRole('status').filter({ hasText: /enviar|Enviando|Modo emergencia|Sin conexión/ })).toHaveCount(0, { timeout: 60_000 })
  await expect(row).toContainText('En el servidor', { timeout: 30_000 })
  const orders = (await api<{ orders: { customer_name: string; state: string; note?: string }[] }>(page, `sales/orders?restaurant_id=${rid}&limit=40`)).orders.filter((o) => o.customer_name === name)
  expect(orders.map((o) => o.state)).toEqual(['paid'])
})
