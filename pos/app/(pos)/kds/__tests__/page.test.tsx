import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import KdsPage from '@/app/(pos)/kds/page'
import { messages } from '@/lib/i18n/messages'
import type { KitchenTicket } from '@/lib/services/kitchen'
import { useAuthStore } from '@/lib/stores/authStore'
import { useBusStore } from '@/lib/stores/busStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useKitchenStore } from '@/lib/stores/kitchenStore'

// La cabecera, las tarjetas, la lista de listos y el pie tienen sus propias pruebas; aquí basta ver qué reciben.
jest.mock('@/components/kds/KdsHeader', () => ({
  KdsHeader: ({ tabs, counts, onTab }: { tabs: string[]; counts: Record<string, number>; onTab: (t: string) => void }) => (
    <nav aria-label="Estaciones">{tabs.map((t) => <button key={t} type="button" onClick={() => onTab(t)}>{`${t} (${counts[t] ?? 0})`}</button>)}</nav>
  ),
}))
jest.mock('@/components/kds/TicketCard', () => ({
  TicketCard: ({ ticket, tableNumber, onStart, onReady, onReadyDish }: { ticket: KitchenTicket; tableNumber: number; onStart: (id: number) => void; onReady: (id: number) => void; onReadyDish: (id: number) => void }) => (
    <article aria-label={`Comanda ${ticket.tracking}`}>
      <span>{`Mesa ${tableNumber}`}</span>
      <button type="button" onClick={() => onStart(ticket.id)}>Iniciar</button>
      <button type="button" onClick={() => onReady(ticket.id)}>Listo todo</button>
      <button type="button" onClick={() => onReadyDish(ticket.lines[0].id)}>Listo plato</button>
    </article>
  ),
}))
jest.mock('@/components/kds/ReadyList', () => ({
  ReadyList: ({ tickets, tableNumberOf }: { tickets: KitchenTicket[]; tableNumberOf: (id: number) => number }) => (
    <ul aria-label="Listos por entregar">{tickets.map((t) => <li key={t.id}>{`${t.tracking} · mesa ${tableNumberOf(t.tableId)}`}</li>)}</ul>
  ),
}))
jest.mock('@/components/kds/KdsFooter', () => ({ KdsFooter: () => null }))

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const ticket = (id: number, over: Partial<KitchenTicket> = {}): KitchenTicket => ({ id, orderId: id, tableId: 7, tracking: `DI00${id}`, waiter: 'Ana', note: '', firedAt: ago(1), readyAt: null,
  lines: [{ id: id * 10, name: 'Hamburguesa', qty: 1, note: '', station: 'Parrilla', readyAt: null, servedAt: null }], ...over })

const refresh = jest.fn(async () => undefined)
const start = jest.fn(async () => undefined)
const ready = jest.fn(async () => undefined)
const readyDish = jest.fn(async () => undefined)
const busStart = jest.fn()
const busRelease = jest.fn()
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><KdsPage /></NextIntlClientProvider>)

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ session: { id: 55, configId: 4, state: 'opened' } })
  useCatalogStore.setState({ catalog: { tables: [{ id: 7, number: 12 }], categories: [{ id: 1, station: null }, { id: 2, station: 'Bar' }], products: [{ id: 300, categoryIds: [1, 2] }, { id: 301, categoryIds: [1] }] } as never })
  useBusStore.setState({ up: false, ticks: { kitchen: 0, orders: 0, notify: 0 }, start: busStart, release: busRelease })
  useKitchenStore.setState({ tickets: [], done: [], tab: 'all', muted: false, error: null, primed: true, refresh, start, ready, readyDish, tick: jest.fn() })
})
afterEach(() => jest.useRealTimers())

// Falla si la pantalla de cocina no abre el bus ella misma (no tiene armazón) o no lo suelta al salir: la cocina dejaría
// de recibir comandas al instante o la conexión quedaría abierta para siempre.
it('abre el bus al montar y lo suelta al salir', () => {
  const { unmount } = wrap()
  expect(busStart).toHaveBeenCalledTimes(1)
  unmount()
  expect(busRelease).toHaveBeenCalledTimes(1)
})

// Falla si sin caja abierta la cocina consulta comandas o pinta algo, o si con caja la consulta no va con esa sesión y
// la estación de cada plato (la de su primera categoría que tenga una).
it('consulta las comandas de la sesión con la estación de cada plato', async () => {
  useAuthStore.setState({ session: null })
  const { container, unmount } = wrap()
  expect(container).toBeEmptyDOMElement()
  expect(refresh).not.toHaveBeenCalled()
  unmount()
  useAuthStore.setState({ session: { id: 55, configId: 4, state: 'opened' } })
  wrap()
  await waitFor(() => expect(refresh).toHaveBeenCalledWith(55, expect.any(Function)))
  const stationOf = (refresh.mock.calls[0] as unknown as [number, (id: number) => string | null])[1]
  expect(stationOf(300)).toBe('Bar')
  expect(stationOf(301)).toBeNull()
  expect(stationOf(999)).toBeNull()
})

