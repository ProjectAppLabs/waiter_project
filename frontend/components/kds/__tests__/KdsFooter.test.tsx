import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { KdsFooter } from '../KdsFooter'
import { messages } from '@/lib/i18n/messages'
import { useIdentity } from '@/lib/hooks/useIdentity'

jest.mock('@/lib/hooks/useIdentity', () => ({ useIdentity: jest.fn() }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { settings: { alertLateMinutes: 15, alertBillMinutes: 10 } }, load: jest.fn() }) }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ session: { id: 1 } }) }))

// Falla si la cocina deja de ofrecer «Umbrales de alerta» a un administrador (se movieron desde Configuración) o si pierde
// el botón de silenciar.
it('el pie de la cocina lleva los umbrales de alerta junto a silenciar', () => {
  jest.mocked(useIdentity).mockReturnValue({ name: 'Laura', firstName: 'Laura', role: 'admin', owner: false })
  render(<NextIntlClientProvider locale="es" messages={messages}><KdsFooter muted={false} onToggleMute={() => undefined} /></NextIntlClientProvider>)
  const buttons = screen.getAllByRole('button').map((b) => b.textContent)
  expect(buttons[0]).toBe('Umbrales de alerta')
  expect(buttons).toHaveLength(2)
})
