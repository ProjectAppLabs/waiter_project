import { expect } from '@playwright/test'

import { signInAsQaOperator } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'

// El estado del worker es propio: cada cierre consume su sesión real sin invalidar la de los otros recorridos.
test.use({ qaPosStorageState: { cookies: [], origins: [] } })

for (const serverDuringLogout of [true, false]) {
  // Falla si salir permite recuperar la identidad al recargar sin servidor, incluso cuando el cierre remoto falló.
  test(`cerrar sesión ${serverDuringLogout ? 'con servidor' : 'sin servidor'} impide recuperarla offline`, {
    tag: ['@flow:pos-login-logout', serverDuringLogout ? '@outcome:success' : '@outcome:failure'],
  }, async ({ page, context }) => {
    await signInAsQaOperator(page)
    const identity = page.getByRole('button', { name: /^Operador QA \/ / })
    await expect(identity).toBeVisible()
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) =>
      key.startsWith('waiter.cache:qa-x0:') && key.endsWith(':auth/me')))).toBe(true)

    const disconnectServer = () => context.route('**/experience/api/**', (route) => route.abort('failed'))
    if (!serverDuringLogout) {
      // El documento sigue servido por Next: sólo se corta Django, como durante una caída real del servidor.
      await disconnectServer()
      await page.reload()
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(identity).toBeVisible()
    }

    await identity.click()
    const settings = page.getByRole('dialog', { name: 'Ajustes', exact: true })
    await settings.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('button', { name: 'Sí, salir', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Usuario o correo', { exact: true })).toBeVisible()

    if (serverDuringLogout) await disconnectServer()
    await page.reload()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Usuario o correo', { exact: true })).toBeVisible()
    await expect(identity).toHaveCount(0)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
    await expect(identity).toHaveCount(0)
  })
}
