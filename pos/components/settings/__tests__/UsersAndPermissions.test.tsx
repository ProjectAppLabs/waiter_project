import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { UsersForm } from '../KitSettingsForms'
import { RolePermissionsForm } from '../RolePermissionsForm'
import { messages } from '@/lib/i18n/messages'
import type { PosEmployee } from '@/lib/services/employees'
import type { UserInfo } from '@/lib/services/settings'

jest.mock('@/lib/services/settings', () => ({ ...jest.requireActual('@/lib/services/settings'), inviteUser: jest.fn(), resendInvite: jest.fn(), setUserRole: jest.fn() }))
// jsdom no trae structuredClone (el navegador sí); basta una copia JSON para la política de permisos.
globalThis.structuredClone ??= ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone
const intl = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const employees: PosEmployee[] = [
  { id: 1, name: 'Sofía Mesera', code: null, role: 'waiter', shift: { from: 8, to: 16 } },
  { id: 2, name: 'Carlos Cajero', code: null, role: 'cashier', shift: null },
  { id: 3, name: 'Administrator', code: null, role: null, shift: null },
]
const users: UserInfo[] = [{ id: 9, name: 'Laura', login: 'laura@example.invalid', lastLogin: null, role: 'admin', activated: true }]

// Falla si «Tu equipo» deja fuera a quienes inician turno con PIN (a quienes aplican los permisos) o les inventa un rol.
it('muestra en el equipo a los empleados con PIN y a las cuentas de correo', () => {
  intl(<UsersForm users={users} employees={employees} onChanged={async () => undefined} />)
  const team = screen.getByRole('region', { name: 'Tu equipo' })
  expect(within(team).getByText('Con PIN en el POS')).toBeInTheDocument()
  expect(within(team).getByText('Sofía Mesera').closest('div.flex')).toHaveTextContent('Mesero')
  expect(within(team).getByText('Carlos Cajero').closest('div.flex')).toHaveTextContent('Sin horario')
  expect(within(team).getByText('Administrator').closest('div.flex')).toHaveTextContent('Rol de su cuenta')
  expect(within(team).getByText('Con cuenta de correo')).toBeInTheDocument()
  expect(within(team).getByRole('combobox', { name: 'Rol: Laura' })).toHaveValue('admin')
})

// Falla si la tabla de permisos deja de decir cuántas personas tiene cada rol (lo que la liga con la lista del equipo).
it('la tabla de permisos dice cuántas personas tiene cada rol', () => {
  render(<RolePermissionsForm configId={1} counts={{ waiter: 1, cashier: 2 }} />)
  expect(screen.getByText('1 persona')).toBeInTheDocument()
  expect(screen.getByText('2 personas')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Qué puede hacer cada rol' })).toBeInTheDocument()
})
