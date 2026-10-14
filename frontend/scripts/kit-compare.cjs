// Captura rutas del POS a 1194×834 (iPad Pro 11 apaisado, el marco del kit) para cotejarlas con docs/diseno/pos-kit/pantallas.
// Uso: npm run kit:compare -- /kit /salon   (requiere `next dev` en PLAYWRIGHT_BASE_URL o http://localhost:3000 y el sistema propio con datos de prueba)
// Modo oscuro: KIT_THEME=dark npm run kit:compare -- /salon  → salon-dark.png (fija waiter.theme antes de entrar).
const { chromium, devices } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const routes = process.argv.slice(2)
  if (routes.length === 0) { console.error('Indica al menos una ruta, por ejemplo: npm run kit:compare -- /kit'); process.exit(1) }
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
  const theme = process.env.KIT_THEME || 'light'
  const out = process.env.KIT_OUT || path.join(__dirname, '..', 'kit-compare'); fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
  const page = await context.newPage()
  await page.addInitScript((mode) => { try { localStorage.setItem('waiter.theme', mode) } catch { /* sin almacenamiento */ } }, theme)
  await page.goto(`${base}/login`)
  await page.getByLabel('Correo').fill('admin'); await page.getByLabel('Contraseña').fill('admin')
  await page.getByRole('button', { name: 'Entrar' }).click()
  // "Inicio de empleado" (pos_hr): el empleado demo "Sofía Mesera" con PIN 123456.
  await page.getByRole('button', { name: 'Empleado' }).click()
  await page.getByRole('option', { name: /Sofía Mesera/ }).click()
  for (const d of '123456') await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar turno' }).click()
  await page.waitForURL('**/salon')
  for (const spec of routes) {
    const [route, action] = spec.split('#click=')
    await page.goto(`${base}${route}`); await page.waitForLoadState('networkidle')
    // La pantalla se pinta cuando el catálogo llega por RPC: sin esto la captura sale en blanco.
    await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 30_000 }).catch(() => undefined)
    const file = path.join(out, `${route.replace(/\//g, '_').replace(/^_/, '') || 'root'}${theme === 'dark' ? '-dark' : ''}.png`)
    await page.screenshot({ path: file }); console.log('captura', file)
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
