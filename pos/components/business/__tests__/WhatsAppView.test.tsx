import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { WhatsAppView } from '@/components/business/WhatsAppView'
import { messages } from '@/lib/i18n/messages'
import { CoreError } from '@/lib/services/core/http'
import { connectWhatsapp, disconnectWhatsapp, replyWhatsapp, sendWhatsappTest, whatsappConversation, whatsappOverview, type WaOverview } from '@/lib/services/core/whatsapp'
import { runEmbeddedSignup } from '@/lib/whatsapp/embeddedSignup'

jest.mock('@/lib/services/core/whatsapp', () => ({
  whatsappOverview: jest.fn(), connectWhatsapp: jest.fn(), disconnectWhatsapp: jest.fn(), sendWhatsappTest: jest.fn(), whatsappConversation: jest.fn(), replyWhatsapp: jest.fn(),
}))
jest.mock('@/lib/whatsapp/embeddedSignup', () => ({ runEmbeddedSignup: jest.fn() }))

const SIGNUP = { app_id: '1825282295557750', config_id: 'cfg-1', graph_version: 'v25.0' }
const CONNECTED: WaOverview = {
  account: { phone: '+1 555 633 1020', name: 'Burger House', quality: 'GREEN', status: 'connected', connected_at: '2026-10-09T15:00:00Z', test_number: true },
  signup: SIGNUP,
  recent: [{ id: 5, wa_id: '573004771554', name: 'Gus', last_inbound_at: '2026-10-09T15:05:00Z', window_open: true, last_message: { direction: 'in', text: 'Hola, ¿tienen domicilio?', status: 'received', at: '2026-10-09T15:05:00Z' } }],
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><WhatsAppView /></NextIntlClientProvider>)
beforeEach(() => jest.clearAllMocks())

// Falla si sin número conectado no aparece el botón de conectar, si el botón no manda a Waiter el código y los ids que
// devuelve Meta, o si cerrar la ventana de Meta se toma como conexión.
it('conecta WhatsApp con un botón', async () => {
  jest.mocked(whatsappOverview).mockResolvedValue({ account: null, signup: SIGNUP, recent: [] })
  jest.mocked(runEmbeddedSignup).mockResolvedValueOnce(null).mockResolvedValueOnce({ code: 'c0de', waba_id: 'W1', phone_number_id: 'P1' })
  jest.mocked(connectWhatsapp).mockResolvedValue(CONNECTED)
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Conectar WhatsApp' }))
  expect(await screen.findByText(/sin conectar el número/)).toBeInTheDocument()
  expect(connectWhatsapp).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ya uso la app WhatsApp Business en mi celular' }))
  await waitFor(() => expect(connectWhatsapp).toHaveBeenCalledWith({ code: 'c0de', waba_id: 'W1', phone_number_id: 'P1' }))
  expect(runEmbeddedSignup).toHaveBeenLastCalledWith(SIGNUP, 'business_app')
  expect(await screen.findByText(/quedó conectado/)).toBeInTheDocument()
  expect(screen.getByText(/Burger House · \+1 555 633 1020/)).toBeInTheDocument()
})

// Falla si sin la configuración de Meta se ofrece un botón que no puede funcionar en vez de explicar por qué.
it('sin la configuración de Meta explica que la conexión no está habilitada', async () => {
  jest.mocked(whatsappOverview).mockResolvedValue({ account: null, signup: null, recent: [] })
  wrap()
  expect(await screen.findByText(/todavía no está habilitada/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Conectar WhatsApp' })).toBeNull()
})

// Falla si con el número conectado no se puede enviar la prueba, si el aviso del número de prueba no aparece, o si
// desconectar no pide confirmación.
it('envía la prueba, avisa del número de prueba y desconecta con confirmación', async () => {
  jest.mocked(whatsappOverview).mockResolvedValue(CONNECTED)
  jest.mocked(sendWhatsappTest).mockResolvedValue({ ok: true, wamid: 'wamid.1' })
  jest.mocked(disconnectWhatsapp).mockResolvedValue({ ...CONNECTED, account: { ...CONNECTED.account!, status: 'disconnected' } })
  wrap()
  expect(await screen.findByText(/número de prueba/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Número de prueba'), { target: { value: '300 477 1554' } })
  fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje de prueba/ }))
  await waitFor(() => expect(sendWhatsappTest).toHaveBeenCalledWith('300 477 1554'))
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
  expect(disconnectWhatsapp).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desconectar' }))
  await waitFor(() => expect(disconnectWhatsapp).toHaveBeenCalled())
  expect(await screen.findByRole('button', { name: 'Conectar WhatsApp' })).toBeInTheDocument()
})

// Falla si la conversación no muestra los mensajes con su estado, si se puede escribir con la ventana de 24 h cerrada,
// o si un error de Meta al responder no se muestra.
it('abre una conversación, responde dentro de la ventana y muestra errores', async () => {
  jest.mocked(whatsappOverview).mockResolvedValue(CONNECTED)
  jest.mocked(whatsappConversation).mockResolvedValueOnce({ id: 5, wa_id: '573004771554', name: 'Gus', window_open: true, messages: [
    { id: 1, direction: 'out', type: 'template', text: '', template: 'hello_world', status: 'read', error: null, at: '2026-10-09T15:00:00Z' },
    { id: 2, direction: 'in', type: 'text', text: 'Hola, ¿tienen domicilio?', template: null, status: 'received', error: null, at: '2026-10-09T15:05:00Z' },
  ] })
  jest.mocked(replyWhatsapp).mockResolvedValueOnce({ message: { id: 3, direction: 'out', type: 'text', text: 'Sí, hasta las 10 p. m.', template: null, status: 'sent', error: null, at: '2026-10-09T15:06:00Z' } })
    .mockRejectedValueOnce(new CoreError(400, 'window_closed', 'Pasaron más de 24 horas: usa una plantilla.'))
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: /Gus/ }))
  const list = await screen.findByRole('list', { name: 'Mensajes' })
  expect(list).toHaveTextContent('Plantilla «hello_world»')
  expect(list).toHaveTextContent('Leído')
  fireEvent.change(screen.getByLabelText('Responder'), { target: { value: 'Sí, hasta las 10 p. m.' } })
  fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))
  await waitFor(() => expect(replyWhatsapp).toHaveBeenCalledWith(5, 'Sí, hasta las 10 p. m.'))
  expect(await within(list).findByText('Sí, hasta las 10 p. m.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Responder'), { target: { value: 'Otra' } })
  fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Pasaron más de 24 horas')
})

it('con la ventana cerrada no deja escribir texto libre', async () => {
  // Falla si con más de 24 horas sin mensajes del cliente se ofrece el cuadro de respuesta, que Meta rechazaría.
  jest.mocked(whatsappOverview).mockResolvedValue(CONNECTED)
  jest.mocked(whatsappConversation).mockResolvedValue({ id: 5, wa_id: '573004771554', name: 'Gus', window_open: false, messages: [] })
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: /Gus/ }))
  expect(await screen.findByText(/solo permite escribirle con una plantilla/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Responder')).toBeNull()
})
