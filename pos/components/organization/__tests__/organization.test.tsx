import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { anyConfigId, OrgContext } from '../OrgContext'
import { RestaurantsView } from '../RestaurantsView'
import { TeamView } from '../TeamView'
import { messages } from '@/lib/i18n/messages'
import { slugify, validSlug } from '@/lib/domain/slug'
import { restaurantRule, validAssignment } from '@/lib/domain/restaurant'
import { createRestaurant, type Restaurant } from '@/lib/services/restaurants'
import { suggestUsername, validUsername } from '@/lib/domain/slug'
import { deactivatePerson, invitePerson, listPeople, resendInvite, updatePerson, type Person } from '@/lib/services/team'
import { useAuthStore } from '@/lib/stores/authStore'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }))
jest.mock('@/lib/services/restaurants', () => ({ createRestaurant: jest.fn().mockResolvedValue({ id: 3, slug: 'envigado' }) }))
jest.mock('@/lib/services/team', () => ({ listPeople: jest.fn(), invitePerson: jest.fn().mockResolvedValue({ employee_id: 9, user_id: 12 }), updatePerson: jest.fn().mockResolvedValue(true), resendInvite: jest.fn().mockResolvedValue(true), deactivatePerson: jest.fn().mockResolvedValue(true) }))
const chooseRestaurant = jest.fn().mockResolvedValue(undefined)
beforeEach(() => { jest.clearAllMocks(); useAuthStore.setState({ chooseRestaurant, user: { uid: 1, name: 'Dueña', companyId: 1, role: 'owner' } } as never) })

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

const P = (over: Partial<Person>): Person => ({ id: 7, name: 'Sofía Mesera', role: 'waiter', configIds: [1], shift: { from: 14, to: 22 }, userId: 20, username: 'sofia.mesera', email: 'sofia@x.co', status: 'active', ...over })

// Falla si el usuario sugerido lleva tildes, espacios o mayúsculas, o si se acepta uno que Odoo rechazaría.
it('sugiere el usuario desde el nombre', () => {
  expect(suggestUsername('Sofía Mesera')).toBe('sofia.mesera')
  expect(suggestUsername('  José  Ñúñez-Gil ')).toBe('jose.nunez.gil')
  expect(validUsername('sofia.mesera')).toBe(true)
  expect(validUsername('Sofía')).toBe(false)
  expect(validUsername('ab')).toBe(false)
})

// Falla si el alta no sugiere el usuario, deja a un mesero en dos restaurantes o no manda su turno a Odoo (plan P).
it('da de alta a una persona con usuario sugerido, un restaurante y su turno', async () => {
  jest.mocked(listPeople).mockResolvedValue([])
  org(<TeamView />)
  fireEvent.click(await screen.findByRole('button', { name: /Nueva persona/ }))
  const dialog = screen.getByRole('dialog', { name: 'Nueva persona' })
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Mateo Ruiz' } })
  expect(within(dialog).getByLabelText('Usuario')).toHaveValue('mateo.ruiz')
  fireEvent.change(within(dialog).getByLabelText('Correo'), { target: { value: 'Mateo@X.co' } })
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Poblado' }))
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Laureles' }))
  expect(within(dialog).getByRole('radio', { name: 'Poblado' })).not.toBeChecked()
  // Turno a medias no se deja guardar.
  fireEvent.change(within(dialog).getByLabelText('Entra'), { target: { value: '14:00' } })
  expect(within(dialog).getByRole('button', { name: 'Invitar' })).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Sale'), { target: { value: '22:30' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
  await waitFor(() => expect(invitePerson).toHaveBeenCalledWith({ name: 'Mateo Ruiz', username: 'mateo.ruiz', email: 'mateo@x.co', role: 'waiter', configIds: [2], shiftStart: 14, shiftEnd: 22.5 }))
  expect(await screen.findByRole('status')).toHaveTextContent('le llegó a mateo@x.co un código')
})

// Falla si la lista no distingue la invitación pendiente, si editar deja cambiar el usuario o si reenviar y desactivar no
// llaman a Odoo (desactivar pide confirmación).
it('edita, reenvía la invitación y desactiva', async () => {
  jest.mocked(listPeople).mockResolvedValue([P({}), P({ id: 8, name: 'Laura', role: 'admin', configIds: [1, 2], shift: null, username: 'laura', email: 'laura@x.co', status: 'pending', userId: 21 }), P({ id: 1, name: 'Dueña', role: 'owner', configIds: [], userId: 1, username: 'admin' })])
  org(<TeamView />)
  const list = await screen.findByRole('list', { name: 'Personas' })
  const [sofia, laura, owner] = Array.from(list.children) as HTMLElement[]
  expect(sofia).toHaveTextContent('Activa')
  expect(sofia).toHaveTextContent('2:00 p. m. – 10:00 p. m.')
  expect(laura).toHaveTextContent('Invitación pendiente')
  expect(laura).toHaveTextContent('Poblado · Laureles')
  expect(owner).toHaveTextContent('Todos los restaurantes')
  expect(within(owner).queryByRole('button', { name: 'Desactivar' })).toBeNull()

  fireEvent.click(within(laura).getByRole('button', { name: 'Reenviar invitación' }))
  await waitFor(() => expect(resendInvite).toHaveBeenCalledWith(8))

  fireEvent.click(within(sofia).getByRole('button', { name: 'Editar' }))
  const dialog = screen.getByRole('dialog', { name: 'Editar a Sofía Mesera' })
  expect(within(dialog).getByLabelText('Usuario')).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Sale'), { target: { value: '23:00' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(updatePerson).toHaveBeenCalledWith(7, { name: 'Sofía Mesera', email: 'sofia@x.co', role: 'waiter', configIds: [1], shiftStart: 14, shiftEnd: 23 }))

  fireEvent.click(within(sofia).getByRole('button', { name: 'Desactivar' }))
  expect(deactivatePerson).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog', { name: '¿Desactivar a Sofía Mesera?' })).getByRole('button', { name: 'Desactivar' }))
  await waitFor(() => expect(deactivatePerson).toHaveBeenCalledWith(7))
})

// Falla si los ajustes de la organización (promociones, permisos, empresa) se guardan por un restaurante distinto del
// que va en cada petición: Odoo respondía «La operación pertenece a otro restaurante».
it('los ajustes de la organización usan el restaurante en uso', () => {
  const list = [R(1, 'Poblado'), R(2, 'Laureles')]
  expect(anyConfigId(list, 1)).toBe(1)
  expect(anyConfigId(list, 2)).toBe(2)
  expect(anyConfigId(list, 99)).toBe(1)
  expect(anyConfigId(list, null)).toBe(1)
  expect(anyConfigId([], null)).toBeNull()
})
