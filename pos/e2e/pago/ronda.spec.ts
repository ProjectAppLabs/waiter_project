import { expect, type Page } from '@playwright/test'

import { createPendingCheckout, expectNoHorizontalDocumentOverflow, expectReachable, orderById, qaApi } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

for (const viewport of RONDA_VIEWPORTS) {
  // Falla si el diálogo de cobro vuelve a ocultar métodos o acciones a ${viewport.width} px, o registra un importe/cambio distinto.
  test(`cobro en efectivo conserva $ 38.900 en ${viewport.alias}`, {
    tag: ['@flow:pos-payment-checkout', '@outcome:success', `@viewport:${viewport.alias}`],
  }, async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
    const order = await createPendingCheckout(page, viewport.alias)

    const ordersLink = page.getByRole('link', { name: 'Pedidos', exact: true })
    await ordersLink.click()
    await expect(page).toHaveURL(/\/pedidos$/)

    const orderCard = page.getByRole('article', { name: `Cuenta ${order.number}`, exact: true })
    await expect(orderCard).toContainText('$ 38.900')
    const charge = orderCard.getByRole('link', { name: 'Cobrar', exact: true })
    await charge.click()

    const payment = page.getByRole('dialog', { name: 'Pago', exact: true })
    await expect(payment).toContainText('$ 38.900')
    await page.setViewportSize(viewport)
    await expectReachable(payment, 'el diálogo Pago')
    const manualAmount = payment.getByRole('textbox', { name: 'Importe de este pago', exact: true })
    const manualAmountGeometry = await expectReachable<HTMLInputElement>(manualAmount, 'el importe manual')
    expect(manualAmountGeometry.fontSize).toBeGreaterThanOrEqual(16)
    const close = payment.getByRole('button', { name: 'Cerrar', exact: true })
    const closeGeometry = await expectReachable(close, 'el cierre de Pago')
    expect(closeGeometry.width).toBeGreaterThanOrEqual(44)
    expect(closeGeometry.height).toBeGreaterThanOrEqual(44)
    for (const method of ['Efectivo', 'Tarjeta', 'Código QR']) {
      const tab = payment.getByRole('tab', { name: method, exact: true })
      await expectReachable(tab, `la pestaña ${method}`)
      await tab.click()
    }

    const cash = payment.getByRole('tab', { name: 'Efectivo', exact: true })
    await cash.click()
    const moreOptions = payment.getByRole('button', { name: 'Más opciones', exact: true })
    await expectReachable(moreOptions, 'Más opciones')
    await moreOptions.click()
    await expect(moreOptions).toHaveAttribute('aria-expanded', 'true')

    const fiftyThousand = payment.getByRole('button', { name: '50.000', exact: true })
    await expectReachable(fiftyThousand, 'el importe rápido 50.000')
    await fiftyThousand.click()
    await expect(payment.getByLabel('Efectivo recibido', { exact: true })).toHaveText('$50.000')
    await expect(payment.getByText('Cambio $ 11.100', { exact: true })).toBeVisible()
    const payNow = payment.getByRole('button', { name: 'Pagar ahora', exact: true })
    await expectReachable(payNow, 'Pagar ahora')
    await expect(payNow).toBeEnabled()
    await payNow.click()

    const success = page.getByRole('dialog', { name: '¡Pago exitoso!', exact: true })
    const paidTotal = success.getByText('$ 38.900', { exact: true })
    const paidReceived = success.getByText('$ 50.000', { exact: true })
    const paidChange = success.getByLabel('Cambio', { exact: true })
    await expect(paidTotal).toBeVisible()
    await expect(paidReceived).toBeVisible()
    await expect(paidChange).toHaveText('$ 11.100')
    await expectReachable(paidTotal, 'el total del éxito de pago')
    await expectReachable(paidReceived, 'el efectivo recibido del éxito de pago')
    await expectReachable(paidChange, 'el cambio del éxito de pago')
    const done = success.getByRole('button', { name: 'Listo', exact: true })
    await expectReachable(done, 'Listo en el éxito de pago')
    await expectNoHorizontalDocumentOverflow(page)
    await done.click()
    await expect(page).toHaveURL(/\/pedidos$/)

    const after = await orderById(page, order.id)
    expect(after.order.state).toBe('paid')
    expect(after.order.total).toBe(38_900)
  })
}

