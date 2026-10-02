import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { UsersForm } from '../KitSettingsForms'
import { RolePermissionsForm } from '../RolePermissionsForm'
import { messages } from '@/lib/i18n/messages'
import type { PosEmployee } from '@/lib/services/employees'

// jsdom no trae structuredClone (el navegador sí); basta una copia JSON para la política de permisos.
globalThis.structuredClone ??= ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone
const intl = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const employees: PosEmployee[] = [
  { id: 1, name: 'Sofía Mesera', code: null, role: 'waiter', shift: { from: 8, to: 16 } },
  { id: 2, name: 'Carlos Cajero', code: null, role: 'cashier', shift: null },
  { id: 3, name: 'Administrator', code: null, role: null, shift: null },
]

// Falla si «Tu equipo» deja fuera a las personas del restaurante o les inventa un rol.
it('muestra en el equipo a las personas y su horario', () => {
  intl(<UsersForm employees={employees} />)
  const team = screen.getByRole('region', { name: 'Tu equipo' })
  expect(within(team).getByText('Sofía Mesera').closest('div.flex')).toHaveTextContent('Mesero')
  expect(within(team).getByText('Carlos Cajero').closest('div.flex')).toHaveTextContent('Sin horario')
  expect(within(team).getByText('Administrator').closest('div.flex')).toHaveTextContent('Rol de su cuenta')
})

// Falla si la tabla de permisos deja de decir cuántas personas tiene cada rol (lo que la liga con la lista del equipo).
it('la tabla de permisos dice cuántas personas tiene cada rol', () => {
  render(<RolePermissionsForm configId={1} counts={{ waiter: 1, cashier: 2 }} />)
  expect(screen.getByText('1 persona')).toBeInTheDocument()
  expect(screen.getByText('2 personas')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Qué puede hacer cada rol' })).toBeInTheDocument()
})
