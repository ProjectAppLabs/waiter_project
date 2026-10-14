import { currentOrg } from '@/lib/domain/tenant'

export type CoreEvent = 'orders' | 'kitchen' | 'tables' | 'cash' | 'notify'
const EVENTS: CoreEvent[] = ['orders', 'kitchen', 'tables', 'cash', 'notify']
const TERMINAL_EVENTS = ['session_expired', 'organization_suspended']
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

export interface EventsHandle { close: () => void }

// `EventSource` manda la cookie del mismo origen; la organización viaja en la URL porque no admite cabeceras.
export function openEvents(restaurantId: number, onEvent: (event: CoreEvent) => void, onState: (up: boolean) => void): EventsHandle {
  let source: EventSource | null = null
  let latest: EventSource | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let tries = 0
  let closed = false
  let last = 0
  const organization = encodeURIComponent(currentOrg() ?? '')

  const close = () => {
    if (closed) return
    closed = true
    if (timer !== null) clearTimeout(timer)
    timer = null
    try { source?.close() } catch { /* ya cerrado */ }
    source = null
    latest = null
    onState(false)
  }

  const retry = () => {
    if (closed || timer !== null) return
    const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]
    tries += 1
    timer = setTimeout(() => { timer = null; connect() }, wait)
  }
  function connect() {
    if (closed || typeof EventSource === 'undefined') return
    let connected: EventSource
    try { connected = new EventSource(`/experience/api/pos/v1/events?restaurant_id=${restaurantId}&org=${organization}&after=${last}`) } catch { return retry() }
    source = connected
    latest = connected
    connected.onopen = () => { if (!closed && source === connected) { tries = 0; onState(true) } }
    for (const name of EVENTS) {
      connected.addEventListener(name, (e) => {
        if (closed || source !== connected) return
        const id = Number((e as MessageEvent).lastEventId)
        if (Number.isFinite(id) && id > last) last = id
        onEvent(name)
      })
    }
    // Son decisiones del servidor sobre el acceso: este handle termina y no intenta volver a entrar.
    for (const name of TERMINAL_EVENTS) connected.addEventListener(name, () => { if (latest === connected) close() })
    // El servidor cierra cada cinco minutos: el navegador reconectaría solo, pero con `after` del lado nuestro.
    connected.onerror = () => {
      if (closed || source !== connected) return
      try { connected.close() } catch { /* ya cerrado */ }
      source = null
      onState(false)
      retry()
    }
  }
  connect()
  return { close }
}
