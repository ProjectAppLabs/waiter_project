import { toRestaurant } from '@/lib/services/core/bridge'
import * as core from '@/lib/services/core/pos'
import * as sales from '@/lib/services/core/sales'

export interface Restaurant { id: number; name: string; slug: string; street: string; city: string; phone: string; open: boolean; salesToday: number; ordersToday: number }

export async function listRestaurants(): Promise<Restaurant[]> {
  const rows = (await core.listRestaurants()).map(toRestaurant)
  // Plan T2: la tarjeta dice si la caja está abierta; una consulta por sede (son pocas).
  const open = await Promise.all(rows.map((r) => sales.openShift(r.id).catch(() => null)))
  return rows.map((r, i) => ({ ...r, open: open[i] !== null }))
}

// Solo el dueño: crea el restaurante de la organización.
export function createRestaurant(name: string, slug: string, copyFromId: number | null): Promise<{ id: number; slug: string }> {
  return core.createRestaurant({ name, slug }).then((r) => ({ id: Number(r.id), slug: r.slug }))
}
