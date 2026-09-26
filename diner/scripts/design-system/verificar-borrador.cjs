/* Plan K3: verificación dinámica de un borrador con plantillas de componente.
 * Abre la carta con ?borrador=<token> en un navegador real a 320, 375 y 1024 px y mide las tarjetas de plato con
 * plantilla propia (hasta 12): desbordes de la tarjeta y de la página, elementos que sobresalen, palabras que no caben y se
 * parten, textos por debajo de 14 px, controles por debajo de 44 px y solapes entre piezas. Escribe JSON en stdout
 * ({ok, problemas, medidas, capturas}; ok null = no se pudo medir); los mensajes van a stderr. Solo lee: no envía escrituras.
 * Alcance actual: solo la carta y solo la tarjeta de plato; cada componente nuevo añade aquí su pantalla y su selector.
 *
 *   DRAFT_TOKEN=<token público> REST=burger-house SEDE=poblado DINER_URL=http://localhost:3001 \
 *     CDP_URL=http://127.0.0.1:9333 node diner/scripts/design-system/verificar-borrador.cjs
 * experience lo lanza desde verificar_borrador cuando DESIGN_VERIFIER_CMD apunta aquí; DESIGN_EVIDENCE guarda capturas. */
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright-core')

const base = (process.env.DINER_URL || 'http://localhost:3001').replace(/\/$/, '')
const token = process.env.DRAFT_TOKEN
const rest = process.env.REST || 'burger-house', venue = process.env.SEDE || 'poblado'
const evidence = process.env.DESIGN_EVIDENCE ? path.resolve(process.env.DESIGN_EVIDENCE) : null
const WIDTHS = [320, 375, 1024]

// Se ejecuta dentro de la página: devuelve los problemas de cada tarjeta con plantilla propia (hasta doce).
function measureCards() {
  const problems = [], cards = [...document.querySelectorAll('article.sm-food-card[data-plantilla="propia"]')].slice(0, 12)
  const canvas = document.createElement('canvas').getContext('2d')
  const box = (el) => el.getBoundingClientRect()
  const visible = (el) => { const r = box(el); return r.width > 0 && r.height > 0 }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 40)
  // Piezas que se colocan encima a propósito (y todo lo que llevan dentro): no cuentan como desborde ni como solape.
  const floating = '.ds-decoracion, .sm-heart, .sm-quick-add, .sm-rating-pill'
  const floats = (el) => !!el.closest(floating)
  // Ancho disponible para el texto: el del elemento si es de bloque, si no el del ancestro de bloque más cercano.
  const blockWidth = (el) => { let node = el; while (node && node !== document.body) { if (getComputedStyle(node).display !== 'inline' && node.clientWidth > 0) return node.clientWidth; node = node.parentElement } return innerWidth }
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`la página desborda horizontalmente ${document.documentElement.scrollWidth - innerWidth} px`)
  cards.forEach((card, index) => {
    const label = `tarjeta ${index + 1} («${card.querySelector('h1,h2,h3')?.textContent.trim().slice(0, 30) || '?'}»)`
    const cb = box(card)
    if (card.scrollWidth > card.clientWidth + 1) problems.push(`${label}: el contenido desborda ${card.scrollWidth - card.clientWidth} px a lo ancho`)
    for (const el of card.querySelectorAll('*')) {
      if (!visible(el) || floats(el)) continue
      const r = box(el)
      if (r.right > cb.right + 1 || r.left < cb.left - 1) { problems.push(`${label}: «${name(el)}» sobresale de la tarjeta`); break }
    }
    for (const el of card.querySelectorAll('h1, h2, h3, p, span, strong, small, em, li')) {
      if (!visible(el) || !el.childNodes.length) continue
      const style = getComputedStyle(el)
      const size = parseFloat(style.fontSize)
      if (size < 14) problems.push(`${label}: «${name(el)}» tiene texto de ${size.toFixed(1)} px (mínimo 14)`)
      canvas.font = style.font
      const words = [...el.childNodes].filter((n) => n.nodeType === 3).flatMap((n) => n.textContent.split(/\s+/)).filter(Boolean)
      const longest = words.reduce((best, w) => (canvas.measureText(w).width > canvas.measureText(best).width ? w : best), '')
      const available = blockWidth(el)
      if (longest && canvas.measureText(longest).width > available + 1) problems.push(`${label}: la palabra «${longest}» (${Math.round(canvas.measureText(longest).width)} px) no cabe en ${Math.round(available)} px y se parte`)
    }
    for (const el of card.querySelectorAll('a, button')) {
      if (!visible(el)) continue
      const r = box(el)
      if (r.width < 44 || r.height < 44) problems.push(`${label}: el control «${name(el)}» mide ${Math.round(r.width)}×${Math.round(r.height)} px (mínimo 44×44)`)
    }
    // Solapes entre piezas visibles que no se contienen; las decoraciones y los botones flotantes se colocan encima a propósito.
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const leaves = [...card.querySelectorAll('*')].filter((el) => visible(el) && !floats(el) && (hasText(el) || el.matches('img')))
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue
      const a = box(leaves[i]), b = box(leaves[j])
      const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left), dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (dx > 4 && dy > 4) problems.push(`${label}: «${name(leaves[i])}» se solapa con «${name(leaves[j])}»`)
    }
  })
  // El mismo problema en varias tarjetas se informa una vez, con las tarjetas afectadas: la IA lee menos y corrige lo mismo.
  const grouped = new Map()
  for (const problem of problems) {
    const match = problem.match(/^tarjeta (\d+) \(«[^»]*»\): (.*)$/)
    const key = match ? match[2] : problem
    if (!grouped.has(key)) grouped.set(key, new Set())
    if (match) grouped.get(key).add(Number(match[1]))
  }
  return { tarjetas: cards.length, problemas: [...grouped].map(([message, indexes]) => indexes.size ? `${indexes.size === cards.length ? 'todas las tarjetas' : `tarjeta${indexes.size > 1 ? 's' : ''} ${[...indexes].join(', ')}`}: ${message}` : message) }
}

