import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'

import { expectNoHorizontalDocumentOverflow, expectReachable } from '../helpers/ronda'
import { test as ownerTest } from '../helpers/rondaFixture'
import { RONDA_VIEWPORTS, type RondaViewport } from '../helpers/viewports'

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

// Sólo usa la cuenta sintética preparada por seed_ronda en la base aislada. El acceso real ocurre por la UI,
// a ancho de escritorio antes de crear los contextos de cada viewport; no modifica cuentas ni sesiones de producción.
const test = base.extend<{ storageState: StorageState }, { consolePlatformState: StorageState }>({
  consolePlatformState: [async ({ browser }, provide, workerInfo) => {
    const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL, viewport: { width: 1440, height: 900 } })
    let state: StorageState
    try {
      const page = await context.newPage()
      await page.goto('/login')
      const submit = page.getByRole('button', { name: 'Entrar', exact: true })
      await expect(async () => {
        await page.getByLabel('Usuario o correo', { exact: true }).fill('plataforma.r2.qa')
        await page.getByLabel('Contraseña', { exact: true }).fill('Waiter-R2-QA-2026!')
        await expect(submit).toBeEnabled({ timeout: 1_000 })
      }).toPass({ timeout: 60_000 })
      await submit.click()
      await expect(page).toHaveURL(/\/plataforma$/, { timeout: 60_000 })
      await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toHaveText('Clientes')
      state = await context.storageState()
    } finally { await context.close() }
    await provide(state)
  }, { scope: 'worker' }],
  storageState: async ({ consolePlatformState }, provide) => { await provide(consolePlatformState) },
})

async function openNavigation(page: Page, viewport: RondaViewport, name: string) {
  const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true })
  if (viewport.width < 1024) {
    const geometry = await expectReachable(trigger, 'Abrir menú')
    expect(geometry.width).toBeGreaterThanOrEqual(44)
    expect(geometry.height).toBeGreaterThanOrEqual(44)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const drawer = page.getByRole('dialog', { name, exact: true })
    await expect(drawer).toBeVisible()
    const close = drawer.getByRole('button', { name: 'Cerrar menú', exact: true })
    await expect(close).toBeFocused()
    // El menú retiene el foco al recorrer sus extremos en ambos sentidos, sin saltar a la barra del navegador.
    await close.press('Shift+Tab')
    const logout = drawer.getByRole('button', { name: 'Cerrar sesión', exact: true })
    await expect(logout).toBeFocused()
    await logout.press('Tab')
    await expect(close).toBeFocused()
    expect(await page.evaluate(() => document.hasFocus())).toBe(true)
    return drawer.getByRole('navigation', { name, exact: true })
  }
  await expect(trigger).toBeHidden()
  await expect(page.getByRole('dialog', { name, exact: true })).toBeHidden()
  return page.getByRole('navigation', { name, exact: true })
}

