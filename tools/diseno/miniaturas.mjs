// Miniaturas de los marcos del diseño (360 px a 2×) para la galería de plantillas del POS y para revisar fidelidad.
// Uso: node tools/diseno/miniaturas.mjs [pantalla=menu] — requiere Playwright de frontend/.
import { chromium } from '/home/cerrotico/work/waiter_project/diner/node_modules/@playwright/test/index.mjs'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const pantalla = process.argv[2] ?? 'menu'
const base = new URL('../../docs/diseno/plantillas/', import.meta.url)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
let n = 0
for (const code of readdirSync(base).filter((d) => /^[A-F][1-5]$/.test(d)).sort()) {
  const file = new URL(`${code}/${pantalla}.html`, base)
  if (!existsSync(file)) continue
  await page.goto(pathToFileURL(file.pathname).href, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const frame = page.locator('body > div').first()
  await frame.screenshot({ path: new URL(`${code}/${pantalla}.png`, base).pathname })
  n++
}
await browser.close()
console.log(`${n} miniaturas de ${pantalla}`)