async function main() {
  if (!token) throw new Error('Falta DRAFT_TOKEN')
  const result = { ok: true, problemas: [], medidas: {}, capturas: [] }
  // Un borrador que no trae ninguna plantilla propia (p. ej. vuelve a fábrica) no tiene nada que medir aquí.
  const draft = await fetch(`${base}/api/v1/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/borradores/${encodeURIComponent(token)}/`)
  if (!draft.ok) throw new Error(`el borrador no responde (${draft.status})`)
  const components = (await draft.json()).plantilla?.tema?.componentes || {}
  if (!Object.values(components).some(Boolean)) {
    result.medidas.nota = 'el borrador no trae plantillas propias; nada que medir'
    process.stdout.write(JSON.stringify(result))
    return
  }
  const browser = process.env.CDP_URL ? await chromium.connectOverCDP(process.env.CDP_URL) : await chromium.launch({ headless: true })
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addCookies([{ name: `waiter_intro_${encodeURIComponent(rest)}_v1`, value: '1', url: base }])
      const page = await context.newPage()
      const errors = [], writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`) })
      await page.goto(`${base}/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/carta/?borrador=${encodeURIComponent(token)}`, { waitUntil: 'networkidle', timeout: 120000 })
      await page.locator('article.sm-food-card').first().waitFor({ timeout: 60000 })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const measured = await page.evaluate(measureCards)
      if (errors.length) measured.problemas.push(...errors.map((e) => `error de JavaScript: ${e}`))
      if (writes.length) measured.problemas.push(...writes.map((w) => `la página intentó escribir: ${w}`))
      result.medidas[`${width}px`] = { tarjetas: measured.tarjetas, problemas: measured.problemas.length }
      result.problemas.push(...measured.problemas.map((p) => `${width} px: ${p}`))
      if (measured.tarjetas === 0) result.problemas.push(`${width} px: ninguna tarjeta usa la plantilla del borrador (¿el token caducó o el borrador no cambia la tarjeta?)`)
      if (evidence) {
        await fs.mkdir(evidence, { recursive: true })
        const file = path.join(evidence, `borrador-${width}.png`)
        await page.locator('.sm-menu-sections section, .sm-food-list, .sm-food-grid').first().screenshot({ path: file })
        result.capturas.push(file)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  result.ok = result.problemas.length === 0
  process.stdout.write(JSON.stringify(result))
  process.stderr.write(`\n${result.ok ? 'Sin problemas' : `${result.problemas.length} problema(s)`} en ${WIDTHS.join('/')} px.\n`)
}
// ok null: el navegador no pudo medir (infraestructura), que no es lo mismo que una plantilla con problemas.
main().catch((error) => { process.stdout.write(JSON.stringify({ ok: null, problemas: [`la verificación falló: ${error.message}`] })); process.exitCode = 1 })
