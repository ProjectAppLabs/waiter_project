import { expect, test } from '@playwright/test'

const TABLE = '/burger-house/poblado/t/Z2XUVG/'

// Falla si el comensal no puede buscar, agregar con nota, enviar a cocina o pedir la cuenta desde la mesa.
// @flow: diner-orders-from-table  @outcome: success
test('a diner at the table browses, orders with a note, sends to the kitchen and asks for the bill', async ({ page }) => {
  const note = `sin hielo ${Date.now()}`
  await page.goto(TABLE)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Buen/)
  await expect(page.getByText('Mesa 9')).toBeVisible()
  await page.getByRole('button', { name: 'Ver la carta' }).click()
  // Las plantillas fieles (B1 por defecto) pliegan el buscador tras un botón; el genérico lo muestra abierto.
  const search = page.locator('input[type="search"], input[aria-label*="Buscar"]').first()
  if (!(await search.isVisible().catch(() => false))) await page.getByRole('button', { name: /buscar/i }).first().click()
  await search.fill('limon')
  await expect(page.getByText('Hamburguesa Angus')).toHaveCount(0)
  await page.getByText('Limonada de Coco').first().click()
  await page.getByRole('button', { name: 'Más' }).click()
  await page.getByLabel(/Nota para la cocina/).fill(note)
  await page.getByRole('button', { name: /^Agregar · / }).click()
  await page.getByRole('link', { name: /Tu pedido|Ver pedido|Ver el pedido/ }).first().click()
  await expect(page.getByText(note)).toBeVisible()
  const confirmed = page.waitForResponse((r) => r.url().endsWith('/confirmar/') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /^Enviar a cocina/ }).click()
  expect((await confirmed).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Recibido|En cocina/)
  await page.getByRole('button', { name: 'Pedir la cuenta' }).click()
  await expect(page.getByRole('status')).toHaveText(/trae la cuenta/)
  await expect(page.getByText(/^\$ \d/).first()).toBeVisible()
})
