import { expect, type Locator, type Page } from '@playwright/test'

import { createPendingCheckout, expectNoHorizontalDocumentOverflow, expectReachable, qaApi } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

for (const viewport of RONDA_VIEWPORTS) {
  // Falla si Pedidos recorta la búsqueda o Crear pedido a este ancho, pierde la cuenta de $ 38.900 o no recupera la lista al limpiar.
  test(`pedidos permite buscar, filtrar y crear con $ 38.900 en ${viewport.alias}`, {
    tag: ['@flow:pos-orders-review', '@flow:pos-order-create', '@outcome:display', '@outcome:success', `@viewport:${viewport.alias}`],
  }, async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
    const order = await createPendingCheckout(page, viewport.alias)

    await page.getByRole('link', { name: 'Pedidos', exact: true }).click()
    await expect(page).toHaveURL(/\/pedidos$/)
    const orderCard = page.getByRole('article', { name: `Cuenta ${order.number}`, exact: true })
    await expect(orderCard).toContainText(order.customerName)
    await expect(orderCard).toContainText('$ 38.900')
    const cards = page.getByRole('article', { name: /^Cuenta / })
    const initialCount = await cards.count()

    await page.setViewportSize(viewport)
    await expectNoHorizontalDocumentOverflow(page)
    const search = page.getByRole('textbox', { name: 'Buscar por número o cliente', exact: true })
    const searchGeometry = await expectReachable<HTMLInputElement>(search, 'el buscador de Pedidos')
    expect(searchGeometry.width).toBeGreaterThanOrEqual(44)
    expect(searchGeometry.height).toBeGreaterThanOrEqual(44)
    if (viewport.alias === 'compact') expect(searchGeometry.fontSize).toBeGreaterThanOrEqual(16)

    await search.fill(order.number)
    await expect(cards).toHaveCount(1)
    await expect(orderCard).toContainText(order.customerName)
    await expect(orderCard).toContainText('$ 38.900')
    await search.fill(order.customerName)
    await expect(cards).toHaveCount(1)
    await expect(orderCard).toContainText(order.number)
    await expect(orderCard).toContainText('$ 38.900')

    const pending = page.getByRole('button', { name: 'Sin enviar 1', exact: true })
    const pendingGeometry = await expectReachable(pending, 'el filtro Sin enviar')
    expect(pendingGeometry.width).toBeGreaterThanOrEqual(44)
    expect(pendingGeometry.height).toBeGreaterThanOrEqual(44)
    await pending.click()
    await expect(pending).toHaveAttribute('aria-pressed', 'true')
    await expect(cards).toHaveCount(1)
    await expect(orderCard).toContainText('$ 38.900')
    await expect(page.getByText(`1 de ${initialCount} pedidos`, { exact: true })).toBeVisible()

    const clear = page.getByRole('button', { name: 'Limpiar filtros', exact: true })
    const clearGeometry = await expectReachable(clear, 'Limpiar filtros')
    expect(clearGeometry.width).toBeGreaterThanOrEqual(44)
    expect(clearGeometry.height).toBeGreaterThanOrEqual(44)
    await clear.click()
    await expect(search).toHaveValue('')
    await expect(cards).toHaveCount(initialCount)
    await expect(orderCard).toContainText(order.customerName)
    await expect(page.getByRole('button', { name: `Todos ${initialCount}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`${initialCount} de ${initialCount} pedidos`, { exact: true })).toBeVisible()
    await expectNoHorizontalDocumentOverflow(page)

    const create = page.getByRole('link', { name: 'Crear pedido', exact: true })
    const createGeometry = await expectReachable(create, 'Crear pedido')
    expect(createGeometry.width).toBeGreaterThanOrEqual(44)
    expect(createGeometry.height).toBeGreaterThanOrEqual(44)
    await create.click()
    await expect(page).toHaveURL(/\/pedidos\/nuevo$/)
    const destination = page.getByRole('dialog', { name: 'Crear pedido', exact: true })
    await expect(destination).toContainText('¿Dónde se atenderá este pedido?')
    await expect(destination.getByRole('button', { name: 'Seleccionar una mesa', exact: true })).toBeEnabled()
    await expect(destination.getByRole('button', { name: 'Para llevar o domicilio', exact: true })).toBeEnabled()
  })
}

const TAXED_PRODUCT = 'Plato gravado QA r3'
type TaxedOrder = { id: number; number: string; customer_name: string; subtotal: number; tax: number; total: number; state: string; paid: number; change: number }

async function expectTaxedAmounts(scope: Page | Locator) {
  await expect(scope.getByText('Subtotal', { exact: true }).locator('..')).toContainText('$ 10.000')
  await expect(scope.getByText('$ 1.900', { exact: true })).toBeVisible()
  await expect(scope.getByText('Total a pagar', { exact: true }).locator('..')).toContainText('$ 11.900')
}

async function prepareTaxedCart(page: Page, customer: string, inTable = false) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Crear pedido', exact: true }).click()
  const destination = page.getByRole('dialog', { name: 'Crear pedido', exact: true })
  if (inTable) {
    await destination.getByRole('button', { name: 'Seleccionar una mesa', exact: true }).click()
    await page.getByRole('tab', { name: 'Salón QA r3', exact: true }).click()
    await page.getByRole('button', { name: /^Mesa 931\b/ }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  } else {
    await destination.getByRole('button', { name: 'Para llevar o domicilio', exact: true }).click()
    await page.getByRole('radio', { name: 'Para llevar', exact: true }).click()
  }
  await page.getByRole('textbox', { name: 'Nombre del cliente', exact: true }).fill(customer)
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  const menu = page.getByRole('region', { name: 'Lista del menú', exact: true })
  await menu.getByRole('textbox', { name: 'Buscar plato', exact: true }).fill(TAXED_PRODUCT)
  await menu.getByRole('listitem').filter({ hasText: TAXED_PRODUCT }).getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Agregar plato', exact: true }).getByRole('button', { name: 'Agregar al carrito', exact: true }).click()
  await expectTaxedAmounts(page.getByRole('region', { name: 'Detalle del pedido', exact: true }))
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expectTaxedAmounts(page)
}

// Falla si el asistente confirma 14.161 por un plato de 11.900, o si una ronda vuelve a añadir el IVA al precio final.
test('el asistente y la ronda conservan el precio final de $ 11.900', {
  tag: ['@flow:pos-order-create', '@flow:pos-order-add-round', '@outcome:success', '@outcome:display'],
}, async ({ page }) => {
  const customer = `Importes QA r3 ${crypto.randomUUID()}`
  await prepareTaxedCart(page, customer, true)
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/pos/v1/orders')),
    page.getByRole('button', { name: 'Crear pedido y enviar a cocina', exact: true }).click(),
  ])
  expect(response.status()).toBe(201)
  const { order } = await response.json() as { order: TaxedOrder }
  expect({ subtotal: order.subtotal, tax: order.tax, total: order.total }).toEqual({ subtotal: 10000, tax: 1900, total: 11900 })
  await expect(page).toHaveURL(/\/pedidos$/)
  const account = page.getByRole('article', { name: `Cuenta ${order.number}`, exact: true })
  await expect(account).toContainText(customer)
  await expect(account).toContainText('$ 11.900')
  await page.getByRole('link', { name: 'Mesas', exact: true }).click()
  await page.getByRole('combobox', { name: 'Cambiar de piso', exact: true }).selectOption({ label: 'Salón QA r3' })
  await page.getByRole('button', { name: /^Mesa 931:/ }).click()
  await page.getByRole('toolbar', { name: 'Mesa seleccionada:', exact: true }).getByRole('button', { name: 'Detalle de mesa', exact: true }).click()
  await page.getByRole('dialog', { name: 'Detalle de mesa · 931', exact: true }).getByRole('button', { name: 'Nuevo pedido', exact: true }).click()
  const round = page.getByRole('dialog', { name: 'Agregar del menú', exact: true })
  await round.getByRole('textbox', { name: 'Buscar plato', exact: true }).fill(TAXED_PRODUCT)
  await round.getByRole('article', { name: TAXED_PRODUCT, exact: true }).getByRole('button', { name: 'Agregar', exact: true }).click()
  await expectTaxedAmounts(round.getByRole('complementary', { name: 'Nueva ronda', exact: true }))
  await round.getByRole('button', { name: 'Guardar y enviar a cocina', exact: true }).click()
  await expect(page).toHaveURL(/\/salon$/)
  const after = await qaApi<{ order: TaxedOrder }>(page, `orders/${order.id}`)
  expect({ subtotal: after.order.subtotal, tax: after.order.tax, total: after.order.total }).toEqual({ subtotal: 20000, tax: 3800, total: 23800 })
})

// Falla si al cortar la red se registra o cobra el plato por 14.161, cambia el vuelto de 8.100 o se sincroniza otro importe.
test('el cobro en emergencia conserva $ 11.900 y cambio de $ 8.100', {
  tag: ['@flow:pos-emergency-order', '@outcome:success', '@outcome:display'],
}, async ({ page, context }) => {
  const customer = `Emergencia gravada QA r3 ${crypto.randomUUID()}`
  await prepareTaxedCart(page, customer)
  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Continuar al pago', exact: true }).click()
    const payment = page.getByRole('dialog', { name: 'Cobrar sin conexión', exact: true })
    await expect(payment).toContainText('$ 11.900')
    await payment.getByRole('textbox', { name: 'Efectivo recibido', exact: true }).fill('20000')
    await expect(payment.getByText('Cambio: $ 8.100', { exact: true })).toBeVisible()
    await payment.getByRole('button', { name: 'Registrar pago', exact: true }).click()
    await expect(payment).toHaveCount(0)
    await expect(page.getByText('Pedido guardado sin conexión', { exact: true })).toBeVisible()
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith('/api/pos/v1/orders') && response.request().postDataJSON().customer_name === customer),
      context.setOffline(false),
    ])
    const { order: synced } = await response.json() as { order: TaxedOrder }
    await expect.poll(async () => {
      const { order } = await qaApi<{ order: TaxedOrder }>(page, `orders/${synced.id}`)
      return { total: order.total, tax: order.tax, state: order.state, paid: order.paid, change: order.change }
    }).toEqual({ total: 11900, tax: 1900, state: 'paid', paid: 11900, change: 8100 })
  } finally {
    await context.setOffline(false)
  }
})
