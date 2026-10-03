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

// Falla si un mesero en su turno, con la caja cerrada, puede abrir el salón escribiendo la dirección: debe quedar en
// /caja.
test('sin caja abierta la mesera no pasa de la caja', async ({ page, browser }) => {
  // El POS solo deja entrar a meseros en su turno (Sofía 08–16 en Poblado, Mateo 18–23 en Laureles): la dueña elige
  // al que esté en turno ahora y cierra la caja de su restaurante si está abierta (cobra lo pendiente y cuadra exacto).
  const owner = await (await browser.newContext()).newPage()
  await signIn(owner, USERS.owner)
  await owner.waitForURL('**/organizacion')
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }))
  type Person = { username: string; role: string; restaurant_ids: string[]; shift: { from: number; to: number } | null }
  const people = (await api<{ people: Person[] }>(owner, 'team')).people
  const onShift = people.find((p) => ['sofia.mesera', 'mateo.mesero'].includes(p.username) && p.shift && p.shift.from <= hour && hour < p.shift.to)
  if (onShift) {
    const rid = Number(onShift.restaurant_ids[0])
    const shift = (await api<{ shift: { id: number } | null }>(owner, `shifts/open?restaurant_id=${rid}`)).shift
    if (shift) {
      const { settleOpenOrders } = await import('./helpers/waiter')
      await settleOpenOrders(owner, rid)
      const closing = await api<{ expected_cash: number }>(owner, `shifts/${shift.id}/closing`)
      await api(owner, `shifts/${shift.id}/close`, { method: 'POST', data: { counted_cash: closing.expected_cash, notes: '' } })
    }
  }
  await owner.context().close()
  test.skip(!onShift, `Ningún mesero de prueba tiene turno a las ${hour}:00`)
  await signIn(page, { login: onShift!.username, password: USERS.waiter.password })
  await page.waitForURL('**/caja')
  await page.goto('/salon')
  await page.waitForURL('**/caja')
  await expect(page.getByRole('button', { name: 'Abrir caja' })).toBeVisible()
  await expect(page.getByText('Entrar a administración sin abrir caja')).toHaveCount(0)
  void BURGER
})