// Falla si el sondeo no es de 5 s sin bus (la cocina tardaría en ver comandas nuevas) o si con el bus vivo sigue
// martillando el servidor cada 5 s en vez de cada minuto.
it('sondea cada 5 s sin bus y cada minuto con el bus vivo', () => {
  jest.useFakeTimers()
  const { unmount } = wrap()
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(5_000) })
  expect(refresh).toHaveBeenCalledTimes(2)
  unmount()
  refresh.mockClear()
  useBusStore.setState({ up: true })
  wrap()
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(30_000) })
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(30_000) })
  expect(refresh).toHaveBeenCalledTimes(2)
})

// Falla si un aviso del bus (comanda nueva del salón) no relee las comandas enseguida y espera al siguiente sondeo.
it('un aviso de cocina del bus relee al instante', async () => {
  useBusStore.setState({ up: true })
  wrap()
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  act(() => useBusStore.setState({ ticks: { kitchen: 1, orders: 0, notify: 0 } }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  act(() => useBusStore.setState({ ticks: { kitchen: 1, orders: 1, notify: 0 } }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3))
})

// Falla si mientras carga se dice «sin comandas» (la cocina creería que no hay nada), o si cargado y vacío no lo dice.
it('mientras carga no dice que no hay comandas', () => {
  useKitchenStore.setState({ primed: false })
  const { unmount } = wrap()
  expect(screen.queryByText('Sin comandas en preparación')).toBeNull()
  unmount()
  useKitchenStore.setState({ primed: true })
  wrap()
  expect(screen.getByText('Sin comandas en preparación')).toBeInTheDocument()
})

// Falla si una comanda con un plato aún en el fuego sale de «en preparación», si una ya lista no pasa a «listos por
// entregar», si una entregada sigue apareciendo, o si la tarjeta no lleva el número de mesa del plano.
it('separa lo que está en el fuego de lo listo por entregar', () => {
  const partial = ticket(1, { lines: [
    { id: 10, name: 'Hamburguesa', qty: 1, note: '', station: 'Parrilla', readyAt: ago(1), servedAt: null },
    { id: 11, name: 'Limonada', qty: 1, note: '', station: 'Bar', readyAt: null, servedAt: null },
  ] })
  const allReady = ticket(2, { lines: [{ id: 20, name: 'Perro', qty: 1, note: '', station: 'Parrilla', readyAt: ago(1), servedAt: null }] })
  const served = ticket(3, { lines: [{ id: 30, name: 'Papas', qty: 1, note: '', station: 'Parrilla', readyAt: ago(2), servedAt: ago(1) }] })
  useKitchenStore.setState({ tickets: [partial, allReady, served] })
  wrap()
  const grid = screen.getByRole('region', { name: 'Comandas en preparación' })
  expect(within(grid).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Comanda DI001'])
  expect(within(grid).getByText('Mesa 12')).toBeInTheDocument()
  const readyList = screen.getByRole('list', { name: 'Listos por entregar' })
  expect(within(readyList).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['DI001 · mesa 12', 'DI002 · mesa 12'])
})

// Falla si filtrar por estación muestra comandas de otra, o si «Demorados» no deja solo las de más de 18 minutos.
it('filtra por estación y por demoradas', () => {
  const grill = ticket(1)
  const bar = ticket(2, { firedAt: ago(25), lines: [{ id: 20, name: 'Limonada', qty: 1, note: '', station: 'Bar', readyAt: null, servedAt: null }] })
  useKitchenStore.setState({ tickets: [grill, bar], setTab: (tab: string) => useKitchenStore.setState({ tab }) })
  wrap()
  const tabs = screen.getByRole('navigation', { name: 'Estaciones' })
  expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['all (2)', 'Parrilla (1)', 'Bar (1)', 'late (1)'])
  fireEvent.click(within(tabs).getByRole('button', { name: 'Parrilla (1)' }))
  expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Comanda DI001'])
  fireEvent.click(within(tabs).getByRole('button', { name: 'late (1)' }))
  expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Comanda DI002'])
})

// Falla si iniciar, marcar listo o marcar un plato no llegan al store con la sesión, o si un error del servidor se
// traga en silencio en vez de mostrarse a la cocina (y se limpia al reintentar).
it('las acciones van con la sesión y sus errores se muestran', async () => {
  useKitchenStore.setState({ tickets: [ticket(4)] })
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }))
  expect(start).toHaveBeenCalledWith(4, 55, expect.any(Function))
  readyDish.mockRejectedValueOnce(new Error('La línea ya estaba lista'))
  fireEvent.click(screen.getByRole('button', { name: 'Listo plato' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La línea ya estaba lista')
  expect(readyDish).toHaveBeenCalledWith(40, 55, expect.any(Function))
  fireEvent.click(screen.getByRole('button', { name: 'Listo todo' }))
  expect(ready).toHaveBeenCalledWith(4, 55, expect.any(Function))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})

// Falla si un error de lectura de la cocina no se muestra (y además se tapa con el esqueleto de carga para siempre).
it('un error de lectura se avisa en vez de quedarse cargando', () => {
  useKitchenStore.setState({ primed: false, error: 'Elige un restaurante.' })
  wrap()
  expect(screen.getByRole('alert')).toHaveTextContent('Elige un restaurante.')
  expect(screen.getByText('Sin comandas en preparación')).toBeInTheDocument()
})
