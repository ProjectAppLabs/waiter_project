import { expect } from '@playwright/test'

import { createPendingCheckout, expectNoHorizontalDocumentOverflow, expectReachable } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

// Tableta vertical (835) y celular (412): los dos primeros anchos de la ronda, donde el panel de alertas de 400 px
// dejaba la tabla del turno en 377 px y 2 px.
for (const viewport of RONDA_VIEWPORTS.slice(0, 2)) {
  test.describe(`Operación @ ${viewport.width} (${viewport.alias})`, { tag: ['@flow:pos-operations-shift', `@viewport:${viewport.alias}`] }, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true })

    // Falla si a ${viewport.width} px la tabla del turno vuelve a recortar Total y Estado (38.900 se leía «38.90») o a
    // dejar Mesa / mesero en 0 px, o si Operación desborda el documento.
    test(`la tabla del turno muestra mesa, total y estado del pedido pendiente en ${viewport.alias}`, { tag: ['@outcome:display'] }, async ({ page }) => {
      await page.goto('/dashboard')
      const order = await createPendingCheckout(page, viewport.alias)
      // Operación no tiene enlace en la interfaz: se abre por su dirección, como indica la guía de QA (E-10).
      await page.goto('/operacion')
      await page.getByRole('tab', { name: 'Pagos', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: `#${order.id}` })
      await expectReachable(row.getByRole('cell').nth(1), 'Mesa / mesero')
      await expect(row.getByRole('cell').nth(1)).toHaveText(/ · Operador QA$/)
      await expectReachable(row.getByText('38.900', { exact: true }), 'el total del pedido')
      await expectReachable(row.getByText('Pendiente', { exact: true }), 'el estado del pedido')
      await expectNoHorizontalDocumentOverflow(page)
    })
  })
}
