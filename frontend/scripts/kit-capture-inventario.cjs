// Capturas de 12 – Inventory a 1194×834 (el marco del kit) para cotejarlas con
// docs/diseno/pos-kit/pantallas/Visual Design Light/12 – Inventory/*.
// Uso: PLAYWRIGHT_BASE_URL=http://192.168.56.10:3015 node scripts/kit-capture-inventario.cjs [dark]
// Recorre las pantallas del kit: Menu List (Home, Detail Menu, Add New Dish 1 y 2), Ingredients (Home,
// More Option, Add New Ingredients Default y Filled, Request con su toast) y la pestaña Solicitudes.
const { chromium, devices } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const theme = process.argv[2] === 'dark' ? 'dark' : 'light'
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
  const out = path.join(__dirname, '..', 'kit-compare', 'inventario'); fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
  await context.addInitScript((mode) => { localStorage.setItem('waiter.theme', mode) }, theme)
  const page = await context.newPage()
  page.setDefaultTimeout(60_000); page.setDefaultNavigationTimeout(120_000)
  const shot = async (name) => {
    const file = path.join(out, `${name}-${theme}.png`)
    await page.screenshot({ path: file }); console.log('captura', file)
  }

  await page.goto(`${base}/login`)
  await page.getByLabel('Correo').fill('admin'); await page.getByLabel('Contraseña').fill('admin')
  await page.getByRole('button', { name: 'Abrir mi turno' }).click()
  await page.waitForURL('**/salon')
  await page.goto(`${base}/inventario`)
  await page.getByRole('heading', { name: 'Lista del menú' }).waitFor()
  await page.getByRole('button', { name: /Ver detalle de/ }).first().waitFor()
  await shot('menu-home')

  await page.getByRole('button', { name: 'Ver detalle de Hamburguesa Clásica' }).click()
  await page.getByRole('dialog', { name: 'Detalle del plato' }).getByRole('listitem').first().waitFor()
  await shot('menu-detalle')
  await page.getByRole('dialog', { name: 'Detalle del plato' }).getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Agregar plato' }).click()
  await shot('menu-agregar-plato-1')
  const dish = page.getByRole('dialog', { name: 'Agregar plato' })
  await dish.getByPlaceholder('Escribe el nombre del plato').fill('Bowl de prueba')
  await dish.getByRole('button', { name: 'Platos' }).click()
  await dish.getByLabel('Precio').fill('30000')
  await dish.getByRole('button', { name: 'Guardar y continuar' }).click()
  await shot('menu-agregar-plato-2')
  await dish.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('tab', { name: 'Ingredientes' }).click()
  await page.getByRole('listitem').first().waitFor()
  await shot('ingredientes-home')

  await page.getByRole('button', { name: 'Más opciones de Queso cheddar' }).click()
  await shot('ingredientes-menu-opciones')
  await page.keyboard.press('Escape'); await page.mouse.click(600, 100)

  await page.getByRole('button', { name: 'Agregar ingrediente' }).click()
  const wizard = page.getByRole('dialog', { name: 'Agregar ingrediente' })
  await shot('ingredientes-agregar-1')
  await wizard.getByPlaceholder('Escribe el nombre del ingrediente').fill('Cilantro')
  await wizard.getByRole('button', { name: /Frutas y verduras/ }).click()
  await wizard.getByPlaceholder('Cantidad en stock').fill('3')
  await wizard.getByRole('button', { name: 'Manojo' }).click()
  await wizard.getByRole('button', { name: 'Guardar y continuar' }).click()
  await shot('ingredientes-agregar-2')
  await wizard.getByRole('button', { name: 'Cerrar' }).click()

  // "Request": el addon no duplica la solicitud, así que la captura se puede repetir sin ensuciar la base.
  await page.getByRole('button', { name: 'Más opciones de Salmón fresco' }).click()
  await page.getByRole('menuitem', { name: 'Solicitar ingrediente' }).click()
  await page.getByRole('status').filter({ hasText: '¡Solicitud enviada!' }).waitFor()
  await shot('ingredientes-solicitud-enviada')

  await page.getByRole('tab', { name: 'Solicitudes' }).click()
  await page.getByRole('listitem').first().waitFor()
  await shot('solicitudes')

  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