async function preparePaymentReview(page: Page, accepted: boolean, name: string) {
  await page.goto('/dashboard')
  const order = await createPendingCheckout(page, name)
  const session = await qaApi<{ restaurants: { id: number; name: string }[] }>(page, 'auth/me')
  const restaurant = session.restaurants.find((r) => r.name === 'Local QA')
  if (!restaurant) throw new Error('No se encontró la sede aislada Local QA.')
  const methods = await qaApi<{ methods: { id: number; type: string }[] }>(page, `payment-methods?restaurant_id=${restaurant.id}`)
  const cash = methods.methods.find((m) => m.type === 'cash')
  if (!cash) throw new Error('La sede aislada no tiene un medio de efectivo.')
  const requestKey = `r3-review-${crypto.randomUUID()}`
  const reference = `comprobante-${order.id}`
  const paidAt = new Date().toISOString()
  if (accepted) await qaApi(page, `orders/${order.id}/payments`, {
    method: 'POST', data: { method_id: cash.id, amount: 38900, received: 50000, reference, request_key: requestKey },
  })
  const server = await qaApi<{ order: { id: number; state: string; paid_at: string | null; payments: { amount: number; request_key: string | null }[] } }>(page, `orders/${order.id}`)
  await page.evaluate(({ order, methodId, requestKey, reference, paidAt, server }) => {
    // Fixture de una versión anterior: el pago pudo llegar, pero su respuesta no quedó confirmada en el equipo.
    localStorage.setItem('waiter.outbox:qa-x0', JSON.stringify({ entries: [
      { id: 'review-payment', at: paidAt, label: order.number, kind: 'payment', order: { id: order.id }, methodId, amount: 'balance', received: 50000, reference, requestKey },
      { id: 'review-closing', at: paidAt, label: order.number, kind: 'pay', order: { id: order.id }, paidAt },
    ], failed: [], ids: {} }))
    const version = localStorage.getItem('waiter.cache-session:qa-x0') ?? ''
    localStorage.setItem(`waiter.cache:qa-x0:${version ? `${version}:` : ''}orders/${order.id}`, JSON.stringify(server))
  }, { order, methodId: cash.id, requestKey, reference, paidAt, server })
  return { ...order, requestKey, paidAt }
}

// Falla si consultar o confirmar un pago aceptado vuelve a cobrarlo, el doble clic inicia dos consultas o el cierre pierde la hora real.
test('revisión de cobro incierto confirma el original y reanuda su cierre', {
  tag: ['@flow:pos-payment-reconcile', '@outcome:success'],
}, async ({ page }) => {
  const order = await preparePaymentReview(page, true, 'revisión-confirmada')
  const writes: { path: string; body: unknown }[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith(`/experience/api/pos/v1/orders/${order.id}/`)) {
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() })
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Revisar (2)', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Operaciones para revisar', exact: true })
  const payment = review.getByRole('listitem').filter({ hasText: `Pago · ${order.number}` })
  await expect(payment).toContainText('Importe original no disponible')
  await expect(review.getByRole('button', { name: 'Descartar', exact: true })).toHaveCount(0)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let reads = 0
  const query = `**/experience/api/pos/v1/orders/${order.id}`
  await page.route(query, async (route) => { reads += 1; await held; await route.continue() })
  await payment.getByRole('button', { name: 'Consultar pedido', exact: true }).dblclick()
  await expect(payment.getByRole('button', { name: 'Consultando…', exact: true })).toBeDisabled()
  release()
  await expect(payment.getByLabel('Pedido consultado en el servidor', { exact: true })).toContainText('Efectivo · $ 38.900')
  expect(reads).toBe(1)
  await page.unroute(query)
  await payment.getByRole('button', { name: 'Confirmar pago registrado', exact: true }).click()
  await expect(payment).toHaveCount(0)
  const closing = review.getByRole('listitem').filter({ hasText: `Cerrar pedido · ${order.number}` })
  await closing.getByRole('button', { name: 'Consultar pedido', exact: true }).click()
  await closing.getByRole('button', { name: 'Reanudar cierre', exact: true }).click()
  await expect.poll(async () => (await orderById(page, order.id)).order.state).toBe('paid')
  const final = await qaApi<{ order: { paid_at: string; payments: { amount: number; request_key: string | null }[] } }>(page, `orders/${order.id}`)
  expect(final.order.payments).toHaveLength(1)
  expect(final.order.payments[0]).toMatchObject({ amount: 38900, request_key: order.requestKey })
  expect(Date.parse(final.order.paid_at)).toBe(Date.parse(order.paidAt))
  expect(writes).toEqual([{ path: `/experience/api/pos/v1/orders/${order.id}/pay`, body: { paid_at: order.paidAt } }])
  await page.reload()
  await expect(page.getByRole('button', { name: /^Revisar \(/ })).toHaveCount(0)
})

