import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { SettingsModal } from '@/components/kit/SettingsModal'
import { messages } from '@/lib/i18n/messages'
import { changePin, getEmployeeProfile, getNotifyPrefs, setNotifyPrefs } from '@/lib/services/employees'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/services/employees', () => ({
  getEmployeeProfile: jest.fn(), changePin: jest.fn(async () => true), endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn(),
  getNotifyPrefs: jest.fn(), setNotifyPrefs: jest.fn(async () => undefined),
}))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const modal = (onLogout = async () => undefined) => <SettingsModal open onClose={() => undefined} user={{ name: 'Ana', role: 'admin' }} restaurant="" onLogout={onLogout} />
beforeEach(() => {
  localStorage.clear(); delete document.documentElement.dataset.theme
  useAuthStore.setState({
    user: { uid: 7, name: 'Ana', companyId: 1, role: 'admin' },
    employee: { id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter', shift: { from: 10, to: 14 }, userId: null, checkIn: new Date(Date.now() - 65_000).toISOString(), attendanceId: 9, token: 'tok-demo' },
  })
  ;(getEmployeeProfile as jest.Mock).mockResolvedValue({ id: 2, name: 'Sofía Mesera', code: 'WT-0001', phone: '300', email: null, address: 'Calle 10', joiningDate: '2025-01-01', accessRole: 'waiter', employmentStatus: 'full_time', manager: 'Administrator', jobTitle: null, shift: { from: 10, to: 14 } })
  ;(getNotifyPrefs as jest.Mock).mockResolvedValue({ kitchen_popup: true, kitchen_sound: true, inventory_popup: true, inventory_sound: true, system_popup: true, system_sound: true })
})

// Falla si la pestaña Empleado no muestra el perfil leído de Odoo con "—" en lo que falta, o si el cronómetro no corre.
it('employee tab shows the profile from Odoo with dashes for missing data and the shift clock', async () => {
  wrap(modal())
  expect(await screen.findByText('Sofía Mesera', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText('WT-0001')).toBeInTheDocument()
  expect(screen.getByText('10:00 a. m. – 2:00 p. m.')).toBeInTheDocument()
  expect(screen.getByText('Tiempo completo')).toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(1)
  expect(screen.getByTestId('shift-clock')).toHaveTextContent(/00:01:0\d/)
})

// Falla si "Cambiar PIN" no escribe el nuevo PIN en Odoo ni muestra "¡PIN cambiado!".
it('security tab changes the PIN with the keypad and confirms', async () => {
  wrap(modal())
  await userEvent.click(screen.getByRole('tab', { name: 'Seguridad' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar PIN' }))
  for (const d of '654321') await userEvent.click(screen.getByRole('button', { name: d }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Cambiar PIN' })).getByRole('button', { name: 'Cambiar PIN' }))
  expect(await screen.findByText('¡PIN cambiado!')).toBeInTheDocument()
  expect(changePin).toHaveBeenCalledWith(2, '654321', 'tok-demo')
  await userEvent.click(screen.getByRole('button', { name: 'Ok' }))
  expect(screen.queryByText('¡PIN cambiado!')).toBeNull()
})

// Falla si Pantalla pierde el tema oscuro o si vuelve el selector de idioma (solo hay español: era un adorno sin función).
it('display tab switches the theme and has no language picker', async () => {
  wrap(modal())
  await userEvent.click(screen.getByRole('tab', { name: 'Pantalla' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.queryByText('Idioma')).toBeNull()
})

// Falla si «Cerrar sesión» deja de ser un renglón de icono y texto (como las pestañas) o si pierde su confirmación, o si
// el cronómetro pierde el nombre que dice qué mide.
it('shows the shift time and a one-row logout that asks before closing', async () => {
  const onLogout = jest.fn(async () => undefined)
  wrap(modal(onLogout))
  expect(screen.getByText('En turno')).toBeInTheDocument()
  const logout = screen.getByRole('button', { name: 'Cerrar sesión' })
  expect(logout.querySelector('svg')).toBeInTheDocument()
  expect(logout).toHaveClass('h-11')
  await userEvent.click(logout)
  expect(onLogout).not.toHaveBeenCalled()
})

// Falla si un toggle de notificaciones no guarda la preferencia en res.users (set_waiter_notify).
it('notification toggles are saved on the Odoo user', async () => {
  wrap(modal())
  await userEvent.click(screen.getByRole('tab', { name: 'Notificaciones' }))
  const sound = await screen.findByRole('switch', { name: 'Novedades de cocina Sonido de notificación' })
  expect(sound).toBeChecked()
  await userEvent.click(sound)
  expect(setNotifyPrefs).toHaveBeenCalledWith(7, { kitchen_sound: false })
  expect(sound).not.toBeChecked()
})

// Falla si "Cerrar sesión" sale sin confirmar o si la confirmación no llama a onLogout.
it('logout asks for confirmation before calling onLogout', async () => {
  const onLogout = jest.fn(async () => undefined)
  wrap(modal(onLogout))
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
  expect(onLogout).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Sí, salir' }))
  expect(onLogout).toHaveBeenCalled()
})
