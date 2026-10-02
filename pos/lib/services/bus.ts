import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { openEvents } from '@/lib/services/core/realtime'

export type BusEvent = 'kitchen' | 'orders' | 'notify'

export interface BusHandle { close: () => void }

// Abre la conexión y llama a `onEvent` por cada aviso. `onState` dice si el bus está vivo, para que
// quien sondea afloje el ritmo mientras lo esté. Reconecta con espera creciente; nunca lanza.
export function openBus(onEvent: (event: BusEvent) => void, onState: (up: boolean) => void): BusHandle {
  // Plan T2: en el sistema propio los avisos llegan por SSE con los mismos nombres (las mesas cuentan como pedidos).
  const r = currentRestaurantId()
  if (r === null) return { close: () => undefined }
  return openEvents(r, (e) => onEvent(e === 'tables' ? 'orders' : e === 'cash' ? 'notify' : e), onState)
}
