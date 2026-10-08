import { expect } from '@playwright/test'

import { createPendingCheckout, expectNoHorizontalDocumentOverflow, expectReachable } from '../helpers/ronda'
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
