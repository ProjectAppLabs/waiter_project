import { onCore } from '@/lib/domain/backend'
import { openEvents } from '@/lib/services/core/realtime'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { callKw } from '@/lib/services/odoo'

// Avisos en vivo por el bus de Odoo (addon projectapp_bus). El servidor dice qué cambió y la tablet
// vuelve a leer; el aviso no trae datos. Si el bus no levanta, quien lo usa sigue sondeando: esto
// acelera, no es un requisito.
export type BusEvent = 'kitchen' | 'orders' | 'notify'
export interface BusInfo { version: string; channels: string[] }

// La versión del handshake la fija Odoo y cambia entre versiones: se pregunta, no se escribe aquí.
export const getBusInfo = (): Promise<BusInfo> => (onCore() ? Promise.resolve({ version: 'sse', channels: ['sse'] }) : callKw<BusInfo>('waiter.bus', 'waiter_bus_info', []))

// Mismo origen: el websocket sube por el proxy de Next, así que la cookie de sesión viaja sin
// depender de la política SameSite del navegador ni de dónde esté Odoo.
const url = (version: string) => {
  const { protocol, host } = window.location
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/odoo/websocket?version=${encodeURIComponent(version)}`
}

interface Raw { id?: number; message?: { type?: string; payload?: { event?: BusEvent } } }
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

export interface BusHandle { close: () => void }

// Abre la conexión y llama a `onEvent` por cada aviso. `onState` dice si el bus está vivo, para que
// quien sondea afloje el ritmo mientras lo esté. Reconecta con espera creciente; nunca lanza.
export function openBus(onEvent: (event: BusEvent) => void, onState: (up: boolean) => void): BusHandle {
  // Plan T2: en el sistema propio los avisos llegan por SSE con los mismos nombres (las mesas cuentan como pedidos).
  if (onCore()) {
    const r = currentRestaurantId()
    if (r === null) return { close: () => undefined }
    return openEvents(r, (e) => onEvent(e === 'tables' ? 'orders' : e === 'cash' ? 'notify' : e), onState)
  }
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let tries = 0
  let closed = false
  // Odoo reenvía lo de los últimos 50 s a quien se suscribe con `last: 0`. Recordar el último id visto
  // evita que cada reconexión repita media docena de avisos ya atendidos.
  let last = 0

  const retry = () => {
    if (closed) return
    const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]
    tries += 1
    timer = setTimeout(() => { void connect() }, wait)
  }

  async function connect(): Promise<void> {
    if (closed) return
    let info: BusInfo
    try { info = await getBusInfo() } catch { return retry() }
    if (closed || info.channels.length === 0) return closed ? undefined : retry()
    try { ws = new WebSocket(url(info.version)) } catch { return retry() }
    ws.onopen = () => {
      tries = 0
      onState(true)
      ws?.send(JSON.stringify({ event_name: 'subscribe', data: { channels: info.channels, last } }))
    }
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(String(e.data)) as Raw | Raw[]
        const rows = Array.isArray(parsed) ? parsed : [parsed]
        rows.forEach((r) => {
          if (typeof r.id === 'number' && r.id > last) last = r.id
          if (r.message?.type === 'waiter' && r.message.payload?.event) onEvent(r.message.payload.event)
        })
      } catch { /* un mensaje ilegible no tumba la conexión */ }
    }
    ws.onclose = () => { ws = null; onState(false); retry() }
    ws.onerror = () => { try { ws?.close() } catch { /* ya cerrado */ } }
  }

  void connect()
  return {
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      onState(false)
      try { ws?.close() } catch { /* ya cerrado */ }
    },
  }
}
