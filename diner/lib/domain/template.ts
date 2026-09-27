import type { PreviewPayload, Template, TemplateFamily, TemplateSpec, TemplateTokens } from '@/lib/types'
import { designSystemVars } from './designSystem'
import { contrastRatio, readableText } from './contrast'

// Copia del contrato S1 del backend: disponible incluso antes de cargar la entrada.
export const DEFAULT_TEMPLATE: Template = {
  "codigo": "S1",
  "nombre": "Smart Menu",
  "familia": "B",
  "tokens": {
    "modo": "claro",
    "fondo": "#F8F8FA",
    "superficie": "#FFFFFF",
    "tinta": "#32324D",
    "tintaSuave": "#666687",
    "tintaTerciaria": "#FFB01D",
    "borde": "#EAEAEF",
    "acento": "#6755A0",
    "acentoTinta": "#FFFFFF",
    "acentoSuave": "#EEEBF5",
    "displayFont": "DM Sans",
    "displayPeso": 500,
    "displayTracking": "-0.025em",
    "displayTransform": "none",
    "cuerpoFont": "Mulish",
    "monoFont": "Mulish",
    "radioTarjeta": 16,
    "radioBoton": 16,
    "radioChip": 16,
    "densidad": "amplia"
  },
  "fotos": {
    "requiere": "todas",
    "recorte": "1x1"
  },
  "fuentesGoogle": [
    "DM Sans",
    "Mulish"
  ],
  "layouts": {
    "menu": "S1",
    "carrito": "smart",
    "pago": "smart",
    "registro": "banner5",
    "codigo": "casillas",
    "historial": "tarjetas"
  },
  "descuento": {
    "porcentaje": 5,
    "activo": true
  }
}

export const COLOR_TOKENS = ['fondo', 'superficie', 'tinta', 'tintaSuave', 'tintaTerciaria', 'borde', 'acento', 'acentoTinta', 'acentoSuave'] as const
type ColorToken = (typeof COLOR_TOKENS)[number]
const HEX = /^#[0-9a-f]{6}$/i
const FAMILIES: TemplateFamily[] = ['A', 'B', 'C', 'D', 'E', 'F']

const quote = (font: string) => `'${font.replace(/'/g, '')}'`

// Todos los tokens como variables CSS --t-*: se ponen en <main> y las utilidades de globals.css (bg-t-fondo, t-title…) las leen.
export function templateVars(t: Template): Record<string, string> {
  const k = t.tokens
  const surfaces = [k.fondo, k.superficie, k.acentoSuave]
  const highlightInk = accentTokens(k.tintaTerciaria, k.fondo).acentoTinta
  return {
    ...designSystemVars(t.tema),
    '--sm-highlight-ink': contrastRatio(highlightInk, k.tintaTerciaria) >= 4.5 ? highlightInk : '#000000',
    '--sm-highlight-text': readableText(k.tintaTerciaria, surfaces, k.tinta),
    '--sm-accent-text': readableText(k.acento, surfaces, k.tinta),
    '--sm-readable-muted': readableText(k.tintaSuave, surfaces, k.tinta),
    '--t-fondo': k.fondo, '--t-superficie': k.superficie, '--t-tinta': k.tinta, '--t-tinta-suave': k.tintaSuave, '--t-tinta-terciaria': k.tintaTerciaria,
    '--t-borde': k.borde, '--t-acento': k.acento, '--t-acento-tinta': k.acentoTinta, '--t-acento-suave': k.acentoSuave,
    '--t-display': `${quote(k.displayFont)}, system-ui, sans-serif`, '--t-display-peso': String(k.displayPeso), '--t-display-tracking': k.displayTracking, '--t-display-transform': k.displayTransform,
    '--t-cuerpo': `${quote(k.cuerpoFont)}, system-ui, sans-serif`, '--t-mono': `${quote(k.monoFont)}, ui-monospace, monospace`,
    '--t-radio-tarjeta': `${k.radioTarjeta}px`, '--t-radio-boton': `${k.radioBoton}px`, '--t-radio-chip': `${k.radioChip}px`,
  }
}

// "familia-B" → 'B'. Un layout que no nombra familia (o una desconocida) cae en la familia de la plantilla.
export function familyOf(layout: string | undefined, fallback: TemplateFamily): TemplateFamily {
  const code = (layout ?? '').replace(/^familia-/, '').toUpperCase()
  return (FAMILIES as string[]).includes(code) ? (code as TemplateFamily) : fallback
}

// Del catálogo público (spec sin resúmenes) a la forma que consume el motor. El descuento del catálogo es el genérico: la sede lo fija en el contexto.
export function templateFromSpec(spec: TemplateSpec, discount = DEFAULT_TEMPLATE.descuento): Template {
  const p = spec.pantallas
  return {
    codigo: spec.codigo, nombre: spec.nombre, familia: spec.familia, tokens: { ...spec.tokens }, fotos: { ...spec.fotos },
    layouts: { menu: p.menu.layout, carrito: p.carrito.layout, pago: p.pago.layout, registro: p.registro.patron, codigo: p.codigo.patron, historial: p.historial.patron },
    fuentesGoogle: [...(spec.fuentesGoogle ?? [])],
    descuento: { ...discount },
  }
}

