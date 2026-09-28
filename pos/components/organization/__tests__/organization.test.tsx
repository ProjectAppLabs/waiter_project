import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OrgContext } from '../OrgContext'
import { RestaurantsView } from '../RestaurantsView'
import { TeamView } from '../TeamView'
import { messages } from '@/lib/i18n/messages'
import { slugify, validSlug } from '@/lib/domain/slug'
import { restaurantRule, validAssignment } from '@/lib/domain/restaurant'
import { createRestaurant, type Restaurant } from '@/lib/services/restaurants'
import { listTeamEmployees, listTeamUsers, setEmployeeRestaurants } from '@/lib/services/team'
import { useAuthStore } from '@/lib/stores/authStore'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }))
jest.mock('@/lib/services/restaurants', () => ({ createRestaurant: jest.fn().mockResolvedValue({ id: 3, slug: 'envigado' }) }))
jest.mock('@/lib/services/team', () => ({ listTeamEmployees: jest.fn(), listTeamUsers: jest.fn(), setEmployeeRestaurants: jest.fn().mockResolvedValue(undefined), setUserRestaurants: jest.fn() }))
const chooseRestaurant = jest.fn().mockResolvedValue(undefined)
beforeEach(() => { jest.clearAllMocks(); useAuthStore.setState({ chooseRestaurant } as never) })

const R = (id: number, name: string, open = false): Restaurant => ({ id, name, slug: name.toLowerCase(), street: 'Calle 1', city: 'Medellín', phone: '', open, salesToday: 120000, ordersToday: 4 })
const org = (ui: React.ReactNode, reload = jest.fn().mockResolvedValue(undefined)) => render(<NextIntlClientProvider locale="es" messages={messages}>
  <OrgContext.Provider value={{ restaurants: [R(1, 'Poblado', true), R(2, 'Laureles')], reload, companyName: 'Burger House' }}>{ui}</OrgContext.Provider></NextIntlClientProvider>)

// Falla si la dirección del menú de un restaurante nuevo lleva tildes, espacios o mayúsculas, o si se acepta una inválida.
it('arma el slug del restaurante desde su nombre', () => {
  expect(slugify('Burger House — Laureles Envigado')).toBe('burger-house-laureles-envigado')
  expect(slugify('Café Ñandú')).toBe('cafe-nandu')
  expect(validSlug('laureles-2')).toBe(true)
  expect(validSlug('Laureles 2')).toBe(false)
})

// Falla si un mesero o cajero puede quedar en dos restaurantes o en ninguno, o si al encargado no se le permiten varios.
it('limita los restaurantes según el rol', () => {
  expect(restaurantRule('waiter')).toBe('one')
  expect(validAssignment('cashier', [1, 2])).toBe(false)
  expect(validAssignment('waiter', [])).toBe(false)
  expect(validAssignment('admin', [1, 2])).toBe(true)
  expect(validAssignment('owner', [])).toBe(true)
})

// Falla si la consola no deja entrar al POS de un restaurante o si crear uno nuevo no copia los ajustes del elegido.
it('entra al POS de un restaurante y crea otro copiando ajustes', async () => {
  const reload = jest.fn().mockResolvedValue(undefined)
  org(<RestaurantsView />, reload)
  const laureles = screen.getByRole('list', { name: 'Restaurantes' }).children[1] as HTMLElement
  expect(laureles).toHaveTextContent('Caja cerrada')
  fireEvent.click(within(laureles).getByRole('button', { name: /Entrar al POS/ }))
  await waitFor(() => expect(chooseRestaurant).toHaveBeenCalledWith({ id: 2, name: 'Laureles' }))
  expect(push).toHaveBeenCalledWith('/dashboard')
  fireEvent.click(screen.getByRole('button', { name: /Nuevo restaurante/ }))
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Envigado' } })
  expect(screen.getByLabelText('Dirección del menú')).toHaveValue('envigado')
  fireEvent.change(screen.getByLabelText('Copiar los ajustes de'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }))
  await waitFor(() => expect(createRestaurant).toHaveBeenCalledWith('Envigado', 'envigado', 2))
  expect(reload).toHaveBeenCalled()
})

// Falla si a un mesero se le pueden marcar varios restaurantes o si guardar no manda el restaurante elegido.
it('asigna a un mesero a un solo restaurante', async () => {
  jest.mocked(listTeamEmployees).mockResolvedValue([{ id: 7, name: 'Sofía', detail: 'Con PIN', role: 'waiter', configIds: [1] }, { id: 8, name: 'Dueña', detail: 'Con PIN', role: 'owner', configIds: [] }])
  jest.mocked(listTeamUsers).mockResolvedValue([])
  org(<TeamView />)
  const pin = await screen.findByRole('region', { name: 'Con PIN en el POS' })
  expect(within(pin).getByText('Dueña').parentElement).toHaveTextContent('Todos los restaurantes')
  fireEvent.click(within(pin).getAllByRole('button', { name: /Restaurantes/ })[0])
  const dialog = screen.getByRole('dialog', { name: 'Restaurantes de Sofía' })
  expect(within(dialog).getAllByRole('radio')).toHaveLength(2)
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Laureles' }))
  expect(within(dialog).getByRole('radio', { name: 'Poblado' })).not.toBeChecked()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(setEmployeeRestaurants).toHaveBeenCalledWith(7, [2]))
})
