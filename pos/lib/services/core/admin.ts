import { coreFetch } from '@/lib/services/core/http'
import { useAuthStore } from '@/lib/stores/authStore'

export function adminCall<T>(gateway: 'menu_settings' | 'menu_decorations' | 'mcp_keys' | 'payment_gateways', body: Record<string, unknown>): Promise<T> {
  const restaurant = useAuthStore.getState().restaurant ?? useAuthStore.getState().restaurants?.[0] ?? null
  return coreFetch<T>(`admin/${gateway}`, { method: 'POST', body: { ...body, ...(restaurant && { restaurant_id: restaurant.id }) } })
}
