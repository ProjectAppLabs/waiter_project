import { act } from '@testing-library/react'

import { play } from '@/lib/audio/sounds'
import { coreFetch } from '@/lib/services/core/http'
import { useAuthStore } from '@/lib/stores/authStore'
import { useKitchenStore } from '@/lib/stores/kitchenStore'

// Solo las fronteras externas: el servidor (HTTP) y el audio del navegador.
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
jest.mock('@/lib/audio/sounds', () => ({ play: jest.fn(), setMuted: jest.fn(), setStation: jest.fn() }))
const server = coreFetch as jest.Mock
const coreTicket = (id: number) => ({ id, order_id: id, number: '1', table_number: 1, service: 'dine_in', waiter: null, note: '', fired_at: '2026-09-05 02:00:00', preparation_at: null, ready_at: null, lines: [] })
const board = (...ids: number[]) => ({ tickets: ids.map(coreTicket), completed: [{ fired_at: '2026-09-05 01:40:00', ready_at: '2026-09-05 01:52:00' }] })
const ticket = (id: number) => ({ id, orderId: id, tableId: 1, tracking: '1', waiter: '', note: '', firedAt: '2026-09-05 02:00:00', readyAt: null, lines: [] })
const none = () => null
const boardReads = () => server.mock.calls.filter(([path]) => String(path).startsWith('kitchen/tickets')).length

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ session: { id: 4, configId: 7, state: 'opened' } } as never)
  useKitchenStore.setState({ tickets: [], done: [], tab: 'all', muted: false, primed: false, error: null, alarms: {} })
})

// Falla si el aviso suena al abrir la pantalla, o si no suena cuando entra una comanda nueva.
it('chimes only for tickets that appear after the first load', async () => {
  server.mockResolvedValueOnce(board(1)).mockResolvedValueOnce(board(1, 2))
  await act(() => useKitchenStore.getState().refresh(4, none))
  expect(play).not.toHaveBeenCalled()
  await act(() => useKitchenStore.getState().refresh(4, none))
  expect(play).toHaveBeenCalledWith('ticket')
  expect(useKitchenStore.getState().tickets).toHaveLength(2)
})

// Falla si "Listo" no llega al servidor o si la pantalla no se refresca después.
it('marks a course ready in el servidor and refreshes the board', async () => {
  server.mockResolvedValue(board())
  await act(() => useKitchenStore.getState().ready(5, 4, none))
  expect(server).toHaveBeenCalledWith('courses/5/ready', { method: 'POST' })
  expect(server).toHaveBeenLastCalledWith('kitchen/tickets?restaurant_id=7')
})

// Falla si cocina vuelve a pedir dos veces el tablero en cada refresco (comandas y terminados por separado), o si las
// comandas o el tiempo medio dejan de salir de esa única lectura.
it('un refresco lee el tablero una sola vez y de ahí salen comandas y terminados', async () => {
  server.mockResolvedValue(board(1, 2))
  await act(() => useKitchenStore.getState().refresh(4, none))
  expect(boardReads()).toBe(1)
  expect(useKitchenStore.getState().tickets.map((t) => t.id)).toEqual([1, 2])
  expect(useKitchenStore.getState().done).toEqual([{ firedAt: '2026-09-05 01:40:00', readyAt: '2026-09-05 01:52:00' }])
})

// Falla si el aviso crítico suena una sola vez o si "demora" suena antes de los 12 minutos.
it('warns once at 12 minutes and repeats the critical alarm every 60 s after 18', () => {
  const at = (min: number) => new Date(Date.parse('2026-09-05T02:00:00Z') - min * 60_000).toISOString().slice(0, 19).replace('T', ' ')
  useKitchenStore.setState({ tickets: [{ ...ticket(1), firedAt: at(12) }, { ...ticket(2), firedAt: at(18) }] })
  const now = Date.parse('2026-09-05T02:00:00Z')
  useKitchenStore.getState().tick(now)
  useKitchenStore.getState().tick(now + 30_000)
  useKitchenStore.getState().tick(now + 61_000)
  expect((play as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['demora', 'critico', 'critico'])
})
