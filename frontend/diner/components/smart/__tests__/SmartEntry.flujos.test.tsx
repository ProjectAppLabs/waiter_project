import { act, fireEvent, render, screen } from '@testing-library/react'
import { SmartLocation, SmartWelcome } from '../SmartEntry'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { getEntry, getVenueLocation } from '@/lib/services/api'
import type { Entry } from '@/lib/types'

const mockPush = jest.fn()
const mockLeerQr = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
jest.mock('@zxing/browser', () => ({ BrowserQRCodeReader: jest.fn().mockImplementation(() => ({ decodeFromImageUrl: mockLeerQr })) }))
const inicial = useDinerStore.getInitialState()
const entrada = { contexto: { restaurante: { slug: 'casa', nombre: 'Casa' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: null, marca: { nombre: 'Casa', logo: null, lema: '' } }, carta: { categorias: [] } } as unknown as Entry
const pulsar = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
beforeEach(() => {
  jest.resetAllMocks()
  useDinerStore.setState({ ...inicial, keys: { rest: 'casa', venue: 'centro', token: null } }, true)
  jest.mocked(getVenueLocation).mockResolvedValue({ direccion: 'Calle 10', latitud: null, longitud: null })
  jest.mocked(getEntry).mockResolvedValue(entrada)
})
afterEach(() => { useDinerStore.setState(inicial, true); jest.restoreAllMocks() })
async function manual() {
  await act(async () => render(<SmartLocation entry={entrada} />))
  pulsar(/Código de tu mesa/)
  pulsar('Introducir código manualmente')
}

// Falla si avanzar, retroceder u omitir la introducción pierde las salidas para cuenta e invitado.
it('recorre la bienvenida y permite omitirla para entrar como invitado', () => {
  render(<SmartWelcome entry={entrada} />)
  expect(screen.getByRole('link', { name: 'Ya conozco el menú' })).toHaveAttribute('href', '/casa/centro')
  pulsar('Comenzar')
  expect(screen.getByText('Descubre tu próximo favorito')).toBeVisible()
  pulsar('Continuar')
  expect(screen.getByText('Una elección más fácil')).toBeVisible()
  pulsar('Paso anterior')
  expect(screen.getByText('Descubre tu próximo favorito')).toBeVisible()
  pulsar('Página 4')
  expect(screen.getByText('Recuerda lo que te encanta')).toBeVisible()
  pulsar('Omitir introducción')
  expect(screen.getByRole('link', { name: 'Continuar con correo' })).toHaveAttribute('href', '/casa/centro/cuenta/correo')
  expect(screen.getByRole('link', { name: 'Continuar como invitado' })).toHaveAttribute('href', '/casa/centro')
})

// Falla si abrir una mesa no valida su código con el restaurante o pierde el token del QR al navegar.
it.each(['MESA_3', '/casa/centro/t/MESA_3/carta'])('abre la mesa a partir de %s después de validarla', async codigo => {
  await manual()
  fireEvent.change(screen.getByLabelText('Código o enlace de la mesa'), { target: { value: codigo } })
  await act(async () => pulsar('Abrir mi mesa'))
  expect(getEntry).toHaveBeenCalledWith('casa', 'centro', 'MESA_3')
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/MESA_3')
})

// Falla si un enlace de otro origen o un código mal escrito permite cambiar de mesa sin validación.
it.each([
  ['https://ajeno.invalid/casa/centro/t/MESA', 'Este enlace no corresponde a este restaurante.'],
  ['/casa/otra/t/MESA', 'Este enlace no corresponde a este restaurante.'],
  ['mesa con espacios', 'Revisa el código de tu mesa.'],
])('rechaza el código ajeno o inválido %s', async (codigo, mensaje) => {
  await manual()
  fireEvent.change(screen.getByLabelText('Código o enlace de la mesa'), { target: { value: codigo } })
  await act(async () => pulsar('Abrir mi mesa'))
  expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
  expect(getEntry).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

// Falla si el error de una mesa inexistente impide corregir su código y reintentar.
it('conserva el código rechazado y permite corregirlo', async () => {
  jest.mocked(getEntry).mockRejectedValueOnce(new Error('Esta mesa no existe'))
  await manual()
  fireEvent.change(screen.getByLabelText('Código o enlace de la mesa'), { target: { value: 'MALA' } })
  await act(async () => pulsar('Abrir mi mesa'))
  expect(screen.getByRole('alert')).toHaveTextContent('Esta mesa no existe')
  expect(screen.getByLabelText('Código o enlace de la mesa')).toHaveValue('MALA')
  fireEvent.change(screen.getByLabelText('Código o enlace de la mesa'), { target: { value: 'BUENA' } })
  await act(async () => pulsar('Abrir mi mesa'))
  expect(mockPush).toHaveBeenCalledWith('/casa/centro/t/BUENA')
})

// Falla si buscar el local ignora la consulta o si conectar una mesa pierde la opción de introducir el código.
it('busca el restaurante por dirección y conecta una mesa desde su detalle', async () => {
  await act(async () => render(<SmartLocation entry={entrada} />))
  pulsar(/Elegir restaurante/)
  pulsar('Introducir una ubicación')
  fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'Inexistente' } })
  expect(screen.getByText('No encontramos un local con ese nombre.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'calle 10' } })
  pulsar(/Casa/)
  expect(screen.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=Calle%2010')
  pulsar('Conectar con mi mesa')
  expect(screen.getByLabelText('Código o enlace de la mesa')).toBeVisible()
  pulsar('Volver a las opciones')
  expect(screen.getByText('¿Dónde vas a disfrutar?')).toBeVisible()
})

// Falla si una imagen demasiado grande llega al lector o si un QR ilegible deja al comensal sin alternativa manual.
it('rechaza imágenes grandes y permite introducir el código después de fallar la lectura', async () => {
  const crear = URL.createObjectURL, revocar = URL.revokeObjectURL
  URL.createObjectURL = jest.fn(() => 'blob:qr')
  URL.revokeObjectURL = jest.fn()
  try {
    await act(async () => render(<SmartLocation entry={entrada} rescan />))
    pulsar('Escanear código QR')
    const grande = new File(['foto'], 'grande.png', { type: 'image/png' })
    Object.defineProperty(grande, 'size', { value: 13 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('Foto del código QR'), { target: { files: [grande] } })
    expect(screen.getByRole('alert')).toHaveTextContent('menos de 12 MB')
    expect(mockLeerQr).not.toHaveBeenCalled()
    mockLeerQr.mockRejectedValueOnce(new Error('Imagen borrosa'))
    await act(async () => fireEvent.change(screen.getByLabelText('Foto del código QR'), { target: { files: [new File(['qr'], 'qr.png')] } }))
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos leer ese QR')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr')
    pulsar('Introducir código manualmente')
    expect(screen.getByLabelText('Código o enlace de la mesa')).toBeVisible()
  } finally { URL.createObjectURL = crear; URL.revokeObjectURL = revocar }
})
