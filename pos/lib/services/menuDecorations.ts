import { jsonRpc } from '@/lib/services/odoo'

// Galería de decoraciones del menú (Plan K4). El POS pasa por la pasarela del addon (/waiter/admin/menu_decorations),
// que exige administrador del POS y toma la sede de Odoo; las imágenes las guarda y sirve experience por id.
export interface MenuDecoration { id: string; nombre: string; tipo: string; ancho: number; alto: number; peso: number; archivo: string; creada: string }
export interface FactoryDecoration { id: string; nombre: string; archivo: string }
export interface DecorationLimits { peso: number; lado: number; cantidad: number }
export interface MenuDecorationList { decoraciones: MenuDecoration[]; fabrica: FactoryDecoration[]; limites: DecorationLimits; experienceUrl: string }

const PATH = '/waiter/admin/menu_decorations'
export const listMenuDecorations = () => jsonRpc<MenuDecorationList>(PATH, { action: 'list' })
export const addMenuDecoration = (nombre: string, imagen: string) => jsonRpc<MenuDecoration>(PATH, { action: 'add', nombre, imagen })
export const removeMenuDecoration = (decoracionId: string) => jsonRpc<{ eliminada: string }>(PATH, { action: 'remove', decoracion_id: decoracionId })

export const DECORATION_TYPES = ['image/png', 'image/webp']
// URL absoluta de la imagen que sirve experience: `archivo` llega relativa a su origen.
export const decorationUrl = (experienceUrl: string, archivo: string) => `${experienceUrl.replace(/\/+$/, '')}${archivo}`

// Lee el archivo como data URL (lo que acepta la galería) tras comprobar tipo y peso en el navegador.
export function readDecoration(file: File, limits: DecorationLimits): Promise<string> {
  if (!DECORATION_TYPES.includes(file.type)) return Promise.reject(new Error('tipo'))
  if (file.size > limits.peso) return Promise.reject(new Error('peso'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('lectura'))
    reader.readAsDataURL(file)
  })
}
