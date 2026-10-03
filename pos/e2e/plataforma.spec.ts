import { USERS, expect, signIn, signInPlatform, test } from './helpers/waiter'

// Falla si la persona de ProjectApp no entra por el inicio único, o si la consola no lista sus clientes o si Métricas y Cobros no cargan (planes T0 y M).
test('ProjectApp ve clientes, métricas y cobros', async ({ page }) => {
  await signInPlatform(page)
  const clients = page.getByRole('table', { name: 'Clientes' })
  await expect(clients).toContainText('Burger House')
  await page.getByRole('link', { name: 'Métricas' }).click()
  await expect(page.getByRole('table', { name: 'Métricas por cliente' })).toContainText('Burger House')
  await expect(page.getByRole('list', { name: 'Totales' })).toContainText('Ingreso mensual')
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('heading', { name: 'Cobros' })).toBeVisible()
})

// Falla si los enlaces viejos a la entrada de ProjectApp dejan de llevar al inicio único o pierden el código de la
// invitación.
test('la dirección vieja de ProjectApp lleva al inicio único', async ({ page }) => {
  await page.goto('/plataforma/login?codigo=ana.projectapp')
  await page.waitForURL('**/login?codigo=ana.projectapp')
  await expect(page.getByText(/ana\.projectapp/).first()).toBeVisible()
})

// Falla si la lista de precios estándar no carga con el precio por local, el plan Inicial de WhatsApp y sus paquetes
// de recarga, o si la ficha del cliente no muestra sus precios (plan X).
test('Precios y precios del cliente', async ({ page }) => {
  await signInPlatform(page)
  await page.getByRole('link', { name: 'Precios' }).click()
  await expect(page.getByLabel('Precio por local al mes ($)')).toHaveValue(/\d+/)
  await expect(page.getByRole('region', { name: 'Planes del asistente de WhatsApp' }).getByLabel('Nombre del plan').first()).toHaveValue('Inicial')
  await expect(page.getByRole('region', { name: 'Paquetes de recarga' }).getByLabel('Nombre del paquete').first()).toHaveValue(/pedidos/)
  await page.goto('/plataforma/clientes/frisby-74312')
  await expect(page.getByText('Personalizados')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recargas' })).toBeVisible()
})
