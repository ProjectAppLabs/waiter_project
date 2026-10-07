// qa: draft-unvalidated (2026-10-07 — pendiente primera ejecución viva)
import { expect, test } from '@playwright/test'

import { createPendingCheckout, expectNoHorizontalDocumentOverflow, expectReachable, orderById, signInAsQaOperator } from '../helpers/ronda'
import { RONDA_VIEWPORTS } from '../helpers/viewports'

for (const viewport of RONDA_VIEWPORTS) {
  // Falla si el diálogo de cobro vuelve a ocultar métodos o acciones a ${viewport.width} px, o registra un importe/cambio distinto.
  test(`cobro en efectivo conserva $ 38.900 en ${viewport.alias}`, {
    tag: ['@flow:pos-payment-checkout', '@outcome:success', `@viewport:${viewport.alias}`],
  }, async ({ page }) => {
    await signInAsQaOperator(page)
    await page.setViewportSize(viewport)
    const order = await createPendingCheckout(page, viewport.alias)

    const ordersLink = page.getByRole('link', { name: 'Pedidos', exact: true })
    await expectReachable(ordersLink, 'el enlace Pedidos')
    await ordersLink.click()
    await expect(page).toHaveURL(/\/pedidos$/)

    const orderCard = page.getByRole('article', { name: `Cuenta ${order.number}`, exact: true })
    await expect(orderCard).toContainText('$ 38.900')
    const charge = orderCard.getByRole('link', { name: 'Cobrar', exact: true })
    await expectReachable(charge, 'la acción Cobrar')
    await charge.click()

    const payment = page.getByRole('dialog', { name: 'Pago', exact: true })
    await expect(payment).toContainText('$ 38.900')
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
    await done.click()
    await expect(page).toHaveURL(/\/pedidos$/)

    const after = await orderById(page, order.id)
    expect(after.order.state).toBe('paid')
    expect(after.order.total).toBe(38_900)
    await expectNoHorizontalDocumentOverflow(page)
  })
}
