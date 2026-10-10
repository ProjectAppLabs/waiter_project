import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LocateDelivery } from '../LocateDelivery'
import { SavedAddresses } from '../SavedAddresses'
import { SmartCart } from '../SmartOrder'
import { deleteAddress, getLocateLink, revokeData, savedAddresses, sendLocateLink } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Entry } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => null }))
jest.mock('@/lib/services/api')
// El mapa real necesita un navegador; aquí basta un pin que se mueve con un botón.
jest.mock('next/dynamic', () => () => function Mapa({ onChange }: { onChange: (p: { lat: number; lng: number }) => void }) {
  return <button type="button" onClick={() => onChange({ lat: 6.2, lng: -75.57 })}>Marcar en el mapa</button>
})
const inicial = useDinerStore.getInitialState()
beforeEach(() => { jest.resetAllMocks(); useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'salon', token: null } }, true) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si el enlace de WhatsApp no deja marcar la entrega y enviarla, si un enlace usado sigue sirviendo o si no se
// avisa cuando la dirección queda fuera de la zona.
it('ubica la entrega desde el enlace de WhatsApp', async () => {
  jest.mocked(getLocateLink).mockResolvedValueOnce({ restaurante: 'demo', sede: { slug: 'salon', nombre: 'El Poblado' }, usado: false })
  jest.mocked(sendLocateLink).mockResolvedValue({ ok: true, cobertura: false })
  const { unmount } = render(<LocateDelivery token="tok" />)
  expect(await screen.findByText('El Poblado')).toBeInTheDocument()
  const enviar = screen.getByRole('button', { name: 'Enviar ubicación' })
  expect(enviar).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar en el mapa' }))
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 9 # 40-10' } })
  await act(async () => fireEvent.click(enviar))
  expect(sendLocateLink).toHaveBeenCalledWith('tok', { lat: 6.2, lng: -75.57, direccion: 'Calle 9 # 40-10', indicaciones: '' })
  expect(await screen.findByText(/fuera de nuestra zona/)).toBeInTheDocument()
  unmount()
  jest.mocked(getLocateLink).mockResolvedValueOnce({ restaurante: 'demo', usado: true })
  render(<LocateDelivery token="tok" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace ya no sirve')
})

// Falla si el comensal no puede borrar una dirección o retirar su autorización, o si sin direcciones aparece la sección.
it('borra direcciones y retira la autorización', async () => {
  jest.mocked(savedAddresses).mockResolvedValue([{ id: 3, etiqueta: 'Casa', direccion: 'Calle 9', indicaciones: 'Apto 301', lat: 6.2, lng: -75.5 }, { id: 4, etiqueta: 'Oficina', direccion: 'Carrera 43', indicaciones: '', lat: 6.2, lng: -75.5 }])
  jest.mocked(deleteAddress).mockResolvedValue()
  jest.mocked(revokeData).mockResolvedValue()
  render(<SavedAddresses />)
  expect(await screen.findByText(/Calle 9/)).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Borrar' })[0]))
  expect(deleteAddress).toHaveBeenCalledWith('demo', 3)
  expect(screen.queryByText(/Calle 9/)).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retirar la autorización de mis datos' })))
  expect(revokeData).toHaveBeenCalledWith('demo')
  expect(screen.getByText(/retiraste la autorización/)).toBeInTheDocument()
})

// Falla si una sede sin domicilio ofrece «A domicilio» al confirmar.
it('no ofrece domicilio si la sede no lo tiene', async () => {
  const carrito: Cart = { sesion: 'v', total: 9000, mio: 9000, por_comensal: [], lineas: [{ id: 1, producto_id: 7, nombre: 'Sopa', cantidad: 1, precio: 9000, subtotal: 9000, mio: true, comensal: 'a', nota: '' }] }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  useDinerStore.setState({ cart: carrito, entry: { domicilio: { enabled: false, buscador: false }, contexto: { mesa: null }, carta: { categorias: [] } } as unknown as Entry })
  render(<SmartCart />)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recoger en el local' })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'A domicilio' })).toBeNull()
})
