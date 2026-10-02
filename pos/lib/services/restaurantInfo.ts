import { onCore } from '@/lib/domain/backend'
import { toRestaurantInfo } from '@/lib/services/core/bridge'
import * as core from '@/lib/services/core/pos'
import { callKw } from '@/lib/services/odoo'

// Plan O: los datos del local viven en su punto de venta (`pos.config.waiter_*`); la empresa guarda los legales.
// `accessMargin` (plan P): minutos antes y después del turno en que un mesero o cajero de este local puede entrar.
export interface RestaurantInfo { id: number; name: string; street: string; city: string; phone: string; latitude: string; longitude: string; accessMargin: number }
const FIELDS = ['name', 'waiter_street', 'waiter_city', 'waiter_phone', 'waiter_latitude', 'waiter_longitude', 'waiter_access_margin_minutes']
type Raw = { id: number; name: string; waiter_access_margin_minutes?: number } & Record<'waiter_street' | 'waiter_city' | 'waiter_phone' | 'waiter_latitude' | 'waiter_longitude', string | false>

export async function getRestaurantInfo(configId: number): Promise<RestaurantInfo> {
  if (onCore()) {
    const found = (await core.listRestaurants()).find((r) => Number(r.id) === configId)
    if (!found) throw new Error('El restaurante ya no está disponible.')
    return toRestaurantInfo(found)
  }
  const [r] = await callKw<Raw[]>('pos.config', 'read', [[configId], FIELDS])
  return { id: r.id, name: r.name, street: r.waiter_street || '', city: r.waiter_city || '', phone: r.waiter_phone || '', latitude: r.waiter_latitude || '', longitude: r.waiter_longitude || '', accessMargin: r.waiter_access_margin_minutes ?? 30 }
}

export function saveRestaurantInfo(info: RestaurantInfo): Promise<void> {
  if (onCore()) return core.updateRestaurant(String(info.id), { name: info.name.trim(), street: info.street.trim(), city: info.city.trim(), phone: info.phone.trim(), latitude: info.latitude, longitude: info.longitude, access_margin_minutes: Math.max(0, Math.round(info.accessMargin)) }).then(() => undefined)
  return callKw('pos.config', 'write', [[info.id], { name: info.name.trim(), waiter_street: info.street.trim(), waiter_city: info.city.trim(),
    waiter_phone: info.phone.trim(), waiter_latitude: info.latitude, waiter_longitude: info.longitude,
    waiter_access_margin_minutes: Math.max(0, Math.round(info.accessMargin)) }])
}
