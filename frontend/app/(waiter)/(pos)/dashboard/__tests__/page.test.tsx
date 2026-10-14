import { act, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import DashboardPage from '@/app/(pos)/dashboard/page'
import type { AttentionItem, SalesHistory } from '@/lib/domain/insights'
import type { KitOrder } from '@/lib/domain/orderState'
import { messages } from '@/lib/i18n/messages'
import { getSalesHistory } from '@/lib/services/insights'
import { listIngredients } from '@/lib/services/pantry'
import { getTimeline } from '@/lib/services/reservations'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useNotificationStore } from '@/lib/stores/notificationStore'

let orders: KitOrder[] = []
jest.mock('@/lib/hooks/useKitOrders', () => ({ useKitOrders: () => ({ orders }) }))
jest.mock('@/lib/services/insights', () => ({ getSalesHistory: jest.fn() }))
jest.mock('@/lib/services/pantry', () => ({ listIngredients: jest.fn() }))
jest.mock('@/lib/services/reservations', () => ({ getTimeline: jest.fn() }))
// Las tarjetas tienen sus propias pruebas (dashboardCards): aquí basta ver qué les pasa la pantalla.
jest.mock('@/components/dashboard/LiveClock', () => ({ LiveClock: () => null }))
jest.mock('@/components/dashboard/AttentionFeed', () => ({
  AttentionFeed: ({ items, loaded }: { items: AttentionItem[]; loaded: boolean }) => (
    <ul aria-label="Para atender" data-loaded={String(loaded)}>{items.map((i) => <li key={i.key}><a href={i.href}>{i.key}</a></li>)}</ul>
  ),
}))
jest.mock('@/components/dashboard/PatternCard', () => ({ PatternCard: ({ loaded }: { loaded: boolean }) => <section aria-label="Patrón" data-loaded={String(loaded)} /> }))
jest.mock('@/components/dashboard/DishStatsCard', () => ({ DishStatsCard: ({ stats }: { stats: { bottom: { name: string }[] } | null }) => <section aria-label="Platos">{stats?.bottom.map((d) => d.name).join(',')}</section> }))
jest.mock('@/components/dashboard/ForecastCard', () => ({ ForecastCard: () => <section aria-label="Proyección" /> }))
jest.mock('@/components/dashboard/TablesAvailable', () => ({ TablesAvailable: ({ busyTableIds }: { busyTableIds: Set<number> }) => <section aria-label="Mesas">{[...busyTableIds].join(',')}</section> }))

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const history = (): SalesHistory => ({
  today: iso(new Date()), windowDays: 28, historyDays: 60, hourly: [],
  daily: [{ date: daysAgo(0), total: 100000, orders: 4 }, { date: daysAgo(7), total: 50000, orders: 1 }],
  products: [{ productId: 1, templateId: 1, name: 'Hamburguesa', qty: 9, amount: 90000, prevQty: 3 }, { productId: 99, templateId: 99, name: 'Propina', qty: 50, amount: 50000, prevQty: 0 }],
})
const reservation = (id: number, state: string, over: Record<string, unknown> = {}) => ({ id, name: `R-${id}`, customerName: 'Ana', people: 4, state, timeStart: 23.9, label: '23:54', tableNumbers: [1, 2], depositState: 'none', ...over })
const order = (id: number, tableId: number | null) => ({ id, number: `DI-${id}`, type: 'dineIn', state: 'draft', tableId, tableNumber: tableId, customer: '', startedAt: '', total: 0, tax: 0, lines: [], courses: [] }) as unknown as KitOrder

function as(userRole: 'owner' | 'admin' | 'cashier' | 'waiter', over: Record<string, unknown> = {}) {
  useAuthStore.setState({ user: { uid: 1, name: 'Carlos Ruiz', companyId: 1, role: userRole } as never, employee: null, session: { id: 1, configId: 4, state: 'opened' }, ...over })
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><DashboardPage /></NextIntlClientProvider>)

beforeEach(() => {
  jest.clearAllMocks()
  orders = [order(1, 1), order(2, null)]
  useCatalogStore.setState({ catalog: {
    settings: { configId: 4 },
    floors: [],
    tables: [{ id: 1, number: 1 }, { id: 2, number: 2 }, { id: 3, number: 3 }],
    products: [{ id: 1, templateId: 1, name: 'Hamburguesa', categoryIds: [1], soldOut: true }, { id: 3, templateId: 3, name: 'Perro', categoryIds: [1], soldOut: false }, { id: 98, templateId: 98, name: 'Tarjeta de regalo', categoryIds: [], soldOut: false }],
  } as never })
  useNotificationStore.setState({ items: [] })
  // Una reserva de grupo llega en la fila de cada una de sus mesas: debe contarse una vez.
  jest.mocked(getTimeline).mockResolvedValue({ tables: [{ reservations: [reservation(7, 'confirmed')] }, { reservations: [reservation(7, 'confirmed'), reservation(8, 'cancelled')] }] } as never)
  jest.mocked(listIngredients).mockResolvedValue([])
  jest.mocked(getSalesHistory).mockResolvedValue(history())
})

