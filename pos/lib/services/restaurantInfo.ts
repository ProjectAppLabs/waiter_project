import { callKw } from '@/lib/services/odoo'

// Plan O: los datos del local viven en su punto de venta (`pos.config.waiter_*`); la empresa guarda los legales.
export interface RestaurantInfo { id: number; name: string; street: string; city: string; phone: string; latitude: string; longitude: string }
const FIELDS = ['name', 'waiter_street', 'waiter_city', 'waiter_phone', 'waiter_latitude', 'waiter_longitude']
type Raw = { id: number; name: string } & Record<'waiter_street' | 'waiter_city' | 'waiter_phone' | 'waiter_latitude' | 'waiter_longitude', string | false>

export async function getRestaurantInfo(configId: number): Promise<RestaurantInfo> {
  const [r] = await callKw<Raw[]>('pos.config', 'read', [[configId], FIELDS])
  return { id: r.id, name: r.name, street: r.waiter_street || '', city: r.waiter_city || '', phone: r.waiter_phone || '', latitude: r.waiter_latitude || '', longitude: r.waiter_longitude || '' }
}

export function saveRestaurantInfo(info: RestaurantInfo): Promise<void> {
  return callKw('pos.config', 'write', [[info.id], { name: info.name.trim(), waiter_street: info.street.trim(), waiter_city: info.city.trim(),
    waiter_phone: info.phone.trim(), waiter_latitude: info.latitude, waiter_longitude: info.longitude }])
}
