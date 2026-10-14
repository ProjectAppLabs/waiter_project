// Capturas de la familia B (Casual de barrio) para ../docs/diseno/plantillas/capturas, sobre la app real (nada se oculta ni se simula):
// el diner de desarrollo en :3011 contra experience en :8001, Pixel 7, vista previa por ?vista_previa=<base64url {"plantilla":"B?"}>.
//
//   cd diner && EXPERIENCE_ORIGIN=http://192.168.56.10:8001 npx next dev --webpack -H 192.168.56.10 -p 3011
//   cd diner && node scripts/capture-family-B.mjs            # DINER_ORIGIN y CAPTURE_DIR opcionales
//
// Recorrido: en B1 se agregan platos con ＋ (y uno con nota desde el plato) para que la barra oscura y el pedido tengan datos reales;
// después, por cada plantilla, carta (pantalla y completa), pedido (arriba y totales) y pago; por último registro → código → cuenta
// (patrón «tarjetas» de la familia) en B1 y la cuenta en B4 (modo oscuro).
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { chromium, devices } from 'playwright'

const ORIGIN = process.env.DINER_ORIGIN ?? 'http://192.168.56.10:3011'
const BASE = `${ORIGIN}/burger-house/poblado/t/Z2XUVG`
const OUT = resolve(process.env.CAPTURE_DIR ?? '../docs/diseno/plantillas/capturas')
const CODES = ['B1', 'B2', 'B3', 'B4', 'B5']
const preview = (code) => Buffer.from(JSON.stringify({ plantilla: code })).toString('base64url')
const url = (code, screen) => `${BASE}/${screen}/?vista_previa=${preview(code)}`

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-CO', timezoneId: 'America/Bogota' })
const page = await context.newPage()
page.setDefaultTimeout(120_000)

const settle = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(600) }
// La sesión del comensal y el carrito de la mesa llegan después de la carta: se espera la respuesta del carrito antes de tocar nada.
const go = async (code, screen) => {
  const cart = page.waitForResponse((r) => r.url().includes('/carrito/'), { timeout: 30_000 }).catch(() => null)
  await page.goto(url(code, screen))
  await page.getByText(`Vista previa · ${code}`).waitFor()
  await cart
  await settle()
}
const shot = async (name, fullPage = false) => { await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage }); console.log('·', name) }
const bottom = async () => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400) }

// 1 · Datos reales en el carrito: ＋ en la rejilla B1 y un plato con nota desde su pantalla.
await go('B1', 'carta')
for (const name of ['Hamburguesa Angus', 'Papas Trufadas', 'Limonada de Coco']) {
  const add = page.getByRole('button', { name: `Agregar: ${name}` })
  if (await add.count()) { await add.first().click(); await page.waitForTimeout(500) }
}
const card = page.getByRole('article').filter({ hasText: 'Hamburguesa Angus' }).first()
if (await card.count()) {
  await card.getByRole('button').first().click()
  await settle()
  const note = page.getByRole('textbox')
  if (await note.count()) await note.first().fill('término medio')
  await page.getByRole('button', { name: /Agregar/ }).first().click()
  await page.waitForTimeout(600)
}

// 2 · Carta, pedido y pago de las cinco (la cuenta sale del carrito de la mesa: nada se envía a cocina, así el pedido conserva sus líneas).
for (const code of CODES) {
  await go(code, 'carta')
  await shot(`${code}-carta`)
  await shot(`${code}-carta-completa`, true)
  await go(code, 'pedido')
  await shot(`${code}-pedido`)
  await bottom()
  await shot(`${code}-pedido-totales`)
  await go(code, 'pago')
  await shot(`${code}-pago`)
}

// 3 · Cuenta: registro → código → cuenta (patrón «tarjetas») en B1; la cuenta en B4 (pizarra oscura).
await go('B1', 'cuenta/registro')
const fields = page.locator('input[name=nombre], input[name=correo], input[name=celular]')
if (await fields.count() >= 2) {
  await page.locator('input[name=nombre]').fill('Camila Restrepo')
  await page.locator('input[name=correo]').fill(`camila+${Date.now()}@correo.com`)
  if (await page.locator('input[name=celular]').count()) await page.locator('input[name=celular]').fill('3001234567')
  // Consentimientos: las casillas son sr-only, se tocan por su etiqueta.
  const consents = page.locator('label').filter({ has: page.locator('input[type=checkbox]') })
  for (let i = 0; i < await consents.count(); i += 1) await consents.nth(i).click()
  await shot('B1-cuenta-registro')
  await page.getByRole('button', { name: /Crear cuenta/ }).click()
  await page.getByRole('heading', { name: /Verifica/ }).waitFor()
  await settle()
  await shot('B1-cuenta-codigo')
  const digits = page.locator('input[inputmode=numeric]')
  const n = await digits.count()
  for (let i = 0; i < n; i += 1) await digits.nth(i).fill(String((i + 4) % 10))
  const confirm = page.getByRole('button', { name: /Confirmar/ })
  if (await confirm.isEnabled()) await confirm.click()
  await page.waitForURL(/\/cuenta\/?(\?|$)/)
  await settle()
  await shot('B1-cuenta', true)
} else {
  await shot('B1-cuenta-registro')
}
await go('B4', 'cuenta')
await shot('B4-cuenta', true)

await browser.close()
