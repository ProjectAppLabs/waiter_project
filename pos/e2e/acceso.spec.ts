import { BURGER, USERS, api, expect, signIn, test } from './helpers/waiter'

// Falla si el dueño no llega a su consola o la consola no trae los datos migrados de Burger House (plan T6).
test('el dueño entra a la consola de su organización', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL('**/organizacion')
  const nav = page.getByRole('navigation', { name: 'Consola de la organización' })
  await expect(nav).toContainText('Burger House')
  for (const section of ['Resumen', 'Ventas', 'Cuadres de caja', 'Rentabilidad', 'Facturación', 'Clientes', 'Promociones', 'Restaurantes', 'Catálogo', 'Equipo']) {
    await expect(nav.getByRole('link', { name: section })).toBeVisible()
  }
})

// Falla si una contraseña equivocada dice si el usuario existe, o si el inicio ofrece otra cosa que «¿Olvidaste tu
// contraseña?» (plan P).
test('credenciales incorrectas y recuperación', async ({ page }) => {
  await signIn(page, { login: USERS.waiter.login, password: 'equivocada-123' })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /Olvidaste tu contraseña/ })).toBeVisible()
  await expect(page.getByText('Tengo un código')).toHaveCount(0)
})

// Falla si la mesera, con la caja cerrada, puede abrir el salón escribiendo la dirección: debe quedar en /caja.
test('sin caja abierta la mesera no pasa de la caja', async ({ page, browser }) => {
  // La encargada cierra la caja si está abierta (cobra lo pendiente y cuadra exacto).
  const manager = await (await browser.newContext()).newPage()
  await signIn(manager, USERS.manager)
  await manager.waitForURL(/dashboard|caja|salon/)
  const rid = Number((await api<{ restaurants: { id: string }[] }>(manager, 'auth/me')).restaurants[0].id)
  const shift = (await api<{ shift: { id: number } | null }>(manager, `shifts/open?restaurant_id=${rid}`)).shift
  if (shift) {
    const { settleOpenOrders } = await import('./helpers/waiter')
    await settleOpenOrders(manager, rid)
    const closing = await api<{ expected_cash: number }>(manager, `shifts/${shift.id}/closing`)
    await api(manager, `shifts/${shift.id}/close`, { method: 'POST', data: { counted_cash: closing.expected_cash, notes: '' } })
  }
  await manager.context().close()
  await signIn(page, USERS.waiter)
  await page.waitForURL('**/caja')
  await page.goto('/salon')
  await page.waitForURL('**/caja')
  await expect(page.getByRole('button', { name: 'Abrir caja' })).toBeVisible()
  await expect(page.getByText('Entrar a administración sin abrir caja')).toHaveCount(0)
  void BURGER
})
