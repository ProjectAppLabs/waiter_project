import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import ReservasPage from '../reservas/page'
import { messages } from '@/lib/i18n/messages'
import { useIdentity } from '@/lib/hooks/useIdentity'

jest.mock('@/lib/hooks/useIdentity', () => ({ useIdentity: jest.fn() }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ session: { configId: 1 } }) }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { floors: [], settings: { configId: 1 } } }) }))
const store = { date: '2026-09-28', floorId: null, timeline: null, loading: false, error: null, loadedKey: null, load: jest.fn(), forget: jest.fn(), setFloor: jest.fn(), setDate: jest.fn(), openWizard: jest.fn(), changeState: jest.fn() }
jest.mock('@/lib/stores/reservationsStore', () => ({ useReservationsStore: () => store }))
jest.mock('@/components/reservations/ReservationTimeline', () => ({ ReservationTimeline: () => null, TimelineSkeleton: () => null }))
jest.mock('@/components/reservations/ReservationDetailModal', () => ({ ReservationDetailModal: () => null }))
jest.mock('@/components/reservations/ReservationWizard', () => ({ ReservationWizard: () => null }))
jest.mock('@/components/tables/FloorHeader', () => ({ FloorSwitcher: () => null }))
jest.mock('@/components/settings/ReservationHoursForm', () => ({ ReservationHoursForm: ({ configId }: { configId: number }) => <p>Formulario del horario {configId}</p> }))
const page = () => render(<NextIntlClientProvider locale="es" messages={messages}><ReservasPage /></NextIntlClientProvider>)

// Falla si el horario de reservas deja de configurarse desde Reservas (se movió desde Configuración) o si alguien que no
// es administrador puede abrirlo.
it('el administrador configura el horario desde Reservas; el resto no lo ve', () => {
  jest.mocked(useIdentity).mockReturnValue({ name: 'Laura', firstName: 'Laura', role: 'admin', owner: false })
  const { unmount } = page()
  fireEvent.click(screen.getByRole('button', { name: 'Horario' }))
  expect(screen.getByRole('dialog', { name: 'Horario de reservas' })).toHaveTextContent('Formulario del horario 1')
  unmount()
  jest.mocked(useIdentity).mockReturnValue({ name: 'Sofía', firstName: 'Sofía', role: 'waiter', owner: false })
  page()
  expect(screen.queryByRole('button', { name: 'Horario' })).not.toBeInTheDocument()
})
