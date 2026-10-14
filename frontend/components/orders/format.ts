import { imageUrl } from '@/lib/services/pantry'
import { orderDate } from '@/lib/domain/orderState'

// "lun, 17 feb, 3:43 p. m." — la fecha corta de las tarjetas del kit, en español y en la hora del dispositivo.
export function formatOrderDate(at: string): string {
  return orderDate(at).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

// "lun, 17 feb" y "3:43 p. m." por separado (panel de la cuenta en Historial).
export function formatOrderDay(at: string): string {
  return orderDate(at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}
export function formatOrderTime(at: string): string {
  return orderDate(at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export const productImage = (productId: number) => imageUrl(productId)
export const templateImage = (templateId: number) => imageUrl(templateId)