// Falla si un mesero ve cifras de ventas (o se piden al servidor), o si sus contadores operativos cuentan mal: pedidos
// abiertos, reservas confirmadas de hoy (sin duplicar la de grupo ni contar canceladas), mesas libres y agotados.
it('el mesero ve lo operativo y nunca las ventas', async () => {
  as('waiter')
  wrap()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carlos')
  expect(screen.getByRole('link', { name: 'Ver pedidos' })).toHaveAttribute('href', '/pedidos')
  expect(screen.getByRole('link', { name: 'Ver pedidos' })).toHaveTextContent('Pedidos abiertos2')
  await waitFor(() => expect(screen.getByText('Reservas de hoy').closest('a')).toHaveTextContent('Reservas de hoy1'))
  expect(screen.getByText('Mesas libres').parentElement!.parentElement).toHaveTextContent('Mesas libres2')
  expect(screen.getByText('Agotados en la carta').parentElement!.parentElement).toHaveTextContent('Agotados en la carta1')
  expect(screen.getByRole('region', { name: 'Mesas' })).toHaveTextContent('1')
  expect(screen.queryByRole('link', { name: 'Ver el detalle en Ventas' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Platos' })).toBeNull()
  expect(getSalesHistory).not.toHaveBeenCalled()
  expect(getTimeline).toHaveBeenCalledWith(4, iso(new Date()))
})

// Falla si el encargado no ve las ventas de la semana en pesos con su variación, si el ticket promedio no divide por los
// pedidos, si una tarjeta de regalo (sin categoría del POS) sale entre los platos menos pedidos, o si ve la proyección del mes que es solo del dueño (plan Q).
it('el encargado ve las ventas pero no la proyección', async () => {
  as('admin')
  wrap()
  await waitFor(() => expect(getSalesHistory).toHaveBeenCalledWith(4))
  const sales = screen.getByRole('link', { name: 'Ver el detalle en Ventas' })
  expect(sales).toHaveAttribute('href', '/ventas')
  await waitFor(() => expect(within(sales).getByText('Ventas de esta semana').parentElement!.parentElement).toHaveTextContent(/\$\s100\.000100 %frente a la semana pasada/))
  expect(within(sales).getByText('Ticket promedio').parentElement!.parentElement).toHaveTextContent(/\$\s30\.000/)
  expect(screen.getByRole('region', { name: 'Platos' })).toHaveTextContent(/^Perro$/)
  expect(screen.queryByRole('region', { name: 'Proyección' })).toBeNull()
})

// Falla si el dueño no ve la proyección del mes, o si sus avisos de acceso y de caja no lo llevan a su consola (el
// encargado los resuelve en Configuración y Cuadres).
it('el dueño ve la proyección y sus avisos van a la consola', async () => {
  useNotificationStore.setState({ items: [
    { id: 5, kind: 'access', title: 'Acceso', body: 'Pedro intentó entrar fuera de turno', read: false },
    { id: 6, kind: 'cash', title: 'Caja', body: '', read: false },
    { id: 7, kind: 'access', title: 'Leído', body: '', read: true },
  ] as never })
  as('owner')
  const first = wrap()
  expect(await screen.findByRole('region', { name: 'Proyección' })).toBeInTheDocument()
  const feed = screen.getByRole('list', { name: 'Para atender' })
  expect(within(feed).getByRole('link', { name: 'access-5' })).toHaveAttribute('href', '/organizacion/equipo')
  expect(within(feed).getByRole('link', { name: 'cash-6' })).toHaveAttribute('href', '/organizacion/cuadres')
  expect(within(feed).queryByRole('link', { name: 'access-7' })).toBeNull()
  first.unmount()
  as('admin')
  wrap()
  expect(screen.getByRole('link', { name: 'access-5' })).toHaveAttribute('href', '/configuracion')
  expect(screen.getByRole('link', { name: 'cash-6' })).toHaveAttribute('href', '/cuadres')
})

// Falla si una fuente caída deja el tablero cargando para siempre: sin reservas, inventario ni historial, las tarjetas
// deben darse por cargadas (vacías) en vez de quedarse en esqueleto.
it('si las fuentes fallan, el tablero no se queda cargando', async () => {
  jest.mocked(getTimeline).mockRejectedValue(new Error('sin red'))
  jest.mocked(listIngredients).mockRejectedValue(new Error('sin red'))
  jest.mocked(getSalesHistory).mockRejectedValue(new Error('sin red'))
  as('cashier')
  wrap()
  await waitFor(() => expect(screen.getByRole('list', { name: 'Para atender' })).toHaveAttribute('data-loaded', 'true'))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Patrón' })).toHaveAttribute('data-loaded', 'true'))
})

// Falla si con la caja cerrada no se invita a abrirla, o si los avisos de reservas e inventario no se refrescan cada
// minuto (el mesero vería una reserva que ya llegó o un ingrediente ya repuesto).
it('con la caja cerrada lo dice y refresca cada minuto', async () => {
  jest.useFakeTimers()
  try {
    jest.mocked(listIngredients).mockResolvedValue([{ id: 30, name: 'Tomate', level: 'empty', qty: 0, min: 5, uomName: 'kg' }] as never)
    as('waiter', { session: null })
    wrap()
    expect(screen.getByText(/la caja está cerrada/)).toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('link', { name: 'empty-30' })).toHaveAttribute('href', '/inventario')
    expect(getTimeline).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(getTimeline).toHaveBeenCalledTimes(2)
    expect(listIngredients).toHaveBeenCalledTimes(2)
  } finally { jest.useRealTimers() }
})
