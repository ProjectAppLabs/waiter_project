import { onCore } from '@/lib/domain/backend'
import { toRestaurant } from '@/lib/services/core/bridge'
import * as core from '@/lib/services/core/pos'
import { callKw } from '@/lib/services/odoo'
import { OdooError } from '@/lib/services/errors'

// Plan O: los restaurantes de la organización que esta cuenta opera (el dueño, todos; el encargado, los suyos; mesero y
// cajero, el suyo). Viene de `pos.config.waiter_restaurants` (addon projectapp_ops ≥ 19.0.2.5.0).
export interface Restaurant { id: number; name: string; slug: string; street: string; city: string; phone: string; open: boolean; salesToday: number; ordersToday: number }

// Con un addon anterior al plan O el método no existe: se leen los puntos de venta visibles, que es lo que había.
export async function listRestaurants(): Promise<Restaurant[]> {
  if (onCore()) return (await core.listRestaurants()).map(toRestaurant)
  try {
    return await callKw<Restaurant[]>('pos.config', 'waiter_restaurants', [])
  } catch (e) {
    if (!(e instanceof OdooError) || !/waiter_restaurants/.test(e.message)) throw e
    const rows = await callKw<{ id: number; name: string }[]>('pos.config', 'search_read', [[], ['name']], { order: 'id asc' })
    return rows.map((r) => ({ id: r.id, name: r.name, slug: '', street: '', city: '', phone: '', open: false, salesToday: 0, ordersToday: 0 }))
  }
}

// Solo el dueño: crea el punto de venta con su almacén, su efectivo y un piso, y copia los ajustes de `copyFromId`.
export function createRestaurant(name: string, slug: string, copyFromId: number | null): Promise<{ id: number; slug: string }> {
  // Plan T: en el sistema propio el restaurante nace con lo básico; copiar ajustes de otro llega con T2 (caja y pagos).
  if (onCore()) return core.createRestaurant({ name, slug }).then((r) => ({ id: Number(r.id), slug: r.slug }))
  return callKw<{ id: number; slug: string }>('pos.config', 'waiter_create_restaurant', [name, slug, copyFromId ?? false])
}
