import { expect, type Locator, type Page } from '@playwright/test'

import { expectNoHorizontalDocumentOverflow, expectReachable, qaApi } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

// Cada caso crea su propio plato por la API de la cuenta aislada: agotarlo no toca «Hamburguesa QA», que usan Pago,
// Historial y Pedidos. Llegar a Inventario, leer la tarjeta y agotarla ocurre en la UI.
async function ownDish(page: Page, alias: string): Promise<string> {
  const name = `Plato inventario ${alias} ${Date.now()}`
  await qaApi(page, 'products', { method: 'POST', data: { kind: 'dish', name, price: 12000, category_ids: [], tax_ids: [], available_in_pos: true } })
  return name
}

// Si dos cajas se cruzan, lo de encima tapa lo de abajo: así se tapaban el nombre del plato y la insignia de la tarjeta.
async function overlap(a: Locator, b: Locator): Promise<boolean> {
  const [x, y] = [(await a.boundingBox())!, (await b.boundingBox())!]
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height
}

// La tarjeta cambia en todos los anchos, así que el contrato se comprueba en los cinco, tableta vertical primero.
for (const viewport of RONDA_VIEWPORTS) {
  test.describe(`Inventario @ ${viewport.width} (${viewport.alias})`, { tag: ['@flow:pos-inventory-dishes', `@viewport:${viewport.alias}`] }, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 1440 })

    // Falla si a ${viewport.width} px «Agotar aquí» vuelve a tapar el nombre del plato, el lápiz la insignia «Disponible»,
    // el panel de filtros de 352 px deja la lista sin ancho (12 px a 412) o Inventario desborda el documento.
    test(`el plato se lee y se agota desde Inventario en ${viewport.alias}`, { tag: ['@outcome:success'] }, async ({ page }) => {
      await page.goto('/dashboard')
      const name = await ownDish(page, viewport.alias)
      await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('link', { name: 'Inventario', exact: true }).click()
      const list = page.getByRole('region', { name: 'Lista del menú', exact: true })
      const title = list.getByText(name, { exact: true })
      const soldOut = list.getByRole('button', { name: `Marcar ${name} como agotado en este restaurante`, exact: true })
      await expectReachable(title, 'el nombre del plato')
      expect(await overlap(title, soldOut)).toBe(false)
      const badge = list.getByRole('button', { name: `Ver detalle de ${name}`, exact: true }).getByText('Disponible', { exact: true })
      expect(await overlap(badge, list.getByRole('button', { name: `Editar precio, foto y carta de ${name}`, exact: true }))).toBe(false)
      await soldOut.click()
      await expect(list.getByRole('button', { name: `Volver a ofrecer ${name} en este restaurante`, exact: true })).toHaveText('Volver a ofrecer')
      await expectNoHorizontalDocumentOverflow(page)
    })
  })
}
