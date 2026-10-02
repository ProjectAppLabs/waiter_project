import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CatalogConsole } from '@/components/organization/CatalogConsole'
import { catalogOverview, recipeState, setIngredientCost } from '@/lib/services/catalogOverview'
import { usePantryStore } from '@/lib/stores/pantryStore'

jest.mock('@/lib/services/catalogOverview', () => ({ ...jest.requireActual('@/lib/services/catalogOverview'), catalogOverview: jest.fn(), setIngredientCost: jest.fn().mockResolvedValue({ template_id: 11, cost: 5000 }) }))
// Los editores son los de Inventario, con sus propias pruebas: aquí solo importa que se abran con el plato correcto.
jest.mock('@/components/pantry/RecipeEditor', () => ({ RecipeEditor: ({ dish }: { dish: { name: string } }) => <div role="dialog" aria-label={`Receta de ${dish.name}`} /> }))
jest.mock('@/components/pantry/MenuAdmin', () => ({ MenuAdmin: ({ request }: { request: { kind: string; id?: number } }) => <div role="dialog" aria-label={`Ficha ${request.kind} ${request.id ?? ''}`} /> }))
jest.mock('@/components/pantry/AddDishWizard', () => ({ AddDishWizard: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Nuevo plato" /> : null) }))
jest.mock('@/components/pantry/AddIngredientWizard', () => ({ AddIngredientWizard: () => <div role="dialog" aria-label="Ingrediente" /> }))
jest.mock('@/components/organization/CatalogView', () => ({ CatalogView: () => <p>Precios por restaurante</p> }))

const dish = (templateId: number, name: string, over: object = {}) => ({ templateId, name, categories: ['Platos'], categoryIds: [1], listPrice: 10000, availableInPos: true,
  hasImage: true, hasRecipe: true, ingredientsCount: 1, recipeCost: 2500, missingCosts: [], ...over })
beforeEach(() => {
  jest.clearAllMocks()
  usePantryStore.setState({ load: jest.fn(async () => undefined), refresh: jest.fn(async () => undefined), ingredients: [], units: [], posCategories: [], suppliers: [] } as never)
  jest.mocked(catalogOverview).mockResolvedValue({ currency: 'COP',
    dishes: [dish(1, 'Papas'), dish(2, 'Arepa', { hasRecipe: false, ingredientsCount: 0, recipeCost: null }), dish(3, 'Bowl', { recipeCost: null, missingCosts: ['Salmón'], availableInPos: false })],
    ingredients: [{ templateId: 11, name: 'Papa criolla', uom: 'kg', cost: 4500, usedIn: 1 }, { templateId: 12, name: 'Salmón', uom: 'kg', cost: 0, usedIn: 1 }, { templateId: 13, name: 'Huevos', uom: 'Units', cost: 700, usedIn: 0 }] })
})

// Falla si un plato sin receta se confunde con uno al que le falta el costo de un ingrediente (son arreglos distintos).
it('distingue sin receta, sin costo y con costo', () => {
  expect(recipeState(dish(1, 'a'))).toBe('costed')
  expect(recipeState(dish(1, 'a', { hasRecipe: false, recipeCost: null }))).toBe('noRecipe')
  expect(recipeState(dish(1, 'a', { recipeCost: null }))).toBe('missingCost')
})

// Falla si la lista no dice qué le falta a cada receta, si el filtro «Sin costo» no aísla esos platos o si los botones no
// abren la ficha y la receta del plato correcto (plan R: el dueño ya no entra al POS para esto).
it('lista los platos con el estado de su receta y abre sus editores', async () => {
  render(<CatalogConsole initialFilter="all" />)
  const papas = await screen.findByRole('row', { name: /Papas/ })
  expect(papas).toHaveTextContent('$ 2.500')
  expect(papas).toHaveTextContent('25 %')
  const bowl = screen.getByRole('row', { name: /Bowl/ })
  expect(bowl).toHaveTextContent('Falta el costo de Salmón')
  expect(bowl).toHaveTextContent('fuera de la carta')
  fireEvent.click(screen.getByRole('button', { name: /Sin costo/ }))
  expect(screen.queryByRole('row', { name: /Papas/ })).toBeNull()
  expect(screen.getByRole('row', { name: /Bowl/ })).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('row', { name: /Bowl/ })).getByRole('button', { name: 'Receta' }))
  expect(screen.getByRole('dialog', { name: 'Receta de Bowl' })).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('row', { name: /Bowl/ })).getByRole('button', { name: 'Ficha' }))
  expect(screen.getByRole('dialog', { name: 'Ficha product 3' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Nuevo plato/ }))
  expect(screen.getByRole('dialog', { name: 'Nuevo plato' })).toBeInTheDocument()
})

// Falla si Rentabilidad no puede abrir el catálogo filtrado o si «Sin receta» y «Crear receta» no se ofrecen juntos.
it('abre con el filtro que pide Rentabilidad', async () => {
  render(<CatalogConsole initialFilter="noRecipe" />)
  const arepa = await screen.findByRole('row', { name: /Arepa/ })
  expect(within(arepa).getByRole('button', { name: 'Crear receta' })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /Papas/ })).toBeNull()
})

// Falla si el costo del ingrediente no se guarda para la organización, si se acepta uno negativo o si la lista no se
// relee después (el costo de las recetas cambia con él).
it('guarda el costo de un ingrediente', async () => {
  render(<CatalogConsole initialTab="ingredients" />)
  const input = await screen.findByLabelText('Costo de Papa criolla por kg')
  expect(screen.getByRole('row', { name: /Salmón/ })).toHaveTextContent('Sin costo')
  // Falla si la unidad sale en inglés («por Units»).
  expect(screen.getByLabelText('Costo de Huevos por unidad')).toBeInTheDocument()
  fireEvent.change(input, { target: { value: '-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  // El campo (min=0) no deja enviar un negativo; si llegara, la vista también lo rechaza.
  expect(setIngredientCost).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(setIngredientCost).toHaveBeenCalledWith(11, 5000))
  await waitFor(() => expect(catalogOverview).toHaveBeenCalledTimes(2))
  expect(await screen.findByRole('status')).toHaveTextContent('Costo de Papa criolla guardado')
})

// Falla si tocar una cabecera no ordena (ascendente, descendente y de vuelta al original), si los platos sin costo no
// quedan al final o si la búsqueda distingue tildes.
it('ordena por columna y busca sin tildes', async () => {
  render(<CatalogConsole />)
  await screen.findByRole('row', { name: /Papas/ })
  const names = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent?.match(/^(Papas|Arepa|Bowl)/)?.[0])
  const cost = screen.getByRole('button', { name: 'Costo' })
  fireEvent.click(cost)
  expect(screen.getByRole('columnheader', { name: 'Costo' })).toHaveAttribute('aria-sort', 'ascending')
  expect(names()).toEqual(['Papas', 'Arepa', 'Bowl'])
  fireEvent.click(screen.getByRole('button', { name: 'Plato' }))
  expect(names()).toEqual(['Arepa', 'Bowl', 'Papas'])
  fireEvent.click(screen.getByRole('button', { name: 'Plato' }))
  expect(names()).toEqual(['Papas', 'Bowl', 'Arepa'])
  fireEvent.click(screen.getByRole('button', { name: 'Plato' }))
  expect(screen.getByRole('columnheader', { name: 'Plato' })).toHaveAttribute('aria-sort', 'none')
  fireEvent.change(screen.getByLabelText('Buscar plato'), { target: { value: 'AREPA' } })
  expect(names()).toEqual(['Arepa'])
})
