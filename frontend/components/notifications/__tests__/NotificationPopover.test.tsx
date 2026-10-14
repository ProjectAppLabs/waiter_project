import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { TopBar } from '@/components/kit/TopBar'
import type { Notification } from '@/lib/domain/notifications'
import { messages } from '@/lib/i18n/messages'
import { listNotifications, markAllRead, requestIngredient } from '@/lib/services/notifications'
import { useAuthStore } from '@/lib/stores/authStore'
import { useNotificationStore } from '@/lib/stores/notificationStore'
import { useToastStore } from '@/lib/stores/toastStore'

jest.mock('@/lib/services/notifications', () => ({ listNotifications: jest.fn(), markAllRead: jest.fn(async () => 2), markRead: jest.fn(), requestIngredient: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({}))
jest.mock('@/lib/services/session', () => ({}))
jest.mock('@/lib/services/cashRegister', () => ({}))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><TopBar active="dashboard" role="waiter" userName="Ana" onOpenSettings={() => undefined} /></NextIntlClientProvider>)
const stock: Notification = { id: 4, kind: 'inventory', title: 'Stock bajo', body: 'Salmón: quedan 1 kg', resModel: 'product.product', resId: 7, action: 'request_ingredient', actionDone: false, read: false, at: '2026-09-06 11:00:00' }
const dish: Notification = { id: 3, kind: 'kitchen', title: 'Plato listo para servir', body: 'Pollo · Mesa A8', resModel: 'pos.order', resId: 40, action: 'serve', actionDone: false, read: false, at: '2026-09-06 10:00:00' }

beforeEach(() => {
  // El sondeo vive en el armazón (useNotificationAlerts), no en el popover: aquí se siembra el centro
  // igual que lo dejaría una vuelta del sondeo, y se comprueba la campana y el popover.
  useNotificationStore.setState({ items: [stock, dish] })
  useAuthStore.setState({ user: { uid: 2, name: 'Ana', companyId: 1, role: 'waiter' }, session: { id: 16, configId: 1, state: 'opened' } })
  ;(listNotifications as jest.Mock).mockResolvedValue([stock, dish])
})

// Falla si la campana pierde el punto de no leídas, el popover sus pestañas, o "Marcar todas como leídas" no lo apaga en el servidor.
it('bell shows unread count, the popover filters by tab and marks all as read', async () => {
  wrap()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))
  const popover = screen.getByRole('dialog', { name: 'Notificaciones' })
  expect(popover).toHaveTextContent('Stock bajo')
  expect(popover).toHaveTextContent('Mesa A8')
  await userEvent.click(screen.getByRole('tab', { name: 'Cocina' }))
  expect(popover).not.toHaveTextContent('Stock bajo')
  await userEvent.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))
  expect(markAllRead).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Notificaciones, 0 sin leer' })).toBeInTheDocument()
})

// Falla si "Solicitar ingredientes" no crea la compra ni pasa a "Ya solicitado", o si un aviso ya atendido lo vuelve a ofrecer.
it('request ingredients creates the purchase and flips to already requested', async () => {
  ;(requestIngredient as jest.Mock).mockResolvedValueOnce({ purchaseId: 77, name: 'P00012', partnerName: 'Pesquera', qty: 19 })
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }))
  await userEvent.click(screen.getByRole('button', { name: 'Solicitar ingredientes' }))
  expect(await screen.findByText('Ya solicitado')).toBeInTheDocument()
  expect(requestIngredient).toHaveBeenCalledWith(7)
  expect(useToastStore.getState().toasts[0].title).toBe('¡Solicitud enviada!')
})
