import { currentOrg } from '@/lib/domain/tenant'

export type CoreEvent = 'orders' | 'kitchen' | 'tables' | 'cash' | 'notify'
const EVENTS: CoreEvent[] = ['orders', 'kitchen', 'tables', 'cash', 'notify']
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

export interface EventsHandle { close: () => void }

// `EventSource` manda la cookie del mismo origen; la organización viaja en la URL porque no admite cabeceras.
export function openEvents(restaurantId: number, onEvent: (event: CoreEvent) => void, onState: (up: boolean) => void): EventsHandle {
  let source: EventSource | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let tries = 0
  let closed = false
  let last = 0

  const retry = () => {
    if (closed) return
    const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)]
    tries += 1
    timer = setTimeout(connect, wait)
  }
  function connect() {
    if (closed || typeof EventSource === 'undefined') return
    try { source = new EventSource(`/experience/api/pos/v1/events?restaurant_id=${restaurantId}&org=${currentOrg()}&after=${last}`) } catch { return retry() }
    source.onopen = () => { tries = 0; onState(true) }
    for (const name of EVENTS) {
      source.addEventListener(name, (e) => {
        const id = Number((e as MessageEvent).lastEventId)
        if (Number.isFinite(id) && id > last) last = id
        onEvent(name)
      })
    }
    // El servidor cierra cada cinco minutos: el navegador reconectaría solo, pero con `after` del lado nuestro.
    source.onerror = () => { try { source?.close() } catch { /* ya cerrado */ } source = null; onState(false); retry() }
  }
  connect()
  return {
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      onState(false)
      try { source?.close() } catch { /* ya cerrado */ }
    },
  }
}
