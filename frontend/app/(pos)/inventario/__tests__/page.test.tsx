import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import InventarioPage from '@/app/(pos)/inventario/page'
import { messages } from '@/lib/i18n/messages'
import type { Dish, Ingredient } from '@/lib/domain/pantry'
import { downloadExport } from '@/lib/services/core/exports'
import { closedDishes, setDishAvailability } from '@/lib/services/masterCatalog'
import { archiveIngredient, requestIngredient } from '@/lib/services/pantry'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { usePantryStore } from '@/lib/stores/pantryStore'

jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 4 }))
jest.mock('@/lib/services/masterCatalog', () => ({ closedDishes: jest.fn(async () => new Set<number>()), setDishAvailability: jest.fn(async () => undefined) }))
jest.mock('@/lib/services/pantry', () => ({ ...jest.requireActual('@/lib/services/pantry'), archiveIngredient: jest.fn(async () => undefined), requestIngredient: jest.fn(async () => undefined) }))
jest.mock('@/lib/services/restaurantInventory', () => ({ getRecipe: jest.fn() }))
jest.mock('@/lib/services/core/exports', () => ({ downloadExport: jest.fn(async (kind: string) => `${kind}.csv`) }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
// Los asistentes y editores tienen sus propias pruebas; aquí basta saber si se abren.
jest.mock('@/components/pantry/AddDishWizard', () => ({ AddDishWizard: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Nuevo plato" /> : null) }))
jest.mock('@/components/pantry/AddIngredientWizard', () => ({ AddIngredientWizard: () => <div role="dialog" aria-label="Ingrediente" /> }))
jest.mock('@/components/pantry/MenuAdmin', () => ({ MenuAdmin: () => null }))
jest.mock('@/components/pantry/RecipeEditor', () => ({ RecipeEditor: () => null }))
jest.mock('@/components/pantry/InventoryControl', () => ({ InventoryControl: () => null }))

const dish = (id: number, name: string): Dish => ({ id, name, categoryIds: [1], hasImage: false, price: 20000, availableInPos: true, hasRecipe: false, servings: 0, level: null })
const ingredient: Ingredient = { id: 30, name: 'Tomate', category: null, qty: 2, uomId: 1, uomName: 'kg', level: 'low', status: null, supplierId: null, supplierName: null, hasImage: false, min: 5, max: 20 }
const refresh = jest.fn(async () => undefined)

function as(role: 'owner' | 'admin' | 'waiter') {
  useAuthStore.setState({ user: { uid: 1, name: 'Persona', companyId: 1, role: role === 'owner' ? 'owner' : role } as never, employee: { role } as never, session: { id: 1, configId: 4, state: 'opened' } })
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><InventarioPage /></NextIntlClientProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  useCatalogStore.setState({ catalog: { settings: { waiterCanEditInventory: false } } as never, load: jest.fn(async () => undefined) })
  usePantryStore.setState({ tab: 'menu', loading: false, error: null, dishes: [dish(10, 'Hamburguesa'), dish(11, 'Perro')], ingredients: [ingredient], requests: [], posCategories: [{ id: 1, name: 'Platos' } as never], load: jest.fn(async () => undefined), refresh })
})

// Falla si el encargado puede crear platos (es del dueño, plan Q) o si el dueño pierde el botón.
it('crear platos es solo del dueño', () => {
  as('admin')
  const { unmount } = wrap()
  expect(screen.queryByRole('button', { name: /Agregar plato/ })).toBeNull()
  unmount()
  as('owner')
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /Agregar plato/ }))
  expect(screen.getByRole('dialog', { name: 'Nuevo plato' })).toBeInTheDocument()
})

// Falla si el encargado no puede marcar un plato como agotado en su restaurante, o si el cambio no va a ese local.
it('el encargado agota un plato en su restaurante', async () => {
  as('admin')
  wrap()
  await waitFor(() => expect(closedDishes).toHaveBeenCalledWith([10, 11], 4))
  fireEvent.click(screen.getByRole('button', { name: 'Marcar Hamburguesa como agotado en este restaurante' }))
  await waitFor(() => expect(setDishAvailability).toHaveBeenCalledWith(10, 4, false))
  expect(await screen.findByRole('button', { name: 'Volver a ofrecer Hamburguesa en este restaurante' })).toHaveAttribute('aria-pressed', 'true')
})

// Falla si solicitar o eliminar un ingrediente no llega al servidor, si eliminar no pide confirmación, o si la lista no
// se relee después.
it('solicita y elimina un ingrediente con confirmación', async () => {
  as('owner')
  usePantryStore.setState({ tab: 'ingredients' })
  wrap()
  const more = () => fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Tomate' }))
  more()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Solicitar ingrediente' }))
  await waitFor(() => expect(requestIngredient).toHaveBeenCalledWith(30))
  more()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar ingrediente' }))
  expect(archiveIngredient).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, eliminar' }))
  await waitFor(() => expect(archiveIngredient).toHaveBeenCalledWith(30))
  expect(refresh).toHaveBeenCalledTimes(2)
})

// Falla si los exportes de inventario no van con el local del POS y los últimos 30 días (plan Y1).
it('exporta existencias y movimientos del local', async () => {
  as('admin')
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Movimientos (últimos 30 días)' }))
  await waitFor(() => expect(downloadExport).toHaveBeenCalledWith('movimientos', expect.objectContaining({ restaurant_id: 4 })))
  const { from, to } = jest.mocked(downloadExport).mock.calls[0][1] as { from: string; to: string }
  expect((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000).toBe(30)
})
