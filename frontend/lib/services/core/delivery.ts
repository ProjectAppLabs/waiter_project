import { coreFetch } from '@/lib/services/core/http'

// Plan D: domicilios por sede (contrato en docs/planes/2026-10-09-plan-D-domicilios.md, «Servidor (Codex)»).
export type DeliveryMethod = 'online' | 'cash' | 'card_on_delivery'
export interface DeliveryTier { up_to_km: number; fee: number }
// Cómo se cobra el envío: por distancia (tramos), tarifa fija o gratis; «gratis desde» un valor de platos (0 = no) y un
// recargo en los platos a domicilio (para ofrecer envío gratis).
export type FeeMode = 'distance' | 'flat' | 'free'
export interface DeliverySettings { enabled: boolean; radius_km: number; tiers: DeliveryTier[]; min_order: number; methods: DeliveryMethod[]; notes: string
  fee_mode: FeeMode; flat_fee: number; free_from: number; markup_percent: number }
export interface RestaurantDelivery { restaurant_id: number; name: string; has_location: boolean; settings: DeliverySettings }

// El servidor manda el dinero y las distancias como texto decimal; la pantalla trabaja con números.
const num = (v: unknown) => Number(v ?? 0)
const toSettings = (s: DeliverySettings): DeliverySettings => ({
  enabled: !!s.enabled, radius_km: num(s.radius_km), min_order: num(s.min_order), methods: s.methods ?? [], notes: s.notes ?? '',
  fee_mode: s.fee_mode ?? 'distance', flat_fee: num(s.flat_fee), free_from: num(s.free_from), markup_percent: num(s.markup_percent),
  tiers: (s.tiers ?? []).map((t) => ({ up_to_km: num(t.up_to_km), fee: num(t.fee) })),
})

export const deliverySettings = () => coreFetch<{ restaurants: RestaurantDelivery[] }>('delivery/settings')
  .then((r) => r.restaurants.map((x) => ({ ...x, settings: toSettings(x.settings) })))
export const saveDeliverySettings = (restaurantId: number, settings: DeliverySettings) =>
  coreFetch<{ settings: DeliverySettings }>(`delivery/settings/${restaurantId}`, { method: 'PUT', body: settings }).then((r) => toSettings(r.settings))
