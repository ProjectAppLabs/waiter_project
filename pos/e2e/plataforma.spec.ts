import { USERS, expect, signIn, test } from './helpers/waiter'

// Falla si la consola de ProjectApp no lista sus clientes o si Métricas y Cobros no cargan (planes T0 y M).
test('ProjectApp ve clientes, métricas y cobros', async ({ page }) => {
  await signIn(page, USERS.platform, '/plataforma/login')
  await page.waitForURL(/\/plataforma$/)
  const clients = page.getByRole('table', { name: 'Clientes' })
  await expect(clients).toContainText('Burger House')
  await page.getByRole('link', { name: 'Métricas' }).click()
  await expect(page.getByRole('table', { name: 'Métricas por cliente' })).toContainText('Burger House')
  await expect(page.getByRole('list', { name: 'Totales' })).toContainText('Ingreso mensual')
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('heading', { name: 'Cobros' })).toBeVisible()
})