async function checkMobileClosing(page: Page, viewport: RondaViewport, name: string) {
  if (viewport.width >= 1024) return
  const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true })
  const drawer = page.getByRole('dialog', { name, exact: true })
  await drawer.getByRole('button', { name: 'Cerrar menú', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await drawer.getByRole('button', { name: 'Cerrar menú', exact: true }).press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  // Coordenada derivada del viewport y fuera del drawer (320 px): el tap cae en su backdrop nativo.
  await page.mouse.click(viewport.width - 16, viewport.height / 2)
  await expect(drawer).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await trigger.click()
}

for (const viewport of RONDA_VIEWPORTS) {
  ownerTest.describe(`Consola del dueño @viewport:${viewport.alias}`, () => {
    ownerTest.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 1440 })

    // Falla si el sidebar de 260 px vuelve a ocupar compact/portrait, si el drawer pierde sus salidas o si deja la navegación inaccesible (I-R-6ef846671bd6).
    ownerTest('el dueño navega hasta su restaurante y puede entrar al POS', {
      tag: ['@flow:organization-console-navigation', '@outcome:success', '@outcome:display'],
    }, async ({ page }) => {
      // quality: allow-duplicate (per-viewport contract: organization-console-navigation @ 412/835/1195/1440/2560)
      await page.goto('/organizacion')
      const name = 'Consola de la organización'
      const navigation = await openNavigation(page, viewport, name)
      await expect(navigation.getByRole('link', { name: 'Resumen', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(navigation.getByRole('link', { name: 'Equipo', exact: true })).toHaveAttribute('href', '/organizacion/equipo')
      await checkMobileClosing(page, viewport, name)
      const restaurants = navigation.getByRole('link', { name: 'Restaurantes', exact: true })
      await expectReachable(restaurants, 'Restaurantes')
      await restaurants.click()
      await expect(page).toHaveURL(/\/organizacion\/restaurantes$/)
      await expect(page.getByRole('heading', { name: 'Tus restaurantes', exact: true })).toHaveText('Tus restaurantes')
      if (viewport.width < 1024) await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toHaveAttribute('aria-expanded', 'false')
      const contentWidth = await page.getByTestId('organization-console-content').evaluate((element) => element.clientWidth)
      expect(contentWidth, 'el contenido recupera el espacio reservado por el sidebar').toBeGreaterThanOrEqual(viewport.alias === 'compact' ? 300 : 600)
      const local = page.getByRole('list', { name: 'Restaurantes', exact: true }).getByRole('listitem').filter({ hasText: 'Local QA' })
      await expect(local.getByRole('heading', { name: 'Local QA', exact: true })).toHaveText('Local QA')
      const enter = local.getByRole('button', { name: 'Entrar al POS', exact: true })
      await expectReachable(enter, 'Entrar al POS')
      await expectNoHorizontalDocumentOverflow(page)
      await enter.click()
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('button', { name: /^Operador QA \/ / })).toContainText('Operador QA')
    })
  })
}

for (const viewport of RONDA_VIEWPORTS) {
  test.describe(`Consola de ProjectApp @viewport:${viewport.alias}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 1440 })

    // Falla si ProjectApp pierde las secciones, el foco o los modos de cierre al navegar a Métricas en cualquiera de los cinco anchos (I-R-6ef846671bd6).
    test('la persona de ProjectApp abre Métricas y conserva los datos del cliente', {
      tag: ['@flow:platform-console-navigation', '@outcome:success', '@outcome:display'],
    }, async ({ page }) => {
      // quality: allow-duplicate (per-viewport contract: platform-console-navigation @ 412/835/1195/1440/2560)
      await page.goto('/plataforma')
      const name = 'Consola de ProjectApp'
      const navigation = await openNavigation(page, viewport, name)
      await expect(navigation.getByRole('link', { name: 'Clientes', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(navigation.getByRole('link', { name: 'Cobros', exact: true })).toHaveAttribute('href', '/plataforma/cobros')
      await expect(navigation.getByRole('link', { name: 'Seguridad', exact: true })).toHaveAttribute('href', '/plataforma/seguridad')
      await checkMobileClosing(page, viewport, name)
      const metrics = navigation.getByRole('link', { name: 'Métricas', exact: true })
      await expectReachable(metrics, 'Métricas')
      await metrics.click()
      await expect(page).toHaveURL(/\/plataforma\/metricas$/)
      await expect(page.getByRole('heading', { name: 'Métricas', exact: true })).toHaveText('Métricas')
      if (viewport.width < 1024) await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toHaveAttribute('aria-expanded', 'false')
      const contentWidth = await page.getByTestId('platform-console-content').evaluate((element) => element.clientWidth)
      expect(contentWidth, 'el contenido recupera el espacio reservado por el sidebar').toBeGreaterThanOrEqual(viewport.alias === 'compact' ? 300 : 600)
      await expect(page.getByRole('table', { name: 'Métricas por cliente', exact: true })).toContainText('Waiter QA x0')
      const currentPeriod = page.getByRole('group', { name: 'Periodo', exact: true }).getByRole('button', { name: 'Este mes', exact: true })
      await expectReachable(currentPeriod, 'Periodo Este mes')
      await expect(currentPeriod).toHaveAttribute('aria-pressed', 'true')
      await expectNoHorizontalDocumentOverflow(page)
    })
  })
}
