import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SmartRewards } from '../SmartEntry'
import { applyCoupon, getRewards } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { prizeText } from '@/lib/domain/rewards'
import type { Account, Cart, DinerRewards, RewardOffer } from '@/lib/types'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), useParams: () => ({ rest: 'demo', sede: 'salon' }), useSearchParams: () => null }))
jest.mock('@/lib/services/api', () => ({ ...jest.requireActual('@/lib/services/api'), getRewards: jest.fn(), applyCoupon: jest.fn() }))
const initial = useDinerStore.getState()
afterEach(() => { useDinerStore.setState(initial, true); jest.clearAllMocks() })

const acciones: RewardOffer[] = [
  { accion: 'cuenta', premio: { tipo: 'descuento', porcentaje: 5 } },
  { accion: 'opinion', premio: { tipo: 'puntos', puntos: 20, programa: 'Puntos Waiter' } },
  { accion: 'novedades', premio: { tipo: 'cupon', codigo: 'HOLA10', nombre: 'Bienvenida', porcentaje: 10, minimo: 30000 } },
]
const account = { id: 'a1', nombre: 'Ana', correo: 'ana@example.invalid', verificada: true, descuentoDisponible: false } as Account
const keys = { rest: 'demo', venue: 'salon', token: 'mesa8' }

// Falla si sin cuenta no se ven las acciones que dan premio, o si crear la cuenta se anuncia dos veces (banner y lista).
it('sin cuenta muestra las acciones de la plantilla e invita a crear la cuenta', () => {
  useDinerStore.setState({ keys, account: null, template: { ...DEFAULT_TEMPLATE, descuento: { porcentaje: 5, activo: true }, acciones } })
  render(<SmartRewards />)
  const more = screen.getByRole('list', { name: 'Gana más' })
  expect(within(more).getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Deja tu opinión de un pedidoGana 20 puntos · Necesitas una cuenta verificada',
    'Suscríbete a las novedadesGana el cupón HOLA10 de 10% desde $\u00a030.000 · Necesitas una cuenta verificada',
  ])
  for (const link of within(more).getAllByRole('link')) expect(link).toHaveAttribute('href', '/demo/salon/t/mesa8/cuenta/registro')
  expect(screen.getByText('5% de descuento en tu pedido')).toBeInTheDocument()
  expect(getRewards).not.toHaveBeenCalled()
})

// Falla si lo ganado no aparece con su origen y estado, si el banner de primera compra sale a quien ya tiene cuenta, si una acción ya hecha sigue en «Gana más», o si «Usar en mi
// pedido» no aplica el cupón ganado y lleva al pedido.
it('con cuenta muestra lo ganado, lo que falta y aplica el cupón ganado', async () => {
  const data: DinerRewards = { tarjeta: 3, codigo: 'M-1', puntos: 120, ganados: 0, programa: 'Puntos Waiter', valorPunto: 10, minimoCanje: 100,
    beneficios: [
      { id: 1, accion: 'novedades', premio: acciones[2].premio, estado: 'disponible', fecha: '2026-09-27' },
      { id: 2, accion: 'opinion', premio: acciones[1].premio, estado: 'acreditado', fecha: '2026-09-27' },
    ],
    acciones: [{ ...acciones[0], hecha: true }, { ...acciones[1], hecha: true }, { ...acciones[2], hecha: true }, { accion: 'pago_en_linea', premio: { tipo: 'descuento', porcentaje: 8 }, hecha: false }] }
  jest.mocked(getRewards).mockResolvedValue(data)
  jest.mocked(applyCoupon).mockResolvedValue({ sesion: 's1', lineas: [], total: 0, mio: 0, por_comensal: [] } as Cart)
  useDinerStore.setState({ keys, account, session: { id: 's1' } as never, template: { ...DEFAULT_TEMPLATE, descuento: { porcentaje: 5, activo: true }, acciones } })
  render(<SmartRewards />)
  const mine = await screen.findByRole('list', { name: 'Tus beneficios' })
  expect(within(mine).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Cupón HOLA10 · 10%Por suscribirte a las novedades · Úsalo en una compra desde $\u00a030.000Usar en mi pedido',
    '+20 puntosPor dejar tu opinión · Ya están en tu saldo',
  ])
  // Ya usó la primera compra: el banner que invita a crear la cuenta no vuelve a salir.
  expect(screen.queryByText('5% de descuento en tu pedido')).not.toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Gana más' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Paga tu pedido en líneaGana 8% de descuento en tu próxima compra'])
  fireEvent.click(within(mine).getByRole('button', { name: 'Usar en mi pedido' }))
  await waitFor(() => expect(applyCoupon).toHaveBeenCalledWith('s1', 'HOLA10'))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/demo/salon/t/mesa8/pedido'))
})

// Falla si un premio se describe mal en el menú (porcentaje, cupón con su mínimo o puntos).
it('describe cada tipo de premio', () => {
  expect(prizeText({ tipo: 'descuento', porcentaje: 12.5 })).toBe('12.5% de descuento en tu próxima compra')
  expect(prizeText({ tipo: 'cupon', codigo: 'X1', nombre: 'X', porcentaje: 10, minimo: 0 })).toBe('el cupón X1 de 10%')
  expect(prizeText({ tipo: 'puntos', puntos: 1500 })).toBe('1.500 puntos')
})
