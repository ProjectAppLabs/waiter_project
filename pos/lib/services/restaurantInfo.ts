import { toRestaurantInfo } from '@/lib/services/core/bridge'
import * as core from '@/lib/services/core/pos'

// Plan O: los datos del local viven en su restaurante; la empresa guarda los legales.
// `accessMargin` (plan P): minutos antes y después del turno en que un mesero o cajero de este local puede entrar.
export interface RestaurantInfo { id: number; name: string; street: string; city: string; phone: string; latitude: string; longitude: string; accessMargin: number }

export async function getRestaurantInfo(configId: number): Promise<RestaurantInfo> {
  const found = (await core.listRestaurants()).find((r) => Number(r.id) === configId)
  if (!found) throw new Error('El restaurante ya no está disponible.')
  return toRestaurantInfo(found)
}

export function saveRestaurantInfo(info: RestaurantInfo): Promise<void> {
  return core.updateRestaurant(String(info.id), { name: info.name.trim(), street: info.street.trim(), city: info.city.trim(), phone: info.phone.trim(), latitude: info.latitude, longitude: info.longitude, access_margin_minutes: Math.max(0, Math.round(info.accessMargin)) }).then(() => undefined)
}
