import { coreFetch } from '@/lib/services/core/http'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan T5: la administración del menú (plantilla, decoraciones, claves MCP y pasarelas) en el sistema propio. Las rutas
// copian la firma de los controladores de Odoo `/waiter/admin/*`: mismo cuerpo `{action, …}` y misma respuesta.
export function adminCall<T>(gateway: 'menu_settings' | 'menu_decorations' | 'mcp_keys' | 'payment_gateways', body: Record<string, unknown>): Promise<T> {
  const restaurant = useAuthStore.getState().restaurant ?? useAuthStore.getState().restaurants?.[0] ?? null
  return coreFetch<T>(`admin/${gateway}`, { method: 'POST', body: { ...body, ...(restaurant && { restaurant_id: restaurant.id }) } })
}