// base64url → texto UTF-8. Sin Buffer: corre en el navegador y en jsdom.
function decodeBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  return decodeURIComponent(Array.from(bin, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
}
export function encodePreview(payload: PreviewPayload): string {
  const utf8 = encodeURIComponent(JSON.stringify(payload)).replace(/%([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ?vista_previa=<base64url JSON {plantilla, paleta, tipografia}>. Nada, vacío o corrupto → null (se pinta lo guardado).
export function parsePreview(raw: string | null | undefined): PreviewPayload | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(decodeBase64Url(raw))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const d = data as Record<string, unknown>
    const out: PreviewPayload = {}
    if (typeof d.plantilla === 'string' && d.plantilla.trim()) out.plantilla = d.plantilla.trim().toUpperCase()
    if (d.paleta && typeof d.paleta === 'object' && !Array.isArray(d.paleta)) {
      const paleta: Record<string, string> = {}
      for (const [key, val] of Object.entries(d.paleta as Record<string, unknown>)) if (typeof val === 'string') paleta[key] = val
      out.paleta = paleta
    }
    const tipo = d.tipografia as Record<string, unknown> | undefined
    if (tipo && typeof tipo === 'object' && typeof tipo.display === 'string' && tipo.display.trim()) out.tipografia = { display: tipo.display.trim() }
    return out
  } catch {
    return null
  }
}


function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
function accentTokens(accent: string, background: string) {
  const l = luminance(accent), ink = luminance('#1A1815')
  const whiteRatio = 1.05 / (l + .05), inkRatio = (Math.max(l, ink) + .05) / (Math.min(l, ink) + .05)
  const roundEven = (v: number) => v % 1 === .5 ? 2 * Math.round(v / 2) : Math.round(v)
  const soft = '#' + [1, 3, 5].map((i) => {
    const a = parseInt(accent.slice(i, i + 2), 16), b = parseInt(background.slice(i, i + 2), 16)
    return roundEven(b + (a - b) * .1).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
  return { acentoTinta: whiteRatio >= inkRatio ? '#FFFFFF' : '#1A1815', acentoSuave: soft }
}

// Aplica la paleta (solo tokens de color, solo hex válidos) y la tipografía de títulos sobre una plantilla del catálogo.
export function applyPreview(base: Template, preview: PreviewPayload): Template {
  const tokens: TemplateTokens = { ...base.tokens }
  for (const [key, val] of Object.entries(preview.paleta ?? {})) {
    if ((COLOR_TOKENS as readonly string[]).includes(key) && HEX.test(val)) tokens[key as ColorToken] = val.toUpperCase()
  }
  if ((preview.paleta?.acento && HEX.test(preview.paleta.acento)) || (preview.paleta?.fondo && HEX.test(preview.paleta.fondo))) Object.assign(tokens, accentTokens(tokens.acento, tokens.fondo))
  const fonts = [...base.fuentesGoogle]
  const display = preview.tipografia?.display
  if (display) { tokens.displayFont = display; if (base.codigo === 'S1') { tokens.cuerpoFont = display === 'DM Sans' ? 'Mulish' : display; tokens.monoFont = tokens.cuerpoFont } if (!fonts.includes(display)) fonts.push(display) }
  return { ...base, tokens, fuentesGoogle: fonts }
}

// Vista previa completa: resuelve el código pedido contra el catálogo (para previsualizar cualquiera de las 30) y aplica
// paleta/tipografía sobre sus tokens. Sin código (o desconocido) parte de `current`. Sin parámetro → null.
export function previewOverride(searchParams: URLSearchParams | string | null | undefined, catalog: TemplateSpec[], current: Template): Template | null {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams
  const payload = parsePreview(params?.get('vista_previa'))
  if (!payload) return null
  const spec = payload.plantilla ? catalog.find((s) => s.codigo === payload.plantilla) : undefined
  const base = spec ? templateFromSpec(spec, current.descuento) : current
  return applyPreview(base, payload)
}

// Fuentes que ya carga app/layout.tsx (las de Waiter y las seis de marca): no se vuelven a pedir.
export const PRELOADED_FONTS = ['Ubuntu', 'IBM Plex Mono', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'DM Serif Display', 'Lora', 'Cormorant Garamond']
const slug = (font: string) => font.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const googleFontHref = (font: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`

// Qué pedir a Google Fonts para una plantilla: sus fuentesGoogle más las tres familias de sus tokens, sin las ya cargadas.
export function fontsToLoad(t: Template): string[] {
  const all = [...t.fuentesGoogle, t.tokens.displayFont, t.tokens.cuerpoFont, t.tokens.monoFont].map((f) => f.trim()).filter(Boolean)
  return Array.from(new Set(all)).filter((f) => !PRELOADED_FONTS.includes(f))
}

// Un <link> por familia, una sola vez por página (id estable). Devuelve las familias que añadió.
export function loadGoogleFonts(fonts: string[], doc: Document | undefined = typeof document === 'undefined' ? undefined : document): string[] {
  if (!doc) return []
  const added: string[] = []
  for (const font of Array.from(new Set(fonts))) {
    const id = `gf-${slug(font)}`
    if (doc.getElementById(id)) continue
    const link = doc.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = googleFontHref(font)
    doc.head.appendChild(link)
    added.push(font)
  }
  return added
}
// Nombre del contrato 4: carga las fuentes de la plantilla.
export const applyGoogleFonts = (t: Template, doc?: Document) => loadGoogleFonts(fontsToLoad(t), doc)

// Iniciales para el avatar de Mi cuenta ("Camila Ruiz" → "CR").
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
