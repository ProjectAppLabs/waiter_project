/* Verifica J2 en navegador con respuestas del resolvedor exportadas a JSON.
 * Todas las peticiones de la API se interceptan: no escribe datos en servicios. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright-core')
const output = path.resolve(process.env.THEME_EVIDENCE || '../test-reports/j2')
const base = process.env.DINER_URL || 'http://localhost:3001'

async function main() {
  const browser = process.env.CDP_URL
    ? await chromium.connectOverCDP(process.env.CDP_URL)
    : await chromium.launch({ headless: true })
  const results = []
  try {
    for (const name of ['predeterminado', 'compacto', 'amplio']) {
      const template = JSON.parse(await fs.readFile(path.join(output, `${name}.json`), 'utf8'))
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
      await context.addCookies([{ name: 'waiter_intro_audit_v1', value: '1', url: base }])
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const dish = { id: 1, nombre: 'Plato del día', precio: 25000, agotado: false, categorias: [1], foto: null }
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url()).pathname
        let data
        if (url === '/api/v1/audit/demo/') data = {
          contexto: { restaurante: { slug: 'audit', nombre: 'Restaurante' }, sede: { slug: 'demo', nombre: 'Sede' }, mesa: null,
            plantilla: template, marca: { nombre: 'Restaurante', logo: null, saludo: '', lema: '', mesero: 'Mesero', bienvenida: '', color: '#6755A0', colorTexto: '#FFFFFF', colorSuave: '#EEEBF5', fuente: 'Mulish', radio: 16 } },
          carta: { restaurante: 'Restaurante', categorias: [{ id: 1, nombre: 'Almuerzo', productos: [dish] }] },
        }
        else if (url === '/api/v1/sesiones/') data = { sesion: { id: 'prueba', estado: 'abierta', mesa: null }, comensal: { id: 'prueba' } }
        else if (url.endsWith('/carrito/')) data = { sesion: 'prueba', lineas: [], total: 0, mio: 0, por_comensal: [] }
        else if (url === '/api/v1/cuenta/') data = { cuenta: null, pedidos: [] }
        else if (url.endsWith('/favoritos/')) data = { favoritos: [] }
        else { errors.push(`API sin fixture: ${url}`); return route.fulfill({ status: 501, json: {} }) }
        await route.fulfill({ json: data })
      })
      await page.goto(`${base}/audit/demo/carta`, { waitUntil: 'networkidle' })
      await page.locator('.sm-food-card').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const actual = await page.evaluate(() => {
        const root = document.querySelector('.smart-menu')
        const card = document.querySelector('.sm-food-card')
        const read = element => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return {
          font: style.fontFamily, text: parseFloat(style.fontSize), padding: parseFloat(style.paddingLeft),
          radius: parseFloat(style.borderTopLeftRadius), width: box.width, height: box.height,
        } }
        return {
          root: read(root), card: read(card), heading: read(card.querySelector('h3')),
          categories: [...document.querySelectorAll('.sm-categories button')].map(read),
          overflow: document.documentElement.scrollWidth > innerWidth,
          smallControls: [...document.querySelectorAll('.smart-menu button, .smart-menu a')].filter(element => {
            const box = element.getBoundingClientRect()
            return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44)
          }).map(element => ({ label: element.getAttribute('aria-label') || element.textContent, ...read(element) })),
        }
      })
      const foundation = template.tema.fundamentos
      // Falla si la densidad se calcula en :root y no cambia el relleno de la tarjeta.
      assert.equal(actual.card.padding, 12 * foundation.densidad)
      // Falla si la forma no llega al CSS o si los títulos alteran el tamaño del texto base.
      assert.equal(actual.card.radius, 16 * foundation.forma.tarjeta)
      assert.equal(actual.root.text, 14 * foundation.texto)
      // Falla si la fuente de cuerpo se ignora o las acciones principales se encogen al compactar el tema.
      assert(actual.root.font.includes(foundation.tipografia.cuerpo))
      assert(actual.categories.length > 0)
      assert(actual.categories.every(button => button.height >= 44 && button.width >= 44))
      // Falla si queda cualquier enlace o botón por debajo de 44 px.
      assert.deepEqual(actual.smallControls, [])
      assert.equal(actual.overflow, false)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(output, `${name}-carta.png`), fullPage: true })
      await page.goto(`${base}/audit/demo/plato/1`, { waitUntil: 'networkidle' })
      await page.locator('.sm-dish-purchase .sm-primary').waitFor()
      const primary = await page.locator('.sm-dish-purchase .sm-primary').boundingBox()
      // Falla si el botón de pedir del plato cae por debajo de 44 px con cualquier tema admitido de la muestra.
      assert(primary && primary.width >= 44 && primary.height >= 44)
      actual.primary = primary
      results.push({ name, ...actual })
      await context.close()
    }
    await fs.writeFile(path.join(output, 'fundamentos-navegador.json'), JSON.stringify(results, null, 2))
    console.log('Tres temas verificados: densidad, texto base, forma, fuentes y acciones principales.')
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
