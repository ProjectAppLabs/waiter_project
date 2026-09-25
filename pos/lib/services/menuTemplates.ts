import { jsonRpc } from '@/lib/services/odoo'

// Plantilla del menú (Plan H, Contrato 5). El catálogo es público y vive en experience (módulo 3); la elección
// por sede se escribe por la pasarela del addon (/waiter/admin/menu_settings), que reenvía a experience con la
// clave interna. Así el navegador nunca ve la clave y la autorización es la del gerente del POS en Odoo.

export type Family = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type PhotoNeed = 'ninguna' | 'algunas' | 'todas' | 'hero'
// Tokens de color de una plantilla (Contrato 1). personalizable.colores solo puede nombrar estos.
export type ColorToken = 'fondo' | 'superficie' | 'tinta' | 'tintaSuave' | 'tintaTerciaria' | 'borde' | 'acento' | 'acentoTinta' | 'acentoSuave'
export const COLOR_TOKENS: readonly ColorToken[] = ['fondo', 'superficie', 'tinta', 'tintaSuave', 'tintaTerciaria', 'borde', 'acento', 'acentoTinta', 'acentoSuave']

export interface TemplateTokens extends Record<ColorToken, string> {
  modo: 'claro' | 'oscuro'
  displayFont: string
  displayPeso: number
  displayTracking: string
  displayTransform: 'none' | 'uppercase'
  cuerpoFont: string
  monoFont: string
  radioTarjeta: number
  radioBoton: number
  radioChip: number
  densidad: 'compacta' | 'media' | 'amplia'
}

export interface TemplateSpec {
  codigo: string
  nombre: string
  familia: Family
  familiaNombre: string
  descripcion: string
  fotos: { requiere: PhotoNeed; recorte: string }
  tokens: TemplateTokens
  personalizable: { colores: ColorToken[]; tipografiaDisplay: boolean; logo: boolean }
  // Ruta relativa a experienceUrl (/api/v1/plantillas/<codigo>/miniatura/).
  miniatura: string
  fuentesGoogle: string[]
}

export interface TemplateCatalog { familias: Record<Family, string>; plantillas: TemplateSpec[] }

// Ajustes crudos de la sede: solo lo que el restaurante pisó. Un color ausente en paleta usa el de la
// plantilla (o el de la marca del Plan G); lo mismo con tipografia.display.
export interface MenuSettings { plantilla: string; paleta: Partial<Record<ColorToken, string>>; tipografia: { display?: string } }
export interface MenuSettingsContext { restaurante: string; sede: string; experienceUrl: string; dinerUrl: string; ajustes: MenuSettings }
// Lo que devuelve 'set': la plantilla resuelta (código + tokens finales) tal como la verá el comensal.
export interface ResolvedTemplate { codigo: string; nombre: string; familia: Family; tokens: TemplateTokens }
export interface MenuDraft { borrador: string; caduca: string; url: string; vista_previa: { campo: string; antes: unknown; despues: unknown }[] }

export const DEFAULT_TEMPLATE = 'S1'
const GATEWAY_PATH = '/waiter/admin/menu_settings'

export function gateway(action: 'get'): Promise<MenuSettingsContext>
export function gateway(action: 'set', payload: MenuSettings): Promise<ResolvedTemplate>
export function gateway(action: 'preview', payload: MenuSettings): Promise<MenuDraft>
export function gateway(action: 'get' | 'set' | 'preview', payload: Partial<MenuSettings> = {}): Promise<MenuSettingsContext | ResolvedTemplate | MenuDraft> {
  return jsonRpc<MenuSettingsContext | ResolvedTemplate | MenuDraft>(GATEWAY_PATH, { action, ...payload })
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

// Catálogo público de experience: no pasa por Odoo ni necesita sesión.
export async function listTemplates(experienceUrl: string, restaurante?: string, sede?: string): Promise<TemplateCatalog> {
  const res = await fetch(trimSlash(experienceUrl) + '/api/v1/plantillas/' + (restaurante && sede ? '?' + new URLSearchParams({ restaurante, sede }) : ''))
  if (!res.ok) throw new Error(`plantillas: HTTP ${res.status}`)
  return (await res.json()) as TemplateCatalog
}

// Solo viaja el token de lectura; el tema validado se obtiene de experience al abrir el enlace.
export function previewUrl(dinerUrl: string, restaurante: string, sede: string, token: string): string {
  return `${trimSlash(dinerUrl)}/${encodeURIComponent(restaurante)}/${encodeURIComponent(sede)}/carta?borrador=${encodeURIComponent(token)}`
}
