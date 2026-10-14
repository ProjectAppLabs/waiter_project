import { USERS, expect, signIn, test } from './helpers/waiter'

// Falla si el catálogo migrado no aparece en la consola o si una categoría nueva no queda lista para los platos.
test('catálogo: platos migrados y categoría nueva', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL('**/organizacion')
  await page.goto('/organizacion/catalogo')
  await expect(page.getByRole('row', { name: /Hamburguesa Angus/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: 'Categorías' }).click()
  await page.getByRole('button', { name: 'Editar categorías' }).click()
  const panel = page.getByRole('dialog', { name: 'Categorías' })
  const name = `Prueba e2e ${Date.now()}`
  const fresh = panel.getByRole('region', { name: 'Nueva categoría' })
  await fresh.getByLabel('Nueva categoría').fill(name)
  await fresh.getByRole('button', { name: 'Guardar' }).click()
  await expect(panel.getByRole('region', { name })).toBeVisible()
})

// Falla si el equipo migrado no se ve agrupado por restaurante o si faltan las cuentas de prueba.
test('equipo migrado por restaurante', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL('**/organizacion')
  await page.goto('/organizacion/equipo')
  const table = page.getByRole('table', { name: 'Personas' })
  for (const person of ['Laura Encargada', 'Carlos Cajero', 'Sofía Mesera', 'Mateo Mesero']) await expect(table).toContainText(person)
})

// Falla si el resumen o la rentabilidad del dueño no cargan sobre el sistema propio (plan T4).
test('resumen y rentabilidad cargan', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL('**/organizacion')
  await expect(page.getByRole('heading', { name: /Resumen/ })).toBeVisible({ timeout: 30_000 })
  await page.goto('/organizacion/rentabilidad')
  await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 })
})

// Falla si Configuración del POS deja de listar al equipo del restaurante desde el sistema propio.
test('el encargado ve su equipo en Configuración', async ({ page }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Usuarios y permisos' }).click()
  const section = page.getByRole('region', { name: 'Usuarios y permisos' })
  for (const person of ['Carlos Cajero', 'Sofía Mesera']) await expect(section).toContainText(person, { timeout: 30_000 })
})
