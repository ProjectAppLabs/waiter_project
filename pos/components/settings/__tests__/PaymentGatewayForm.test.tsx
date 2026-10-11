import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PaymentGatewayForm } from '@/components/settings/PaymentGatewayForm'
import { connectWompi, disconnectGateway, enableGateway, getPaymentGateways, requestAccess, verifyAccess, type GatewaySettings } from '@/lib/services/paymentGateways'

jest.mock('@/lib/services/paymentGateways', () => {
  const actual = jest.requireActual('@/lib/services/paymentGateways')
  return { ...actual, requestAccess: jest.fn(), verifyAccess: jest.fn(), getPaymentGateways: jest.fn(), connectWompi: jest.fn(), enableGateway: jest.fn(), disconnectGateway: jest.fn() }
})

const KEYS = 'pub_test_AbCdEf123456\nprv_test_ZyXwVu987654\ntest_events_Ev3ntS3cr3t\ntest_integrity_Int3gr1ty9'
const empty = (environment: 'test' | 'prod') => ({ environment, enabled: false, public_key_hint: '', configured: { private_key: false, events: false, integrity: false },
  merchant_name: '', checks: {}, verified_at: null, payment_method_id: null, webhook_url: `https://pagos.example/api/v1/pagos/webhooks/wompi/x/y/${environment}/`, webhook_path: '' })
const SETTINGS: GatewaySettings = { provider: 'wompi', live_available: false, methods: [], configurations: [empty('test'), empty('prod')] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requestAccess).mockResolvedValue({ correo: 'du•••@example.invalid', vence: '2099-01-01T00:00:00Z' })
  jest.mocked(verifyAccess).mockResolvedValue({ ok: true, acceso: 'acceso-1', vence: new Date(Date.now() + 15 * 60_000).toISOString() })
  jest.mocked(getPaymentGateways).mockResolvedValue(SETTINGS)
})

async function enter() {
  render(<PaymentGatewayForm />)
  expect(getPaymentGateways).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviarme el código' })))
  expect(screen.getByText('du•••@example.invalid')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '12a3456' } })
  expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('123456')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))
  expect(verifyAccess).toHaveBeenCalledWith('123456')
  await waitFor(() => expect(getPaymentGateways).toHaveBeenCalledWith('acceso-1'))
}

// Falla si la conexión con Wompi se ve sin el código del correo, si el código admite letras o si el acceso no dice
// cuánto le queda y que sirve para un solo cambio.
it('pide el código del correo antes de mostrar la conexión', async () => {
  await enter()
  expect(await screen.findByText(/Acceso abierto · vence en 1[45]:\d\d · sirve para un cambio/)).toBeInTheDocument()
})

