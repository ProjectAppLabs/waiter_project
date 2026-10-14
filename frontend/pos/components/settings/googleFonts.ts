import { FONTS } from '@/lib/domain/brand'

// Las seis familias de la marca (las mismas que carga diner/app/layout.tsx): el select y las vistas previas se
// pintan con la fuente real. Se añaden al montar el formulario (no en el layout) para que el resto del POS no
// descargue fuentes que no usa.
export const BRAND_FONTS_LINK_ID = 'waiter-brand-fonts'
export const BRAND_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Playfair+Display:wght@400;600&family=Fraunces:wght@400;600&family=DM+Serif+Display&family=Lora:wght@400;600&family=Cormorant+Garamond:wght@500;600&display=swap'

function appendLink(id: string, href: string) {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

export function loadBrandFonts() {
  appendLink(BRAND_FONTS_LINK_ID, BRAND_FONTS_URL)
}

// Fuentes que pide una plantilla (spec.fuentesGoogle) y que no están ni en la marca ni en el POS (Ubuntu).
export function loadTemplateFonts(families: readonly string[]) {
  const extra = families.filter((f) => f !== 'Ubuntu' && !(FONTS as readonly string[]).includes(f))
  if (extra.length === 0) return
  const query = extra.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')
  appendLink(`waiter-template-fonts-${extra.map((f) => f.toLowerCase().replace(/\s+/g, '-')).join('_')}`, `https://fonts.googleapis.com/css2?${query}&display=swap`)
}
