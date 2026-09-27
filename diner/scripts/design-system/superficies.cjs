/* Plan L · Genera el bloque de «contexto de tinta» de smart-marca.css a partir del propio CSS del menú.
 * Cada regla que pinta un fondo claro de tarjeta (superficie o acentoSuave) escribe con la tinta de tarjeta; cada regla que
 * pinta el fondo de la página vuelve a la tinta del fondo; y una que deja el fondo transparente hereda lo que tiene detrás.
 * Así bg y tinta viajan juntos aunque una variante o una pantalla cambie el fondo de un elemento.
 *   node diner/scripts/design-system/superficies.cjs          reescribe el bloque
 *   node diner/scripts/design-system/superficies.cjs --check  termina con 1 si el bloque no está al día (lo usa la prueba) */
const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(__dirname, '../../components/smart')
const TARGET = path.join(DIR, 'smart-marca.css')
const START = '/* CONTEXTO:inicio (generado por scripts/design-system/superficies.cjs; no editar a mano) */'
const END = '/* CONTEXTO:fin */'
// El último `background` de la regla decide (una regla puede declarar varios); los var() pueden traer valor de reserva.
const BG = /background(?:-color)?\s*:\s*([^;]+)/gi
// Un color fijo claro (luminancia > 0.6, p. ej. el rosado de un aviso) también es fondo de tarjeta: su texto va con la tinta oscura.
const lightHex = (value) => {
  const m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/i)
  if (!m) return false
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6
}
const kindOf = (value) => /^(var\(--sm-surface\b|var\(--t-superficie\b|var\(--t-acento-suave\b|white\b)/i.test(value) || lightHex(value) ? 'card'
  : /^var\(--t-fondo\b/i.test(value) ? 'page' : /^(transparent|none)\b/i.test(value) ? 'clear' : null

const CARD_VARS = '--sm-ink: var(--t-tinta, #32324d); --sm-muted: color-mix(in srgb, var(--t-tinta, #32324d) 78%, var(--sm-surface)); --sm-accent-text: var(--sm-accent-text-superficie); --sm-highlight-text: var(--sm-highlight-text-superficie); --sm-readable-muted: var(--sm-readable-muted-superficie);'
const PAGE_VARS = '--sm-ink: var(--sm-ink-fondo); --sm-muted: color-mix(in srgb, var(--sm-ink-fondo) 78%, var(--t-fondo)); --sm-accent-text: var(--sm-accent-text-fondo); --sm-highlight-text: var(--sm-highlight-text-fondo); --sm-readable-muted: var(--sm-readable-muted-fondo);'
const CLEAR_VARS = '--sm-ink: inherit; --sm-muted: inherit; --sm-accent-text: inherit; --sm-highlight-text: inherit; --sm-readable-muted: inherit;'

// Selector de la regla, con .smart-menu delante si no lo lleva (las reglas de variante ya lo llevan tras su atributo).
// .sm-screen-<pantalla> va en el propio elemento .smart-menu: se une sin espacio (si no, el selector no casaría).
const scoped = (s) => (s.includes('.smart-menu') ? s : s.startsWith('.sm-screen-') ? `.smart-menu${s}` : `.smart-menu ${s}`)

// Orden de la cascada: el de los import de SmartMenu.tsx (el resto de archivos, después y por nombre).
function cssFiles() {
  const imported = [...fs.readFileSync(path.join(DIR, 'SmartMenu.tsx'), 'utf8').matchAll(/import '\.\/(smart-[a-z-]+\.css)'/g)].map((m) => m[1])
  const rest = fs.readdirSync(DIR).filter((f) => f.endsWith('.css') && !imported.includes(f)).sort()
  return [...imported, ...rest].filter((f) => f !== 'smart-marca.css' && fs.existsSync(path.join(DIR, f)))
}

// Reglas del CSS con el @media que las envuelve ('' si ninguno), en orden. Basta un analizador de llaves: el CSS del menú
// solo anida reglas dentro de @media (los @keyframes se descartan porque sus pasos no son selectores).
function rules(css) {
  const found = []
  let i = 0
  const block = (media) => {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i)
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return }
      if (open === -1) { i = css.length; return }
      const prelude = css.slice(i, open).trim()
      i = open + 1
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) block(prelude)
      else if (prelude.startsWith('@')) { let depth = 1; while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++ } }
      else { const end = css.indexOf('}', i); found.push({ media, selectors: prelude, body: css.slice(i, end) }); i = end + 1 }
    }
  }
  block('')
  return found
}

function generate() {
  const out = [], colored = []
  const VARS = { card: CARD_VARS, page: PAGE_VARS, clear: CLEAR_VARS }
  for (const file of cssFiles()) {
    const css = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    // Una regla generada por cada regla original y en el mismo orden: así gana el mismo fondo que en el CSS original.
    for (const { media, selectors, body } of rules(css)) {
      const values = [...body.matchAll(BG)].map((m) => m[1].trim())
      if (!values.length) continue
      const last = values[values.length - 1], kind = kindOf(last)
      if (!kind) continue
      const list = selectors.split(/,(?![^(]*\))/).map((raw) => raw.trim())
        .filter((s) => s && !s.includes('::') && !/^(from|to|\d+%)$/.test(s) && !s.startsWith(':root') && s !== '.smart-menu').map(scoped)
      if (!list.length) continue
      const important = /!important/.test(last) ? ' !important' : ''
      const rule = `${list.join(', ')} { ${VARS[kind].replace(/;/g, `${important};`)} }`
      out.push(media ? `${media} { ${rule} }` : rule)
      if (kind !== 'clear') colored.push(...list)
    }
  }
  // El color de texto va aparte y sin especificidad (:where): solo cubre a lo que lo heredaba; un color explícito del
  // componente (p. ej. el acento de un botón secundario) sigue ganando.
  const color = colored.length ? `:where(${[...new Set(colored)].join(', ')}) { color: var(--sm-ink); }` : ''
  return `${START}\n${out.join('\n')}\n${color}\n${END}`
}

const current = fs.readFileSync(TARGET, 'utf8')
const block = generate()
const a = current.indexOf(START), b = current.indexOf(END)
const next = a === -1 ? `${current.trimEnd()}\n\n${block}\n` : current.slice(0, a) + block + current.slice(b + END.length)
if (process.argv.includes('--check')) { if (next !== current) { console.error('smart-marca.css: el bloque de contexto de tinta no está al día; corre node diner/scripts/design-system/superficies.cjs'); process.exit(1) } }
else { fs.writeFileSync(TARGET, next); console.log(`bloque de contexto regenerado (${block.split('\n').length} líneas)`) }
