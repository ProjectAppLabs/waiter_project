import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OrgContext } from '../OrgContext'
import { CatalogView } from '../CatalogView'
import { DishCard } from '@/components/pantry/DishCard'
import { messages } from '@/lib/i18n/messages'
import { loadMasterCatalog, setDishAvailability, setDishPrice } from '@/lib/services/masterCatalog'
import type { Restaurant } from '@/lib/services/restaurants'
import type { Dish } from '@/lib/domain/pantry'

jest.mock('@/lib/services/masterCatalog', () => ({ loadMasterCatalog: jest.fn(), setDishAvailability: jest.fn().mockResolvedValue(true), setDishPrice: jest.fn() }))
jest.mock('@/lib/services/pantry', () => ({ imageUrl: (id: number) => `/img/${id}` }))
const R = (id: number, name: string): Restaurant => ({ id, name, slug: name.toLowerCase(), street: '', city: '', phone: '', open: false, salesToday: 0, ordersToday: 0 })
const view = () => render(<NextIntlClientProvider locale="es" messages={messages}>
  <OrgContext.Provider value={{ restaurants: [R(1, 'Poblado'), R(2, 'Laureles')], reload: async () => undefined, companyName: 'Burger House' }}><CatalogView /></OrgContext.Provider></NextIntlClientProvider>)
afterEach(() => jest.clearAllMocks())

// Falla si el catálogo maestro no muestra el precio local de cada restaurante, si guardar un precio no va al restaurante
// de esa columna, si dejarlo vacío no vuelve al de la organización o si el agotado no es por restaurante.
it('cambia precio y disponibilidad de un plato en un solo restaurante', async () => {
  jest.mocked(loadMasterCatalog).mockResolvedValue({ dishes: [{ templateId: 10, variantId: 20, name: 'Hamburguesa', category: 'Hamburguesas', basePrice: 32000, unavailableIn: [] }],
    prices: { 1: { 20: 32000 }, 2: { 20: 35000 } } })
  view()
  const laureles = await screen.findByLabelText('Precio de Hamburguesa en Laureles')
  expect(laureles).toHaveValue('35.000')
  expect(screen.getByLabelText('Precio de Hamburguesa en Poblado')).toHaveValue('')
  jest.mocked(setDishPrice).mockResolvedValueOnce(33000)
  fireEvent.change(screen.getByLabelText('Precio de Hamburguesa en Poblado'), { target: { value: '33000' } })
  fireEvent.blur(screen.getByLabelText('Precio de Hamburguesa en Poblado'))
  await waitFor(() => expect(setDishPrice).toHaveBeenCalledWith(1, 10, 33000))
  jest.mocked(setDishPrice).mockResolvedValueOnce(32000)
  fireEvent.change(laureles, { target: { value: '' } }); fireEvent.blur(laureles)
  await waitFor(() => expect(setDishPrice).toHaveBeenLastCalledWith(2, 10, null))
  fireEvent.click(screen.getByRole('switch', { name: 'Hamburguesa disponible en Laureles' }))
  await waitFor(() => expect(setDishAvailability).toHaveBeenCalledWith(10, 2, false))
  expect(await screen.findByRole('switch', { name: 'Hamburguesa disponible en Laureles' })).toHaveTextContent('Agotado aquí')
  expect(screen.getByRole('switch', { name: 'Hamburguesa disponible en Poblado' })).toHaveTextContent('Disponible')
})

// Falla si Inventario no deja al encargado agotar o volver a ofrecer un plato solo en su restaurante, o si la tarjeta
// no dice que está agotado aquí.
it('la tarjeta del plato agota o vuelve a ofrecer en este restaurante', () => {
  const toggle = jest.fn()
  const dish = { id: 10, name: 'Hamburguesa', categoryIds: [1], hasImage: false, level: 'high', servings: 5 } as unknown as Dish
  const { rerender } = render(<NextIntlClientProvider locale="es" messages={messages}><DishCard dish={dish} category="Hamburguesas" onOpen={() => undefined} onToggleHere={toggle} /></NextIntlClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Marcar Hamburguesa como agotado en este restaurante' }))
  expect(toggle).toHaveBeenCalled()
  rerender(<NextIntlClientProvider locale="es" messages={messages}><DishCard dish={dish} category="Hamburguesas" onOpen={() => undefined} closedHere onToggleHere={toggle} /></NextIntlClientProvider>)
  expect(screen.getByText('Agotado aquí')).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: 'Volver a ofrecer Hamburguesa en este restaurante' })).getByText('Volver a ofrecer')).toBeInTheDocument()
})
