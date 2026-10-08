import { openEvents } from '@/lib/services/core/realtime'

class Source {
  static instances: Source[] = []
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  close = jest.fn()
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>()
  constructor(readonly url: string) { Source.instances.push(this) }
  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }
  emit(name: string, lastEventId = '') {
    for (const listener of this.listeners.get(name) ?? []) listener(new MessageEvent(name, { lastEventId }))
  }
}
const originalSource = global.EventSource
beforeEach(() => {
  jest.useFakeTimers()
  Source.instances = []
  global.EventSource = Source as unknown as typeof EventSource
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
})
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  global.EventSource = originalSource
})

// Falla si una suspensión o un fin de sesión abre otra conexión, conserva el bus vivo o sigue entregando eventos.
it.each(['session_expired', 'organization_suspended'])('%s termina el handle aunque después llegue un error', (terminal) => {
  const event = jest.fn()
  const state = jest.fn()
  const handle = openEvents(1, event, state)
  const source = Source.instances[0]
  source.onopen?.()
  source.emit(terminal)
  source.onerror?.()
  source.onopen?.()
  source.emit('orders', '2')
  jest.advanceTimersByTime(120_000)
  handle.close()
  expect(source.close).toHaveBeenCalledTimes(1)
  expect(Source.instances).toHaveLength(1)
  expect(state.mock.calls).toEqual([[true], [false]])
  expect(event).not.toHaveBeenCalled()
})

// Falla si un evento terminal ya recibido deja programado el reintento de un corte anterior.
it.each(['session_expired', 'organization_suspended'])('%s cancela un reintento pendiente', (terminal) => {
  const state = jest.fn()
  openEvents(1, jest.fn(), state)
  const source = Source.instances[0]
  source.onerror?.()
  source.emit(terminal)
  jest.advanceTimersByTime(120_000)
  expect(Source.instances).toHaveLength(1)
  expect(state).toHaveBeenLastCalledWith(false)
})

// Falla si un corte normal pierde eventos, reinicia el cursor o crea varias reconexiones para el mismo error.
it('un corte transitorio reconecta con el cursor mayor y sigue entregando cambios', () => {
  const event = jest.fn()
  const state = jest.fn()
  const handle = openEvents(9, event, state)
  const first = Source.instances[0]
  first.onopen?.()
  first.emit('orders', '14')
  first.emit('kitchen', '8')
  first.emit('notify', 'no-numérico')
  first.onerror?.()
  first.onerror?.()
  jest.advanceTimersByTime(999)
  expect(Source.instances).toHaveLength(1)
  jest.advanceTimersByTime(1)
  const second = Source.instances[1]
  expect(second.url).toBe('/experience/api/pos/v1/events?restaurant_id=9&org=burger-house&after=14')
  second.onopen?.()
  second.emit('tables', '17')
  second.emit('cash', '18')
  expect(event.mock.calls).toEqual([['orders'], ['kitchen'], ['notify'], ['tables'], ['cash']])
  expect(state.mock.calls).toEqual([[true], [false], [true]])
  expect(first.close).toHaveBeenCalledTimes(1)
  handle.close()
})

// Falla si una conexión anterior cerrada puede tumbar la nueva o hacerla reconectar con otro cursor u organización.
it('ignora callbacks de conexiones anteriores y conserva la organización del handle', () => {
  const event = jest.fn()
  const state = jest.fn()
  const handle = openEvents(1, event, state)
  const first = Source.instances[0]
  first.emit('orders', '7')
  first.onerror?.()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'frisby'
  jest.advanceTimersByTime(1_000)
  const second = Source.instances[1]
  second.onopen?.()
  first.emit('organization_suspended')
  first.emit('orders', '999')
  first.onerror?.()
  first.onopen?.()
  second.onerror?.()
  jest.advanceTimersByTime(1_000)
  expect(Source.instances).toHaveLength(3)
  expect(Source.instances[2].url).toContain('org=burger-house&after=7')
  expect(event).toHaveBeenCalledTimes(1)
  expect(state.mock.calls).toEqual([[false], [true], [false]])
  handle.close()
})

// Falla si cerrar manualmente deja un reintento o permite que callbacks tardíos marquen el bus como vivo.
it('el cierre manual cancela reintentos y es definitivo', () => {
  const state = jest.fn()
  const event = jest.fn()
  const handle = openEvents(1, event, state)
  const source = Source.instances[0]
  source.onerror?.()
  handle.close()
  handle.close()
  source.onopen?.()
  source.onerror?.()
  source.emit('orders', '1')
  jest.advanceTimersByTime(120_000)
  expect(Source.instances).toHaveLength(1)
  expect(event).not.toHaveBeenCalled()
  expect(state.mock.calls).toEqual([[false], [false]])
})

// Falla si los cortes repetidos ignoran la espera creciente o si una conexión recuperada no vuelve a la espera inicial.
it('aumenta la espera durante cortes y la reinicia cuando vuelve el bus', () => {
  const handle = openEvents(1, jest.fn(), jest.fn())
  Source.instances[0].onerror?.()
  jest.advanceTimersByTime(1_000)
  Source.instances[1].onerror?.()
  jest.advanceTimersByTime(1_999)
  expect(Source.instances).toHaveLength(2)
  jest.advanceTimersByTime(1)
  Source.instances[2].onopen?.()
  Source.instances[2].onerror?.()
  jest.advanceTimersByTime(1_000)
  expect(Source.instances).toHaveLength(4)
  handle.close()
})
