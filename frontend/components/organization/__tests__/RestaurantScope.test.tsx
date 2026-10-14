import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { OrgContext } from '@/components/organization/OrgContext'
import { RestaurantScope } from '@/components/organization/RestaurantScope'
import type { Restaurant } from '@/lib/services/restaurants'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog } from '@/lib/types'

const RESTAURANTS = [{ id: 1, name: 'Centro' }, { id: 2, name: 'Norte' }] as Restaurant[]
const catalogOf = (id: number | null) => (id === null ? null : ({ settings: { configId: id } } as Catalog))
// Elegir restaurante lo deja en el dispositivo; cargar la carta la deja con el id del restaurante elegido.
const chooseRestaurant = jest.fn(async (r: { id: number; name: string } | null) => { useAuthStore.setState({ restaurant: r }) })
const load = jest.fn(async () => { useCatalogStore.setState({ catalog: catalogOf(useAuthStore.getState().restaurant?.id ?? null) }) })
const mount = (restaurants = RESTAURANTS) => render(
  <OrgContext.Provider value={{ restaurants, reload: async () => undefined, companyName: 'Burger SAS' }}>
    <RestaurantScope label="Restaurante"><p>Ventas del restaurante</p></RestaurantScope>
  </OrgContext.Provider>)

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ restaurant: null, session: null, chooseRestaurant })
  useCatalogStore.setState({ catalog: null, load })
})

// Falla si al entrar sin restaurante elegido no se toma el primero y se carga su carta, o si la vista se pinta antes.
it('al entrar elige el primer restaurante, carga su carta y luego muestra la vista', async () => {
  mount()
  expect(await screen.findByText('Ventas del restaurante')).toBeInTheDocument()
  expect(chooseRestaurant).toHaveBeenCalledWith({ id: 1, name: 'Centro' })
  expect(load).toHaveBeenCalledWith(null)
  expect(screen.getByRole('button', { name: 'Centro' })).toHaveAttribute('aria-pressed', 'true')
})

// Falla si cambiar de restaurante no lo elige ni carga su carta, o si mientras tanto se ven los datos del anterior.
it('cambiar de restaurante carga el suyo sin mostrar los datos del anterior', async () => {
  useAuthStore.setState({ restaurant: { id: 1, name: 'Centro' } })
  useCatalogStore.setState({ catalog: catalogOf(1) })
  mount()
  expect(screen.getByText('Ventas del restaurante')).toBeInTheDocument()
  expect(load).not.toHaveBeenCalled()
  let finish!: () => void
  load.mockImplementationOnce(() => new Promise<void>((r) => { finish = () => { useCatalogStore.setState({ catalog: catalogOf(2) }); r() } }))
  fireEvent.click(screen.getByRole('button', { name: 'Norte' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cargando Norte…'))
  expect(screen.queryByText('Ventas del restaurante')).not.toBeInTheDocument()
  await act(async () => finish())
  expect(screen.getByText('Ventas del restaurante')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Norte' })).toHaveAttribute('aria-pressed', 'true')
})

// Falla si un restaurante del dispositivo que ya no está en la lista se queda elegido en vez de pasar al primero.
it('si el restaurante del dispositivo no es de la lista usa el primero', async () => {
  useAuthStore.setState({ restaurant: { id: 9, name: 'Viejo' } })
  mount()
  expect(await screen.findByText('Ventas del restaurante')).toBeInTheDocument()
  expect(chooseRestaurant).toHaveBeenCalledWith({ id: 1, name: 'Centro' })
})

// Falla si un fallo al cargar el restaurante no se muestra, o si un error que no es Error no tiene texto propio.
it('muestra el error al cargar el restaurante', async () => {
  useAuthStore.setState({ restaurant: { id: 1, name: 'Centro' } })
  load.mockRejectedValueOnce(new Error('Sin conexión'))
  const { unmount } = mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(screen.getByRole('status')).toHaveTextContent('Cargando Centro…')
  unmount()
  load.mockRejectedValueOnce('raro')
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el restaurante.')
})

// Falla si sin restaurantes en la organización se intenta cargar algo o la pantalla se cae.
it('sin restaurantes solo dice que carga', () => {
  mount([])
  expect(screen.getByRole('status')).toHaveTextContent('Cargando el restaurante…')
  expect(chooseRestaurant).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
})

// Falla si al entrar sin restaurante elegido la carta se pide más de una vez: elegir el restaurante cambia el del
// dispositivo, el efecto se vuelve a correr y la primera pasada sigue y también carga. Error real (corregido el 2026-10-04): dos
// cargas de la carta en paralelo en cada entrada a la consola del dueño.
it('al entrar carga la carta una sola vez', async () => {
  mount()
  expect(await screen.findByText('Ventas del restaurante')).toBeInTheDocument()
  expect(load).toHaveBeenCalledTimes(1)
})
