/* Plan K3–K5: verificación dinámica de un borrador con plantillas de componente.
 * Abre en un navegador real la página viva del sistema de diseño con ?borrador=<token> (todos los componentes, con datos
 * de muestra) a 375 y 1024 px, y la carta a 320, 375 y 1024 px (tarjeta, banners y cabecera en su contexto real), y
 * mide cada raíz dibujada con plantilla propia ([data-plantilla="propia"], hasta 12 por componente): desbordes de la
 * raíz y de la página, elementos que sobresalen, palabras que no caben y se parten, textos por debajo de 14 px,
 * controles por debajo de 44 px y solapes entre piezas. Escribe JSON en stdout ({ok, problemas, medidas, capturas};
 * ok null = no se pudo medir); los mensajes van a stderr. Solo lee: no envía escrituras.
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
const PAGES = [
  { name: 'sistema', path: 'design-system', widths: [375, 1024], wait: '.ds-option', shot: '#componentes' },
  { name: 'carta', path: 'carta', widths: [320, 375, 1024], wait: 'article.sm-food-card', shot: '.sm-menu-sections section, .sm-food-list, .sm-food-grid' },
]

// Se ejecuta dentro de la página: devuelve los problemas de cada raíz con plantilla propia, agrupados por componente.
function measureRoots() {
  const problems = [], counts = {}
  const canvas = document.createElement('canvas').getContext('2d')
  const box = (el) => el.getBoundingClientRect()
  const visible = (el) => { const r = box(el); return r.width > 0 && r.height > 0 }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 40)
  // Piezas que se colocan encima a propósito (y todo lo que llevan dentro): no cuentan como desborde ni como solape.
  const floating = '.ds-decoracion, .sm-heart, .sm-quick-add, .sm-rating-pill, .sm-dish-orbits, .sm-swipe-delete, .sm-status-art span'
  const floats = (el) => !!el.closest(floating)
  // Ancho disponible para el texto: el del elemento si es de bloque, si no el del ancestro de bloque más cercano.
  const blockWidth = (el) => { let node = el; while (node && node !== document.body) { if (getComputedStyle(node).display !== 'inline' && node.clientWidth > 0) return node.clientWidth; node = node.parentElement } return innerWidth }
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`la página desborda horizontalmente ${document.documentElement.scrollWidth - innerWidth} px`)
  for (const root of document.querySelectorAll('[data-plantilla="propia"]')) {
    const component = root.dataset.componente || 'componente'
    counts[component] = (counts[component] || 0) + 1
    if (counts[component] > 12 || !visible(root)) continue
    const heading = root.querySelector('h1,h2,h3')?.textContent.trim().slice(0, 30)
    const label = `${component} ${counts[component]}${heading ? ` («${heading}»)` : ''}`
    const rb = box(root)
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`${label}: el contenido desborda ${root.scrollWidth - root.clientWidth} px a lo ancho`)
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || floats(el)) continue
      const r = box(el)
      if (r.right > rb.right + 1 || r.left < rb.left - 1) { problems.push(`${label}: «${name(el)}» sobresale del componente`); break }
    }
    for (const el of root.querySelectorAll('h1, h2, h3, p, span, strong, small, em, li, a, button')) {
      if (!visible(el) || !el.childNodes.length || floats(el)) continue
      const style = getComputedStyle(el)
      const size = parseFloat(style.fontSize)
      if (size < 14) problems.push(`${label}: «${name(el)}» tiene texto de ${size.toFixed(1)} px (mínimo 14)`)
      canvas.font = style.font
      const words = [...el.childNodes].filter((n) => n.nodeType === 3).flatMap((n) => n.textContent.split(/\s+/)).filter(Boolean)
      const longest = words.reduce((best, w) => (canvas.measureText(w).width > canvas.measureText(best).width ? w : best), '')
      const available = blockWidth(el)
      // Tolerancia de 3 px: un bloque que se encoge a su contenido mide la palabra con redondeo de subpíxeles.
      if (longest && canvas.measureText(longest).width > available + 3) problems.push(`${label}: la palabra «${longest}» (${Math.round(canvas.measureText(longest).width)} px) no cabe en ${Math.round(available)} px y se parte`)
    }
    for (const el of root.querySelectorAll('a, button')) {
      if (!visible(el)) continue
      const r = box(el)
      if (r.width < 44 || r.height < 44) problems.push(`${label}: el control «${name(el)}» mide ${Math.round(r.width)}×${Math.round(r.height)} px (mínimo 44×44)`)
    }
    const leaves = [...root.querySelectorAll('*')].filter((el) => visible(el) && !floats(el) && (hasText(el) || el.matches('img')))
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue
      const a = box(leaves[i]), b = box(leaves[j])
      const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left), dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (dx > 4 && dy > 4) problems.push(`${label}: «${name(leaves[i])}» se solapa con «${name(leaves[j])}»`)
    }
  }
  // El mismo problema en varias raíces se informa una vez, con las raíces afectadas: la IA lee menos y corrige lo mismo.
  const grouped = new Map()
  for (const problem of problems) {
    const match = problem.match(/^([a-z-]+) (\d+)(?: \(«[^»]*»\))?: (.*)$/)
    const key = match ? `${match[1]}: ${match[3]}` : problem
    if (!grouped.has(key)) grouped.set(key, { component: match ? match[1] : null, indexes: new Set() })
    if (match) grouped.get(key).indexes.add(Number(match[2]))
  }
  return { raices: counts, problemas: [...grouped].map(([key, { component, indexes }]) => {
    if (!component) return key
    return `${component}${indexes.size === counts[component] ? '' : ` (${[...indexes].join(', ')})`}: ${key.slice(component.length + 2)}`
  }) }
}

async function main() {
  if (!token) throw new Error('Falta DRAFT_TOKEN')
  const result = { ok: true, problemas: [], medidas: {}, capturas: [] }
  // Un borrador que no trae ninguna plantilla propia (p. ej. vuelve a fábrica) no tiene nada que medir aquí.
  const draft = await fetch(`${base}/api/v1/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/borradores/${encodeURIComponent(token)}/`)
  if (!draft.ok) throw new Error(`el borrador no responde (${draft.status})`)
  const components = (await draft.json()).plantilla?.tema?.componentes || {}
  const targets = Object.keys(components).filter((id) => components[id])
  if (!targets.length) {
    result.medidas.nota = 'el borrador no trae plantillas propias; nada que medir'
    process.stdout.write(JSON.stringify(result))
    return
  }
  const browser = process.env.CDP_URL ? await chromium.connectOverCDP(process.env.CDP_URL) : await chromium.launch({ headless: true })
  const seen = new Set()
  try {
    for (const spec of PAGES) for (const width of spec.widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addCookies([{ name: `waiter_intro_${encodeURIComponent(rest)}_v1`, value: '1', url: base }])
      const page = await context.newPage()
      const errors = [], writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`) })
      await page.goto(`${base}/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/${spec.path}/?borrador=${encodeURIComponent(token)}`, { waitUntil: 'networkidle', timeout: 120000 })
      await page.locator(spec.wait).first().waitFor({ timeout: 60000 })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const measured = await page.evaluate(measureRoots)
      if (errors.length) measured.problemas.push(...errors.map((e) => `error de JavaScript: ${e}`))
      if (writes.length) measured.problemas.push(...writes.map((w) => `la página intentó escribir: ${w}`))
      Object.keys(measured.raices).forEach((id) => seen.add(id))
      result.medidas[`${spec.name} ${width}px`] = { raices: measured.raices, problemas: measured.problemas.length }
      result.problemas.push(...measured.problemas.map((p) => `${spec.name} ${width} px: ${p}`))
      if (evidence) {
        await fs.mkdir(evidence, { recursive: true })
        const file = path.join(evidence, `borrador-${spec.name}-${width}.png`)
        await page.locator(spec.shot).first().screenshot({ path: file })
        result.capturas.push(file)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  for (const id of targets) if (!seen.has(id)) result.problemas.push(`ningún «${id}» se dibujó con la plantilla del borrador (¿el token caducó o la página viva no muestra ese componente?)`)
  result.ok = result.problemas.length === 0
  process.stdout.write(JSON.stringify(result))
  process.stderr.write(`\n${result.ok ? 'Sin problemas' : `${result.problemas.length} problema(s)`} en ${targets.join(', ')}.\n`)
}
// ok null: el navegador no pudo medir (infraestructura), que no es lo mismo que una plantilla con problemas.
main().catch((error) => { process.stdout.write(JSON.stringify({ ok: null, problemas: [`la verificación falló: ${error.message}`] })); process.exitCode = 1 })