// Falla si lo pegado aparece en pantalla, si no se reconocen las cuatro llaves, si se puede conectar con llaves de otro
// ambiente o incompletas, o si tras conectar el acceso sigue abierto (debe pedirse otro código para otro cambio).
it('conecta Wompi pegando las llaves sin mostrarlas nunca', async () => {
  jest.mocked(connectWompi).mockResolvedValue({ ok: true, checks: { comercio: 'ok', llave_privada: 'ok', integridad: 'ok', eventos: 'pendiente' }, merchant_name: 'Burger House S.A.S.' })
  await enter()
  const pruebas = await screen.findByLabelText('Pruebas (sandbox)')
  fireEvent.click(within(pruebas).getByRole('button', { name: 'Conectar Wompi' }))
  expect(screen.getByRole('link', { name: 'Abrir mi panel de Wompi ↗' })).toHaveAttribute('href', 'https://comercios.wompi.co/')
  expect(screen.getByText('https://pagos.example/api/v1/pagos/webhooks/wompi/x/y/test/')).toBeInTheDocument()
  const zona = screen.getByLabelText(/Pega tus llaves/)
  const conectar = screen.getByRole('button', { name: 'Conectar y verificar' })
  fireEvent.paste(zona, { clipboardData: { getData: () => 'pub_prod_AbCdEf123456' } })
  expect(screen.getByText(/Esas llaves son de producción/)).toBeInTheDocument()
  fireEvent.paste(zona, { clipboardData: { getData: () => 'pub_test_AbCdEf123456' } })
  expect(conectar).toBeDisabled()
  fireEvent.paste(zona, { clipboardData: { getData: () => KEYS } })
  expect(zona).toHaveValue('')
  expect(document.body.textContent).not.toMatch(/prv_test_|test_events_|test_integrity_|pub_test_AbCd/)
  expect(screen.getAllByText(/recibida$/)).toHaveLength(4)
  await act(async () => fireEvent.click(conectar))
  expect(connectWompi).toHaveBeenCalledWith('acceso-1', 'test', expect.stringContaining('prv_test_ZyXwVu987654'), true)
  expect(screen.getByText(/Wompi quedó conectado a Burger House S\.A\.S\..*Para otro cambio pide un código nuevo/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviarme el código' })).toBeInTheDocument()
})

// Falla si una verificación fallida no dice qué llave falló y que no se guardó nada.
it('muestra qué llave falló', async () => {
  jest.mocked(connectWompi).mockResolvedValue({ ok: false, detail: 'La llave privada no es válida o no es de la misma cuenta.',
    checks: { comercio: 'ok', llave_privada: 'fallo', integridad: 'pendiente', eventos: 'pendiente' } })
  await enter()
  fireEvent.click(within(await screen.findByLabelText('Pruebas (sandbox)')).getByRole('button', { name: 'Conectar Wompi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Prefiero escribirlas una por una' }))
  const [pub, prv, evt, itg] = KEYS.split('\n')
  fireEvent.change(screen.getByLabelText('Llave pública'), { target: { value: pub } })
  fireEvent.change(screen.getByLabelText('Llave privada'), { target: { value: prv } })
  fireEvent.change(screen.getByLabelText('Secreto de eventos'), { target: { value: evt } })
  fireEvent.change(screen.getByLabelText('Secreto de integridad'), { target: { value: itg } })
  expect(screen.getByLabelText('Llave privada')).toHaveAttribute('type', 'password')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Conectar y verificar' })))
  const alerta = screen.getByRole('alert')
  expect(alerta).toHaveTextContent('La llave privada no es válida')
  expect(alerta).toHaveTextContent('No guardamos nada')
  expect(within(alerta).getByText('No pasó')).toBeInTheDocument()
})

// Falla si una conexión guardada no muestra el comercio, la pista de la llave pública y sus verificaciones, o si activarla
// no usa el acceso.
it('activa una conexión guardada', async () => {
  const conectado = { ...SETTINGS, configurations: [{ ...empty('test'), public_key_hint: 'pub_test_…3456', merchant_name: 'Burger House S.A.S.',
    checks: { comercio: 'ok', llave_privada: 'ok', integridad: 'ok', eventos: 'ok' }, configured: { private_key: true, events: true, integrity: true } }, empty('prod')] } as GatewaySettings
  jest.mocked(getPaymentGateways).mockResolvedValue(conectado)
  jest.mocked(enableGateway).mockResolvedValue(conectado)
  jest.mocked(disconnectGateway).mockResolvedValue(SETTINGS)
  await enter()
  const pruebas = await screen.findByLabelText('Pruebas (sandbox)')
  expect(within(pruebas).getByText('pub_test_…3456')).toBeInTheDocument()
  expect(within(pruebas).getAllByText('Verificado')).toHaveLength(4)
  await act(async () => fireEvent.click(within(pruebas).getByRole('button', { name: 'Activar en el menú' })))
  expect(enableGateway).toHaveBeenCalledWith('acceso-1', 'test', true)
  expect(screen.getByText(/ya se cobra en línea/)).toBeInTheDocument()
})

// Falla si desconectar no pide confirmación antes de borrar las llaves.
it('desconecta con confirmación', async () => {
  const conectado = { ...SETTINGS, configurations: [{ ...empty('test'), public_key_hint: 'pub_test_…3456', merchant_name: 'Burger House S.A.S.' }, empty('prod')] } as GatewaySettings
  jest.mocked(getPaymentGateways).mockResolvedValue(conectado)
  jest.mocked(disconnectGateway).mockResolvedValue(SETTINGS)
  await enter()
  fireEvent.click(within(await screen.findByLabelText('Pruebas (sandbox)')).getByRole('button', { name: 'Desconectar' }))
  expect(disconnectGateway).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desconectar' })))
  expect(disconnectGateway).toHaveBeenCalledWith('acceso-1', 'test')
})
