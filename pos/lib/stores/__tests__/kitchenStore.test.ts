import { act } from '@testing-library/react'

import { play } from '@/lib/audio/sounds'
import { listCompletedCourses, listKitchenTickets, markReady } from '@/lib/services/kitchen'
import { useKitchenStore } from '@/lib/stores/kitchenStore'

jest.mock('@/lib/services/kitchen', () => ({ listKitchenTickets: jest.fn(), listCompletedCourses: jest.fn(), markReady: jest.fn(), markServed: jest.fn() }))
jest.mock('@/lib/audio/sounds', () => ({ play: jest.fn(), setMuted: jest.fn(), setStation: jest.fn() }))
const mTickets = listKitchenTickets as jest.Mock
const ticket = (id: number) => ({ id, orderId: id, tableId: 1, tracking: '1', waiter: '', note: '', firedAt: '2026-09-05 02:00:00', readyAt: null, lines: [] })
const none = () => null

beforeEach(() => {
  jest.clearAllMocks()
  ;(listCompletedCourses as jest.Mock).mockResolvedValue([])
  useKitchenStore.setState({ tickets: [], done: [], tab: 'all', muted: false, primed: false, error: null, alarms: {} })
})

// Falla si el aviso suena al abrir la pantalla, o si no suena cuando entra una comanda nueva.
it('chimes only for tickets that appear after the first load', async () => {
  mTickets.mockResolvedValueOnce([ticket(1)]).mockResolvedValueOnce([ticket(1), ticket(2)])
  await act(() => useKitchenStore.getState().refresh(4, none))
  expect(play).not.toHaveBeenCalled()
  await act(() => useKitchenStore.getState().refresh(4, none))
  expect(play).toHaveBeenCalledWith('ticket')
  expect(useKitchenStore.getState().tickets).toHaveLength(2)
})

// Falla si "Listo" no llega al servidor o si la pantalla no se refresca después.
it('marks a course ready in el servidor and refreshes the board', async () => {
  mTickets.mockResolvedValue([])
  await act(() => useKitchenStore.getState().ready(5, 4, none))
  expect(markReady).toHaveBeenCalledWith(5)
  expect(mTickets).toHaveBeenCalledWith(4, none)
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
