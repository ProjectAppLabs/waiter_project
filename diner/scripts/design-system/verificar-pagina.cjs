/* J5: verifica la página viva del sistema de diseño en un navegador real, con el backend en lectura.
 * Comprueba que cada opción del catálogo tiene su muestra con el atributo correcto y el estilo calculado que la
 * distingue, que la página no desborda, que no hay errores JS y que no se envía ninguna petición de escritura.
 * Guarda capturas completas y recortes por componente en DESIGN_EVIDENCE (test-reports/j5 por defecto).
 *
 *   DINER_URL=http://localhost:3001 CDP_URL=http://127.0.0.1:9333 node diner/scripts/design-system/verificar-pagina.cjs
 *   DRAFT_TOKEN=<token público> añade una segunda pasada con ?borrador= y exige que la página lo anuncie. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright-core')

const root = path.resolve(__dirname, '../../..')
const output = path.resolve(process.env.DESIGN_EVIDENCE || path.join(root, 'test-reports/j5'))
const base = (process.env.DINER_URL || 'http://localhost:3001').replace(/\/$/, '')
const rest = process.env.REST || 'burger-house', venue = process.env.SEDE || 'poblado'
const inventory = require(path.join(root, 'experience/experience_app/diseno/inventario.json'))
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

// Lo que debe cambiar en la muestra de cada opción no predeterminada, medido sobre el estilo calculado.
function check(field, value, m, colors) {
  switch (field) {
  case 'boton': assert.equal(m.primary.background, rgb(value === 'contorno' ? colors.superficie : colors.acentoSuave)); break
  case 'formaBoton': assert.equal(m.primary.radius, value === 'recta' ? '0px' : '999px'); break
  case 'tarjeta': if (value === 'sombra') assert.notEqual(m.card.shadow, 'none'); else assert.equal(m.card.border, '1px'); break
  case 'categorias': assert.equal(m.category.background, value === 'pestanas' ? rgb(colors.acentoSuave) : 'rgba(0, 0, 0, 0)'); break
  case 'precio': if (value === 'normal') assert.equal(m.price.color, rgb(colors.tinta)); else assert.equal(m.price.radius, '999px'); break
  case 'imagen': assert(Math.abs(m.photo.width / m.photo.height - (value === '4:3' ? 4 / 3 : 1)) < .02); break
  case 'formaImagen': assert.equal(m.photo.radius, value === 'circular' ? '50%' : `${16 * m.imageShape}px`); break
  case 'cabecera': assert.equal(m.greeting.direction, 'column'); break
  case 'saludo': assert.equal(m.salute, null); break
  case 'insignia': assert.equal(m.badge.border, '1px'); break
  case 'carta': assert.equal(m.layout.display, 'grid'); if (value === 'lista') assert.equal(m.link.columns.split(' ').length, 2); break
  case 'ficha': assert.equal(m.hero.position, 'relative'); break
  case 'carrito': assert.equal(m.cart.radius, '0px'); break
  default: throw new Error(`Campo sin comprobación: ${field}`)
  }
}

async function run(browser, url, name, draft) {
  const result = { name, url, viewports: [] }
  for (const width of [375, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    const errors = [], writes = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`) })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
    await page.locator('.ds-option').first().waitFor({ timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1000)
    const data = await page.evaluate(() => {
      const style = (el, prop) => el ? getComputedStyle(el)[prop] : null
      const options = [...document.querySelectorAll('.ds-option')].map(option => {
        const sample = option.querySelector('.ds-sample'), q = s => sample.querySelector(s)
        const box = el => { if (!el) return {}; const r = el.getBoundingClientRect(); return { width: r.width, height: r.height } }
        return { field: option.dataset.campo, value: option.dataset.valor, chosen: option.dataset.elegida, inert: sample.hasAttribute('inert'),
          attributes: Object.fromEntries([...sample.attributes].filter(a => a.name.startsWith('data-ds-')).map(a => [a.name, a.value])),
          m: { imageShape: parseFloat(getComputedStyle(sample).getPropertyValue('--ds-forma-imagen')) || 1,
            primary: { background: style(q('.sm-primary'), 'backgroundColor'), radius: style(q('.sm-primary'), 'borderTopLeftRadius') },
            card: { shadow: style(q('.sm-food-card'), 'boxShadow'), border: style(q('.sm-food-card'), 'borderTopWidth') },
            category: { background: style(q('.sm-categories button[aria-pressed="true"]'), 'backgroundColor') },
            price: { color: style(q('.sm-food-price > strong'), 'color'), radius: style(q('.sm-food-price > strong'), 'borderTopLeftRadius') },
            photo: { ...box(q('.sm-food-photo')), radius: style(q('.sm-food-photo'), 'borderTopLeftRadius') },
            greeting: { direction: style(q('.sm-greeting-line'), 'flexDirection') }, salute: q('.sm-greeting-line strong') && style(q('.sm-greeting-line strong'), 'display') !== 'none' ? 'visible' : null,
            badge: { border: style(q('.sm-rating-pill'), 'borderTopWidth') },
            layout: { display: style(q('.sm-food-rail'), 'display') }, link: { columns: style(q('.sm-food-link'), 'gridTemplateColumns') || '' },
            hero: { position: style(q('.sm-dish-hero > .sm-dish-photo'), 'position') }, cart: { radius: style(q('.sm-cart-line'), 'borderTopLeftRadius') } } }
      })
      const main = document.querySelector('main')
      return { options, components: [...document.querySelectorAll('.ds-component')].map(c => c.id.replace('componente-', '')),
        mainAttributes: [...main.attributes].filter(a => a.name.startsWith('data-ds-')).map(a => a.name),
        overflow: document.documentElement.scrollWidth > innerWidth, status: document.querySelector('.ds-status')?.textContent || '',
        screens: document.querySelectorAll('.ds-screens > li').length, colors: {}, height: document.documentElement.scrollHeight,
        fixed: [...document.querySelectorAll('.ds-sample *')].filter(el => getComputedStyle(el).position === 'fixed').map(el => el.className) }
    })
    const theme = await page.evaluate(async () => (await (await fetch(location.search.includes('borrador=') ? `/api/v1/${location.pathname.split('/')[1]}/${location.pathname.split('/')[2]}/borradores/${new URLSearchParams(location.search).get('borrador')}/` : `/api/v1/${location.pathname.split('/')[1]}/${location.pathname.split('/')[2]}/`)).json()))
    const resolved = draft ? theme.plantilla.tema : theme.contexto.plantilla.tema
    // Falla si el runner llega a una página que no es la del sistema de diseño o si el inventario cambió sin actualizar la página.
    assert.deepEqual(data.components, inventory.componentes.map(c => c.id))
    assert.deepEqual(data.mainAttributes, [], 'el <main> no debe llevar atributos data-ds-*')
    assert.equal(data.options.length, Object.values(inventory.variantes).reduce((n, v) => n + v.opciones.length, 0))
    assert.deepEqual(data.fixed, [], 'ningún elemento de una muestra puede quedar fijo sobre la página')
    for (const option of data.options) {
      const definition = inventory.variantes[option.field]
      const [layer, key] = definition.ruta.split('.')
      // Falla si una muestra pierde el atributo de su opción, arrastra otro valor del tema o deja de ser inerte.
      assert(option.inert, `${option.field}=${option.value} no es inerte`)
      assert.equal(option.attributes[definition.atributo], option.value)
      assert.equal(option.chosen, String(resolved[layer][key] === option.value), `${option.field}=${option.value} elegida`)
      for (const other of Object.values(inventory.variantes)) {
        if (other.atributo !== definition.atributo) assert.equal(option.attributes[other.atributo], resolved[other.ruta.split('.')[0]][other.ruta.split('.')[1]], `${option.field}=${option.value} conserva ${other.ruta}`)
      }
      // Falla si la variante existe pero su CSS no llega a la muestra (p. ej. por el orden de la cascada o un selector roto).
      if (option.value !== definition.predeterminada) {
        try { check(option.field, option.value, option.m, resolved.fundamentos.colores) } catch (error) { throw new Error(`${option.field}=${option.value} a ${width}px: ${error.message}`) }
      }
    }
    assert.equal(data.overflow, false, `desbordamiento horizontal a ${width}px`)
    assert.deepEqual(errors, [])
    assert.deepEqual(writes, [], 'la página no debe escribir')
    assert.equal(data.screens, Object.keys(inventory.pantallas).length)
    assert(draft ? /borrador/.test(data.status) && !/Tema publicado/.test(data.status) : /Tema publicado/.test(data.status), data.status)
    await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true })
    await fs.mkdir(path.join(output, 'recortes'), { recursive: true })
    for (const id of ['fundamentos', ...data.components.map(c => `componente-${c}`), 'pantallas']) {
      await page.locator(`#${id}`).screenshot({ path: path.join(output, 'recortes', `${name}-${width}-${id}.png`) })
    }
    result.viewports.push({ width, height: data.height, options: data.options.length, status: data.status })
    await context.close()
  }
  return result
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  const browser = process.env.CDP_URL ? await chromium.connectOverCDP(process.env.CDP_URL) : await chromium.launch({ headless: true })
  const results = []
  try {
    results.push(await run(browser, `${base}/${rest}/${venue}/design-system/`, 'publicado', false))
    if (process.env.DRAFT_TOKEN) results.push(await run(browser, `${base}/${rest}/${venue}/design-system/?borrador=${encodeURIComponent(process.env.DRAFT_TOKEN)}`, 'borrador', true))
    await fs.writeFile(path.join(output, 'resultado.json'), JSON.stringify({ fecha: new Date().toISOString(), resultados: results }, null, 2))
    console.log(`Página viva verificada: ${results.map(r => `${r.name} (${r.viewports.map(v => `${v.width}px`).join(', ')})`).join('; ')}.`)
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
