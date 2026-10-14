// Capturas de las pantallas del kit que atiende la oleada de Pedidos (Dashboard, Pedidos, Agregar ronda, Historial)
// a 1194×834, en claro y en oscuro, para cotejarlas con docs/diseno/pos-kit/pantallas.
// Uso: PLAYWRIGHT_BASE_URL=http://192.168.56.10:3011 node scripts/kit-capture-pedidos.cjs
// Siembra un pedido en la mesa 7 con dos platos para que el Dashboard y Pedidos no salgan vacíos.
const { chromium, devices } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://192.168.56.10:3011'
const out = path.join(__dirname, '..', 'kit-compare')

async function login(page) {
  await page.goto(`${base}/login`)
  const submit = page.getByRole('button', { name: 'Abrir mi turno' })
  for (let i = 0; i < 30 && (await submit.isDisabled()); i += 1) {
    await page.getByLabel('Correo').fill('admin')
    await page.getByLabel('Contraseña').fill('admin')
    await page.waitForTimeout(500)
  }
  await submit.click()
  await page.waitForURL('**/salon')
}

// Pedido de muestra en la mesa 7 (si ya hay uno abierto, se reutiliza).
async function seed(page) {
  const libre = page.getByRole('button', { name: /^7\b.*Libre/ })
  if (await libre.count()) {
    await libre.click()
    await page.getByText('Toca una mesa para ver su cuenta').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: /Mesa 7/ }).click()
    const carta = page.getByRole('region', { name: 'Carta' })
    await carta.getByRole('button', { name: /Hamburguesa Angus/ }).click()
    await carta.getByRole('button', { name: /Papas Trufadas/ }).click()
    await page.getByRole('button', { name: 'Enviar a cocina' }).click()
    await page.waitForURL('**/salon')
  }
  await page.goto(`${base}/pedidos`)
  const link = page.locator('a[href$="/agregar"]').first()
  await page.getByRole('button', { name: 'Ver detalle' }).first().click()
  await link.waitFor()
  return link.getAttribute('href')
}

// `route` a null captura el estado actual de la página (menús y diálogos abiertos).
async function shoot(page, route, name, dark) {
  if (route) {
    await page.goto(`${base}${route}`)
    await page.waitForLoadState('networkidle')
  } else {
    await page.waitForTimeout(400)
  }
  if (route === '/historial') {
    const row = page.getByRole('button', { name: /^Pedido# (DI|TA|DE)\d+/ }).first()
    if (await row.count()) { await row.click(); await page.waitForTimeout(800) }
  }
  if (route === '/pedidos') { await page.waitForTimeout(500) }
  const file = path.join(out, `${name}${dark ? '_dark' : ''}.png`)
  await page.screenshot({ path: file })
  console.log('captura', file)
}

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  let agregar = '/pedidos'
  for (const dark of [false, true]) {
    const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
    if (dark) await context.addInitScript(() => { localStorage.setItem('waiter.theme', 'dark') })
    const page = await context.newPage()
    await login(page)
    if (!dark) agregar = await seed(page)
    await shoot(page, '/dashboard', 'dashboard', dark)
    await shoot(page, '/pedidos', 'pedidos', dark)
    // "Sorting.png" y "Detail Order.png" son estados de /pedidos, no rutas aparte.
    await page.getByRole('button', { name: /Ordenar por/ }).click()
    await shoot(page, null, 'pedidos_orden', dark)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Ver detalle' }).first().click()
    await shoot(page, null, 'pedidos_detalle', dark)
    await shoot(page, agregar, 'pedidos_agregar', dark)
    // "New Order Appear.png": el carrito con una línea.
    await page.getByRole('button', { name: 'Agregar' }).first().click()
    await shoot(page, null, 'pedidos_agregar_ronda', dark)
    await shoot(page, '/historial', 'historial', dark)
    await context.close()
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
