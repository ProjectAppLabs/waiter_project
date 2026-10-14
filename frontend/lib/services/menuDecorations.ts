import { adminCall } from '@/lib/services/core/admin'
import { EXPERIENCE_PROXY } from '@/lib/services/menuTemplates'

export interface MenuDecoration { id: string; nombre: string; tipo: string; ancho: number; alto: number; peso: number; archivo: string; creada: string }
export interface FactoryDecoration { id: string; nombre: string; archivo: string }
export interface DecorationLimits { peso: number; lado: number; cantidad: number }
export interface MenuDecorationList { decoraciones: MenuDecoration[]; fabrica: FactoryDecoration[]; limites: DecorationLimits; experienceUrl: string }
export const listMenuDecorations = () => (adminCall<MenuDecorationList>('menu_decorations', { action: 'list' }))
export const addMenuDecoration = (nombre: string, imagen: string) => (adminCall<MenuDecoration>('menu_decorations', { action: 'add', nombre, imagen }))
export const removeMenuDecoration = (decoracionId: string) => (adminCall<{ eliminada: string }>('menu_decorations', { action: 'remove', decoracion_id: decoracionId }))

export const DECORATION_TYPES = ['image/png', 'image/webp']
// La imagen que sirve experience, por el proxy del POS: `archivo` llega relativa al origen de experience.
export const decorationUrl = (archivo: string) => `${EXPERIENCE_PROXY}${archivo}`

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
