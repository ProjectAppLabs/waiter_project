import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OrganizationLanding from '../[rest]/page'
import { getEntry, getOrganization, quoteDelivery } from '@/lib/services/api'

const replace = jest.fn(), push = jest.fn()
jest.mock('next/navigation', () => ({ useParams: () => ({ rest: 'burger-house' }), useRouter: () => ({ replace, push }) }))
jest.mock('@/lib/services/api', () => ({ getOrganization: jest.fn(), getEntry: jest.fn().mockRejectedValue(new Error('sin tema')), quoteDelivery: jest.fn() }))
afterEach(() => jest.clearAllMocks())

// Falla si la portada de una organización con un solo restaurante no lleva directo a su menú (plan O).
it('con un solo restaurante lleva a su menú', async () => {
  jest.mocked(getOrganization).mockResolvedValue({ organizacion: { slug: 'burger-house', nombre: 'Burger House' }, restaurantes: [{ slug: 'poblado', nombre: 'Poblado' }] })
  render(<OrganizationLanding />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/burger-house/poblado/'))
  expect(getEntry).not.toHaveBeenCalled()
})

// Falla si con varios restaurantes la portada no deja elegir a cuál entrar o enlaza mal su menú.
it('con varios restaurantes deja elegir', async () => {
  jest.mocked(getOrganization).mockResolvedValue({ organizacion: { slug: 'burger-house', nombre: 'Burger House' },
    restaurantes: [{ slug: 'poblado', nombre: 'Poblado', direccion: 'Calle 10' }, { slug: 'laureles', nombre: 'Laureles' }] })
  render(<OrganizationLanding />)
  const list = await screen.findByRole('navigation', { name: 'Restaurantes' })
  expect(within(list).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['PobladoCalle 10', '/burger-house/poblado/'], ['Laureles', '/burger-house/laureles/']])
  expect(replace).not.toHaveBeenCalled()
})


// Falla si la portada pide la ubicación al cargar (debe pedirse con el botón), si el botón no lleva a la sede que le
// llega con su ubicación lista, o si cuando ninguna le llega no lo dice.
it('lleva a la sede más cercana con el botón', async () => {
  const pedir = jest.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 5.83, longitude: -73.03 } }))
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: pedir } })
  jest.mocked(getOrganization).mockResolvedValue({ organizacion: { slug: 'burger-house', nombre: 'Burger House' },
    restaurantes: [{ slug: 'poblado', nombre: 'Poblado' }, { slug: 'duitama', nombre: 'Duitama' }] })
  jest.mocked(quoteDelivery).mockResolvedValueOnce({ cobertura: true, sede: { slug: 'duitama', nombre: 'Duitama' }, distancia_km: .5, envio: 3000, minimo: 0, metodos: ['cash'] })
    .mockResolvedValueOnce({ cobertura: false, motivo: 'fuera_de_zona', recoger: [] })
  render(<OrganizationLanding />)
  const boton = await screen.findByRole('button', { name: '📍 Ver la sede más cercana' })
  expect(pedir).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(boton))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/burger-house/duitama/'))
  expect(JSON.parse(sessionStorage.getItem('waiter:domicilio:burger-house')!)).toMatchObject({ venue: 'duitama', location: { lat: 5.83, lng: -73.03 } })
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: '📍 Ver la sede más cercana' })))
  expect(await screen.findByText(/Ninguna sede lleva domicilios/)).toBeInTheDocument()
})
