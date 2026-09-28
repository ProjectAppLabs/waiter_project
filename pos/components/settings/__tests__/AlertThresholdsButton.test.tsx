import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { AlertThresholdsButton } from '../AlertThresholdsButton'
import { messages } from '@/lib/i18n/messages'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { saveSettings } from '@/lib/services/settings'

jest.mock('@/lib/hooks/useIdentity', () => ({ useIdentity: jest.fn() }))
jest.mock('@/lib/services/settings', () => ({ saveSettings: jest.fn().mockResolvedValue(undefined) }))
const load = jest.fn().mockResolvedValue(undefined)
const settings = { alertLateMinutes: 15, alertBillMinutes: 10 }
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { settings }, load }) }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ session: { id: 4 } }) }))
const view = () => render(<NextIntlClientProvider locale="es" messages={messages}><AlertThresholdsButton /></NextIntlClientProvider>)

// Falla si los umbrales de alerta dejan de poder ajustarse fuera de Configuración (desde la cocina) o si alguien que no es
// administrador puede cambiarlos.
it('el administrador ajusta los umbrales desde el botón; el resto no lo ve', async () => {
  jest.mocked(useIdentity).mockReturnValue({ name: 'Laura', firstName: 'Laura', role: 'admin', owner: false })
  const { unmount } = view()
  fireEvent.click(screen.getByRole('button', { name: 'Umbrales de alerta' }))
  const dialog = screen.getByRole('dialog', { name: 'Umbrales de alerta' })
  const late = dialog.querySelectorAll('input')[0]
  fireEvent.change(late, { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ alertLateMinutes: 20, alertBillMinutes: 10 })))
  expect(load).toHaveBeenCalledWith(4)
  unmount()
  jest.mocked(useIdentity).mockReturnValue({ name: 'Pedro', firstName: 'Pedro', role: 'waiter', owner: false })
  view()
  expect(screen.queryByRole('button', { name: 'Umbrales de alerta' })).not.toBeInTheDocument()
})
