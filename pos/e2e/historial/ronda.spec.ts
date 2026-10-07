// qa: draft-unvalidated (2026-10-07 — pendiente primera ejecución viva)
import { expect, test } from '@playwright/test'

import { createPaidHistory, expectNoHorizontalDocumentOverflow, expectReachable, signInAsQaOperator } from '../helpers/ronda'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

for (const viewport of RONDA_VIEWPORTS) {
  // Falla si Historial vuelve a recortar la búsqueda, la cuenta o Devolver a ${viewport.width} px y deja inaccesible una devolución de $ 38.900.
  test(`historial deja abrir devolución de $ 38.900 en ${viewport.alias}`, {
    tag: ['@flow:pos-history-review', '@flow:pos-history-refund', '@outcome:display', `@viewport:${viewport.alias}`],
  }, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signInAsQaOperator(page)
    const order = await createPaidHistory(page, viewport.alias)

    const historyLink = page.getByRole('link', { name: 'Historial', exact: true })
    await expectReachable(historyLink, 'el enlace Historial')
    await historyLink.click()
    await expect(page).toHaveURL(/\/historial$/)

    const search = page.getByRole('textbox', { name: 'Buscar por número o cliente', exact: true })
    await expectReachable(search, 'el buscador de Historial')
    await search.fill(order.customerName)
    const row = page.getByRole('button', { name: `Pedido# ${order.number}`, exact: true })
    await expect(row).toContainText('$ 38.900')
    await expectReachable(row, 'la fila del pedido pagado')
    await row.click()

    const bill = page.getByRole('complementary', { name: 'Información de la cuenta', exact: true })
    await expect(bill).toContainText(order.customerName)
    await expect(bill).toContainText('$ 38.900')
    await expectReachable(bill, 'la cuenta seleccionada')
    const refund = bill.getByRole('button', { name: 'Devolver', exact: true })
    await expectReachable(refund, 'Devolver')
    await refund.click()

    const dialog = page.getByRole('dialog', { name: `Devolver pedido ${order.number}`, exact: true })
    await expect(dialog).toContainText('Devolver todo')
    const refundAll = dialog.getByRole('button', { name: 'Devolver todo', exact: true })
    await expectReachable(refundAll, 'Devolver todo')
    await refundAll.click()
    const confirm = dialog.getByRole('button', { name: 'Devolver $ 38.900', exact: true })
    await expectReachable(confirm, 'el total de devolución seleccionado')
    await expect(confirm).toBeDisabled()
    await expectNoHorizontalDocumentOverflow(page)
  })
}