// Falla si una entrada antigua sin prueba concluyente se reenvía o desaparece al consultar o recargar.
test('revisión conserva el cobro antiguo sin prueba y su cierre dependiente', {
  tag: ['@flow:pos-payment-reconcile', '@outcome:error'],
}, async ({ page }) => {
  const order = await preparePaymentReview(page, false, 'revisión-sin-prueba')
  const posts: string[] = []
  page.on('request', (request) => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname) })
  await page.reload()
  await page.getByRole('button', { name: 'Revisar (2)', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Operaciones para revisar', exact: true })
  const payment = review.getByRole('listitem').filter({ hasText: `Pago · ${order.number}` })
  await payment.getByRole('button', { name: 'Consultar pedido', exact: true }).click()
  await expect(payment).toContainText('Conserva el registro y coteja el comprobante real.')
  await expect(review.getByRole('button', { name: 'Confirmar pago registrado', exact: true })).toHaveCount(0)
  await expect(review.getByRole('button', { name: 'Descartar', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Revisar (2)', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('waiter.outbox:qa-x0')!))
  expect(saved.entries).toEqual([])
  expect(saved.failed.map((f: { entry: { kind: string } }) => f.entry.kind)).toEqual(['payment', 'pay'])
  expect(saved.failed[0].entry).toMatchObject({ amount: 'balance', requestKey: order.requestKey })
  expect(posts.filter((path) => path.startsWith(`/experience/api/pos/v1/orders/${order.id}/`))).toEqual([])
  expect((await orderById(page, order.id)).order.state).toBe('draft')
})

// Falla si una consulta sin conexión usa el pago guardado en caché como prueba y habilita la confirmación del resultado incierto.
test('revisión exige respuesta fresca aunque exista una copia del pago aceptado', {
  tag: ['@flow:pos-payment-reconcile', '@outcome:failure'],
}, async ({ page }) => {
  const order = await preparePaymentReview(page, true, 'revisión-sin-red')
  await page.reload()
  await page.getByRole('button', { name: 'Revisar (2)', exact: true }).click()
  await page.route(`**/experience/api/pos/v1/orders/${order.id}`, (route) => route.abort('failed'))
  const review = page.getByRole('dialog', { name: 'Operaciones para revisar', exact: true })
  const payment = review.getByRole('listitem').filter({ hasText: `Pago · ${order.number}` })
  await payment.getByRole('button', { name: 'Consultar pedido', exact: true }).click()
  await expect(payment.getByRole('alert')).toContainText('No se pudo conectar con el servidor.')
  await expect(payment.getByLabel('Pedido consultado en el servidor', { exact: true })).toHaveCount(0)
  await expect(review.getByRole('button', { name: 'Confirmar pago registrado', exact: true })).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('waiter.outbox:qa-x0')!))
  expect(saved.failed).toHaveLength(2)
  expect(saved.failed[0].entry.requestKey).toBe(order.requestKey)
})
