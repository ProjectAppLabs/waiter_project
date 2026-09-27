/* Plan K3–K5 y L: verificación dinámica de un borrador con plantillas de componente (medidas y seguridad).
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
  // El contraste depende de los colores del tema en todas las pantallas, no solo donde hay plantillas propias: sin sesión
  // se ven los estados vacíos, formularios y títulos que más sufren con un fondo oscuro.
  { name: 'plato', path: 'plato/41', widths: [375, 1024], wait: '.sm-dish-hero', shot: '.smart-menu' },
  ...['favoritos', 'pedido', 'la-cuenta', 'historial', 'recompensas', 'ubicacion', 'cuenta', 'cuenta/entrar', 'cuenta/registro']
    .map((screen) => ({ name: screen, path: screen, widths: [375], wait: '.smart-menu .sm-page', shot: '.smart-menu' })),
]

// Orígenes a los que la carta puede pedir recursos: el propio (incluidos los proxys /api y /experience) y Google Fonts.
const ALLOWED_ORIGINS = new Set([new URL(base).origin, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'])

// Se ejecuta dentro de la página: contenido activo que una plantilla nunca debe traer (Plan L). El validador del servidor ya
// lo impide al preparar; esto lo comprueba en lo que de verdad dibujó el navegador.
async function securityCheck(fonts) {
  const problems = []
  for (const el of document.querySelectorAll('iframe, object, embed, frame')) problems.push(`seguridad: la página contiene <${el.tagName.toLowerCase()}>`)
  for (const root of document.querySelectorAll('[data-plantilla="propia"]')) {
    const component = root.dataset.componente || 'componente'
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.tagName === 'SCRIPT') problems.push(`seguridad: ${component}: contiene <script>`)
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase(), value = attr.value.trim().toLowerCase()
        if (name.startsWith('on')) problems.push(`seguridad: ${component}: atributo de evento ${name}`)
        if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name) && /^(javascript|data|vbscript):/.test(value)) problems.push(`seguridad: ${component}: enlace ${value.split(':')[0]}: en ${name}`)
        if (name === 'style' && /url\(\s*['"]?(?!\/[^/])/.test(value)) problems.push(`seguridad: ${component}: estilo con url() externa`)
      }
    }
  }
  // Una familia solo descarga los pesos que se usan: se pide explícitamente y basta con que Google Fonts sirva alguna cara.
  for (const font of fonts) {
    const faces = await document.fonts.load(`16px "${font}"`).catch(() => [])
    if (!faces.length) problems.push(`la fuente global «${font}» no cargó desde Google Fonts`)
  }
  return [...new Set(problems)]
}

// Se ejecuta dentro de la página: contraste real de cada texto y cada icono visible contra el fondo que tiene detrás
// (WCAG AA: 4.5:1 para texto, 3:1 para texto grande e iconos). El fondo se compone subiendo por los ancestros hasta uno
// opaco; si detrás hay una foto (url()) no se puede medir y se omite. Los controles deshabilitados están exentos.
function contrastCheck() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r, g, b, a } }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  function background(el) {
    const layers = []
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node)
      if (/url\(/.test(cs.backgroundImage) && !node.matches('.smart-menu, main')) return null
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    return layers.reduceRight((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 })
  }
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 }
  const exempt = (el) => el.closest('[disabled], [aria-disabled="true"], .ds-decoracion, [aria-hidden="true"] img')
  const problems = new Map()
  const report = (el, got, need, fg, bg) => {
    const label = (el.getAttribute('aria-label') || el.textContent || el.closest('[aria-label]')?.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    const key = `contraste ${got.toFixed(2)}:1 (mínimo ${need}:1) en «${label}»: ${hex(fg)} sobre ${hex(bg)}`
    problems.set(`${hex(fg)}|${hex(bg)}|${label}`, key)
  }
  for (const el of document.querySelectorAll('.smart-menu *')) {
    if (!visible(el) || exempt(el)) continue
    const isIcon = el.tagName.toLowerCase() === 'svg'
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!isIcon && !hasText) continue
    if (el.closest('svg') && !isIcon) continue
    const bg = background(el)
    if (!bg) continue
    const cs = getComputedStyle(el)
    let paint = cs.color
    if (isIcon) { const stroke = cs.stroke, fill = cs.fill; paint = stroke && stroke !== 'none' ? stroke : fill && fill !== 'none' ? fill : cs.color }
    const fgRaw = parse(paint) || parse(cs.color)
    if (!fgRaw || fgRaw.a === 0) continue
    const fg = over({ ...fgRaw, a: fgRaw.a * Math.min(1, Number(cs.opacity)) }, bg)
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
    const need = isIcon || size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
    const got = ratio(fg, bg)
    if (got < need) report(el, got, need, fg, bg)
  }
  return [...problems.values()]
}

// Se ejecuta dentro de la página: reglas de las fotos que define el sistema de diseño (fundamentos.imagenes y
// variantes.marcoImagen). Una foto de plato (ruta /fotos/<id>/) se mide en su caja de recorte (.sm-food-photo): radio de al
// menos la mitad del definido y nunca menos de 8 px (salvo circular), sin deformación, con el ajuste y el marco del tema.
function imageCheck() {
  const main = document.querySelector('main') || document.documentElement
  const vars = getComputedStyle(main)
  const radio = parseFloat(vars.getPropertyValue('--ds-imagen-radio')) || 16
  const fit = vars.getPropertyValue('--ds-imagen-ajuste').trim() || 'cover'
  const marco = main.closest('[data-ds-marco-imagen]')?.getAttribute('data-ds-marco-imagen') || main.getAttribute('data-ds-marco-imagen') || 'ninguno'
  const minimum = Math.max(8, radio / 2)
  const problems = new Map()
  const px = (value, size) => (value.endsWith('%') ? (parseFloat(value) / 100) * size : parseFloat(value) || 0)
  for (const img of document.querySelectorAll('.smart-menu img')) {
    if (!/\/fotos\/\d+/.test(img.getAttribute('src') || '')) continue
    const clip = img.closest('.sm-food-photo') || img
    const box = clip.getBoundingClientRect()
    if (box.width < 8 || box.height < 8) continue
    // La muestra de la página viva sobreescribe el marco por opción: se lee el atributo más cercano a la foto.
    const frame = clip.closest('[data-ds-marco-imagen]')?.getAttribute('data-ds-marco-imagen') || marco
    const where = (clip.closest('[data-componente]')?.dataset.componente) || (clip.parentElement?.className.toString().split(' ')[0]) || 'foto'
    const cs = getComputedStyle(clip), ics = getComputedStyle(img)
    const radius = Math.min(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => px(cs[k], box.width)))
    const circular = radius >= Math.min(box.width, box.height) / 2 - 1
    if (!circular && radius < minimum - 0.5) problems.set(`r${where}`, `imágenes: ${where}: foto con radio ${Math.round(radius)} px; el sistema de diseño pide al menos ${Math.round(minimum)} px (radio ${radio} px, nunca en punta)`)
    const natural = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null
    const shown = img.getBoundingClientRect(), ratio = shown.width / shown.height
    if (ics.objectFit === 'fill' && natural && Math.abs(ratio - natural) / natural > 0.03) problems.set(`d${where}`, `imágenes: ${where}: foto deformada (se estira de ${natural.toFixed(2)} a ${ratio.toFixed(2)})`)
    if (ics.objectFit !== fit) problems.set(`a${where}`, `imágenes: ${where}: la foto usa object-fit ${ics.objectFit}; el sistema de diseño pide ${fit}`)
    const shadow = cs.boxShadow !== 'none' ? cs.boxShadow : ''
    if (frame === 'borde' && !(/ 2px\)?$|0px 0px 0px 2px/.test(shadow) || parseFloat(cs.borderTopWidth) >= 2)) problems.set(`b${where}`, `imágenes: ${where}: la foto no lleva el borde de 2 px del sistema de diseño`)
    if (frame === 'sombra' && !shadow) problems.set(`s${where}`, `imágenes: ${where}: la foto no lleva la sombra del sistema de diseño`)
  }
  return [...problems.values()]
}

// Se ejecuta dentro de la página: reglas de maquetación de las pantallas, que son del código y no del tema (el MCP no las
// cambia), para que ninguna regresión pase sin verse. Espacio vacío al final, contenido cortado por el borde, muelle en una
// fila, adornos fijos visibles sin sentido y nutrición en una fila.
function layoutCheck() {
  const problems = []
  const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 }
  const fixed = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true } return false }
  const inRail = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true } return false }
  const page = document.querySelector('.smart-menu .sm-page')
  const dock = document.querySelector('.smart-menu .sm-action-dock')
  const dockHeight = dock && visible(dock) ? innerHeight - dock.getBoundingClientRect().top : 0
  // 1. Espacio vacío al final: lo que queda bajo el último contenido no debe pasar del muelle más 96 px de respiro.
  if (page) {
    let last = 0
    for (const el of page.querySelectorAll('*')) { if (!visible(el) || fixed(el)) continue; last = Math.max(last, el.getBoundingClientRect().bottom + scrollY) }
    // Cuenta lo que queda por debajo del contenido y de una pantalla completa: una pantalla corta (o la franja de vista
    // previa, que la alarga unos píxeles) no tiene espacio sobrante aunque el documento se desplace un poco.
    const empty = document.documentElement.scrollHeight - Math.max(last, innerHeight)
    if (last && empty > dockHeight + 96) problems.push(`maquetación: sobran ${Math.round(empty - dockHeight)} px vacíos al final de la pantalla (bajo el último contenido)`)
  }
  // 2. Contenido cortado por el borde: fotos y textos visibles que se salen de la pantalla (fuera de un carril desplazable).
  const cut = new Set()
  for (const el of document.querySelectorAll('.smart-menu img, .smart-menu h1, .smart-menu h2, .smart-menu h3, .smart-menu p, .smart-menu strong')) {
    if (!visible(el) || inRail(el) || el.closest('.ds-decoracion, .sm-orbit-hero, [aria-hidden="true"]')) continue
    const r = el.getBoundingClientRect()
    if (r.right > innerWidth + 1 || r.left < -1) cut.add((el.getAttribute('alt') || el.textContent || el.tagName).trim().slice(0, 30) || el.tagName)
  }
  for (const name of cut) problems.push(`maquetación: «${name}» queda cortado por el borde de la pantalla`)
  // 3. Muelle: sus botones van en una sola fila y ninguno parte su texto en más de dos líneas.
  if (dock && visible(dock)) {
    const items = [...dock.children].filter(visible)
    const tops = items.map((el) => Math.round(el.getBoundingClientRect().top))
    if (items.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) problems.push('maquetación: los botones del muelle no comparten fila')
    for (const b of dock.querySelectorAll('a, button')) if (visible(b) && b.getBoundingClientRect().height > 72) problems.push(`maquetación: el botón «${b.textContent.trim().slice(0, 24)}» del muelle parte su texto en varias líneas`)
  }
  // 4. Adornos fijos: las órbitas de la ficha solo acompañan a una foto circular.
  const orbits = document.querySelector('.smart-menu .sm-dish-orbits'), photo = document.querySelector('.smart-menu .sm-dish-hero .sm-dish-photo')
  if (orbits && photo && visible(orbits)) {
    const r = photo.getBoundingClientRect(), radius = parseFloat(getComputedStyle(photo).borderTopLeftRadius) || 0
    if (radius < Math.min(r.width, r.height) / 2 - 1) problems.push('maquetación: las órbitas decorativas de la ficha se ven con una foto no circular')
  }
  // 6. Galería de la ficha (Plan M): como mucho 5 fotos, un punto por foto, todas cargadas y cada una del ancho del marco.
  for (const gallery of document.querySelectorAll('.smart-menu .sm-dish-gallery')) {
    const imgs = [...gallery.querySelectorAll('.sm-dish-gallery-rail img')], dots = gallery.querySelectorAll('.sm-dish-gallery-dots button')
    const frame = gallery.getBoundingClientRect().width
    if (imgs.length > 5) problems.push(`galería: el plato muestra ${imgs.length} fotos; el máximo es 5`)
    if (dots.length !== imgs.length) problems.push(`galería: ${dots.length} puntos para ${imgs.length} fotos`)
    imgs.forEach((img, i) => {
      if (!img.complete || !img.naturalWidth) problems.push(`galería: la foto ${i + 1} no cargó (se vería un hueco al deslizar)`)
      const w = img.closest('.sm-food-photo').getBoundingClientRect().width
      if (Math.abs(w - frame) > 1) problems.push(`galería: la foto ${i + 1} mide ${Math.round(w)} px y el marco ${Math.round(frame)} px (el carrusel no avanza de una en una)`)
    })
  }
  // 5. Nutrición en una fila.
  const nutrition = [...document.querySelectorAll('.smart-menu .sm-nutrition > div')].filter(visible)
  if (nutrition.length > 1 && new Set(nutrition.map((el) => Math.round(el.getBoundingClientRect().top))).size > 1) problems.push('maquetación: la información nutricional no cabe en una fila')
  return [...new Set(problems)]
}

// Se ejecuta dentro de la página: devuelve los problemas de cada raíz con plantilla propia, agrupados por componente.
function measureRoots() {
  const problems = [], counts = {}
  const canvas = document.createElement('canvas').getContext('2d')
  const box = (el) => el.getBoundingClientRect()
  const visible = (el) => { const r = box(el); return r.width > 0 && r.height > 0 }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 40)
  // Piezas que se colocan encima o sobresalen a propósito (y todo lo que llevan dentro): no cuentan como desborde ni como
  // solape. La ilustración orbital del recorrido se sale de la columna por diseño (margen negativo).
  const floating = '.ds-decoracion, .sm-heart, .sm-quick-add, .sm-rating-pill, .sm-dish-orbits, .sm-swipe-delete, .sm-status-art span, .sm-orbit-hero'
  // Los puntos de diapositiva del recorrido son un indicador de 6 px; la misma acción está en el botón «Continuar».
  const paginator = '.sm-slide-dots'
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
    // Un carril que se desplaza a lo ancho a propósito (categorías, tarjetas en fila) no desborda: su contenido sigue.
    // Una raíz que recorta (overflow hidden) esconde adornos que se salen por diseño; lo que importa allí es que ningún
    // elemento real quede fuera de su caja, y eso lo mira la comprobación siguiente.
    const overflowX = getComputedStyle(root).overflowX
    const rail = ['auto', 'scroll'].includes(overflowX), clipped = overflowX === 'hidden'
    if (!rail && !clipped && root.scrollWidth > root.clientWidth + 1) problems.push(`${label}: el contenido desborda ${root.scrollWidth - root.clientWidth} px a lo ancho`)
    if (!rail) for (const el of root.querySelectorAll('*')) {
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
      // Se mide la palabra como se dibuja: con su transformación (mayúsculas) y su interletraje, que el lienzo no aplica.
      const shown = (w) => style.textTransform === 'uppercase' ? w.toUpperCase() : style.textTransform === 'lowercase' ? w.toLowerCase() : w
      const spacing = parseFloat(style.letterSpacing) || 0
      const measure = (w) => canvas.measureText(shown(w)).width + spacing * [...w].length
      const words = [...el.childNodes].filter((n) => n.nodeType === 3).flatMap((n) => n.textContent.split(/\s+/)).filter(Boolean)
      const longest = words.reduce((best, w) => (measure(w) > measure(best) ? w : best), '')
      const available = blockWidth(el)
      // Tolerancia de 3 px: un bloque que se encoge a su contenido mide la palabra con redondeo de subpíxeles.
      if (longest && measure(longest) > available + 3) problems.push(`${label}: la palabra «${shown(longest)}» (${Math.round(measure(longest))} px) no cabe en ${Math.round(available)} px y se parte`)
    }
    for (const el of root.querySelectorAll('a, button')) {
      if (!visible(el) || el.closest(paginator)) continue
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
  const result = { ok: true, problemas: [], medidas: {}, capturas: [] }
  // Sin DRAFT_TOKEN se verifica lo publicado (contraste, seguridad y medidas del tema que ya ve el comensal).
  let theme = {}
  if (token) {
    const draft = await fetch(`${base}/api/v1/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/borradores/${encodeURIComponent(token)}/`)
    if (!draft.ok) throw new Error(`el borrador no responde (${draft.status})`)
    theme = (await draft.json()).plantilla?.tema || {}
  }
  const components = theme.componentes || {}
  const targets = Object.keys(components).filter((id) => components[id])
  // Plan L: las fuentes globales del borrador también se comprueban (que carguen desde Google Fonts).
  const fonts = (theme.fundamentos?.tipografia?.fuentes || []).filter((f) => typeof f === 'string')
  const browser = process.env.CDP_URL ? await chromium.connectOverCDP(process.env.CDP_URL) : await chromium.launch({ headless: true })
  const seen = new Set()
  try {
    for (const spec of PAGES) for (const width of spec.widths) {
      // VERIFIER_VISIBLE=1: usa la ventana ya abierta de un navegador con ventana (para ver la medición en vivo); un Edge con
      // ventana no admite bien contextos aislados por CDP, así que solo se cambia el tamaño de la pestaña.
      const visible = process.env.VERIFIER_VISIBLE === '1'
      const context = visible ? browser.contexts()[0] : await browser.newContext({ viewport: { width, height: 900 } })
      await context.addCookies([{ name: `waiter_intro_${encodeURIComponent(rest)}_v1`, value: '1', url: base }])
      const page = visible ? (context.pages()[0] || await context.newPage()) : await context.newPage()
      if (visible) await page.setViewportSize({ width, height: 900 })
      const errors = [], writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      const foreign = new Set()
      page.on('request', (request) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`)
        const url = request.url()
        if (/^https?:/.test(url) && !ALLOWED_ORIGINS.has(new URL(url).origin)) foreign.add(new URL(url).origin)
      })
      await page.goto(`${base}/${encodeURIComponent(rest)}/${encodeURIComponent(venue)}/${spec.path}/${token ? `?borrador=${encodeURIComponent(token)}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 })
      await page.locator(spec.wait).first().waitFor({ timeout: 60000 })
      // Un teléfono no reserva sitio para la barra de desplazamiento; el Edge de Windows sí (15 px). Se oculta para medir el ancho real.
      await page.addStyleTag({ content: 'html { scrollbar-width: none } ::-webkit-scrollbar { display: none }' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const measured = await page.evaluate(measureRoots)
      if (errors.length) measured.problemas.push(...errors.map((e) => `error de JavaScript: ${e}`))
      // Con borrador la página no debe escribir nada; lo publicado sí abre la sesión de mesa (POST /sesiones), que es lo normal.
      if (token && writes.length) measured.problemas.push(...writes.map((w) => `la página intentó escribir: ${w}`))
      measured.problemas.push(...await page.evaluate(securityCheck, fonts))
      measured.problemas.push(...await page.evaluate(contrastCheck))
      measured.problemas.push(...await page.evaluate(imageCheck))
      if (spec.name !== 'sistema') measured.problemas.push(...await page.evaluate(layoutCheck))
      // Plan M: toda foto de plato llega optimizada (WebP) y ligera (menos de 400 KB), la principal y las de galería.
      const photos = await page.evaluate(() => [...new Set([...document.querySelectorAll('.smart-menu img')].map((i) => i.currentSrc || i.src).filter((u) => /\/fotos\/\d+/.test(u)))].slice(0, 12))
      for (const url of photos) {
        const res = await page.request.get(url).catch(() => null)
        if (!res || !res.ok()) { measured.problemas.push(`fotos: ${new URL(url).pathname} no responde`); continue }
        const type = res.headers()['content-type'] || '', size = (await res.body()).length
        if (!type.startsWith('image/webp')) measured.problemas.push(`fotos: ${new URL(url).pathname} llega como ${type || 'sin tipo'}, no WebP`)
        if (size > 400 * 1024) measured.problemas.push(`fotos: ${new URL(url).pathname} pesa ${Math.round(size / 1024)} KB (máximo 400 KB)`)
      }
      measured.problemas.push(...[...foreign].map((origin) => `seguridad: la página pidió recursos a un origen no permitido: ${origin}`))
      Object.keys(measured.raices).forEach((id) => seen.add(id))
      result.medidas[`${spec.name} ${width}px`] = { raices: measured.raices, problemas: measured.problemas.length }
      result.problemas.push(...measured.problemas.map((p) => `${spec.name} ${width} px: ${p}`))
      if (evidence) {
        await fs.mkdir(evidence, { recursive: true })
        const file = path.join(evidence, `borrador-${spec.name}-${width}.png`)
        await page.locator(spec.shot).first().screenshot({ path: file })
        result.capturas.push(file)
      }
      if (process.env.VERIFIER_VISIBLE === '1') await page.waitForTimeout(1500)
      else await context.close()
    }
  } finally {
    // Sobre una conexión CDP, close() solo desconecta; en modo visible la ventana se queda abierta para mirarla.
    await browser.close()
  }
  for (const id of targets) if (!seen.has(id)) result.problemas.push(`ningún «${id}» se dibujó con la plantilla del borrador (¿el token caducó o la página viva no muestra ese componente?)`)
  result.ok = result.problemas.length === 0
  process.stdout.write(JSON.stringify(result))
  process.stderr.write(`\n${result.ok ? 'Sin problemas' : `${result.problemas.length} problema(s)`}${targets.length ? ` en ${targets.join(', ')}` : ''}.\n`)
}
// ok null: el navegador no pudo medir (infraestructura), que no es lo mismo que una plantilla con problemas.
main().catch((error) => { process.stdout.write(JSON.stringify({ ok: null, problemas: [`la verificación falló: ${error.message}`] })); process.exitCode = 1 })
