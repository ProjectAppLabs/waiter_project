import { expect, type Page } from '@playwright/test'

import { expectNoHorizontalDocumentOverflow, expectReachable, qaApi } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

type Restaurant = { id: string; name: string }
type Product = { id: number; name: string }

// La comanda se prepara por la API de la cuenta aislada (pedido para llevar enviado a cocina); llegar a Cocina, leerla e
// iniciarla ocurre en la UI. Devuelve la nota de cocina, única por caso: el número «TA-…» se reinicia cada día y una
// caja abierta de un día para otro puede mostrar dos comandas con el mismo.
async function kitchenTicket(page: Page, alias: string): Promise<string> {
  const { restaurants } = await qaApi<{ restaurants: Restaurant[] }>(page, 'auth/me')
  const restaurantId = Number(restaurants.filter((r) => r.name === 'Local QA')[0].id)
  const { products } = await qaApi<{ products: Product[] }>(page, `catalog?restaurant_id=${restaurantId}`)
  const productId = products.filter((p) => p.name === 'Hamburguesa QA')[0].id
  const note = `Cocina QA ${alias} ${Date.now()}`
  await qaApi(page, 'orders', { method: 'POST', data: { restaurant_id: restaurantId, uuid: crypto.randomUUID(), service: 'takeout',
    note, fire: true, lines: [{ uuid: crypto.randomUUID(), product_id: productId, qty: 1 }] } })
  return note
}

// Tableta vertical (835) y celular (412): los dos primeros anchos de la ronda, donde la rejilla de 3 columnas y el panel
// «Listos por entregar» de 340 px dejaban la comanda en 132 px y 12 px.
for (const viewport of RONDA_VIEWPORTS.slice(0, 2)) {
  test.describe(`Cocina @ ${viewport.width} (${viewport.alias})`, { tag: ['@flow:pos-kitchen-tickets', `@viewport:${viewport.alias}`] }, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true })

    // Falla si a ${viewport.width} px la comanda vuelve a recortar el cronómetro o «Iniciar preparación» (47 de 159 px
    // a 835; invisible a 412), si iniciarla deja de pasar el botón a «Listo todo» o si Cocina desborda el documento.
    test(`la comanda se lee y se inicia desde Cocina en ${viewport.alias}`, { tag: ['@outcome:success'] }, async ({ page }) => {
      await page.goto('/dashboard')
      const note = await kitchenTicket(page, viewport.alias)
      await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('link', { name: 'Cocina', exact: true }).click()
      await expect(page).toHaveURL(/\/kds$/)
      const ticket = page.getByRole('article', { name: /^Para llevar / }).filter({ hasText: note })
      await expectReachable(ticket.getByText(/^\d+:\d{2}$/), 'el cronómetro de la comanda')
      const start = ticket.getByRole('button', { name: 'Iniciar preparación', exact: true })
      await expectReachable(start, 'Iniciar preparación')
      await start.click()
      await expect(ticket.getByRole('button', { name: 'Listo todo', exact: true })).toHaveText('Listo todo')
      await expectNoHorizontalDocumentOverflow(page)
    })
  })
}
