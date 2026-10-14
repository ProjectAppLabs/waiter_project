import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { AddDishWizard } from '@/components/pantry/AddDishWizard'
import { AddIngredientWizard } from '@/components/pantry/AddIngredientWizard'
import { DishCard } from '@/components/pantry/DishCard'
import { DishDetailModal } from '@/components/pantry/DishDetailModal'
import { FilterPanel } from '@/components/pantry/FilterPanel'
import { IngredientRow } from '@/components/pantry/IngredientRow'
import type { Dish, Ingredient, RecipeLine } from '@/lib/domain/pantry'
import { messages } from '@/lib/i18n/messages'
import { createDish, createIngredient } from '@/lib/services/pantry'

jest.mock('@/lib/services/pantry', () => ({ createDish: jest.fn(async () => 99), createIngredient: jest.fn(async () => 60), updateIngredient: jest.fn(), imageUrl: (id: number) => `/experience/api/pos/v1/photos/${id}?org=null&size=dish&v=` }))
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

const UNITS = [{ key: 'gram' as const, id: 15, uomName: 'g' }, { key: 'kilogram' as const, id: 16, uomName: 'kg' }]
const cheese: Ingredient = { id: 37, name: 'Queso cheddar', category: 'dairy', qty: 1.5, uomId: 16, uomName: 'kg', level: 'low', status: 'request', supplierId: 58, supplierName: 'Distribuidora La Finca', hasImage: false, min: 5, max: 20 }
const burger: Dish = { id: 2, name: 'Hamburguesa Clásica', categoryIds: [1], hasImage: true, price: 32000, availableInPos: true, hasRecipe: true, servings: 30, level: 'high' }
const line: RecipeLine = { id: 21, ingredientId: 35, name: 'Carne de res Angus', qty: 150, uomName: 'g', level: 'medium', status: 'normal', servings: 80 }

// Falla si la tarjeta del menú pierde el badge Disponible, las raciones servibles o el nivel del kit.
it('dish card shows availability, servings and level', async () => {
  const onOpen = jest.fn()
  wrap(<DishCard dish={burger} category="Hamburguesas" onOpen={onOpen} />)
  expect(screen.getByText('Disponible')).toBeInTheDocument()
  expect(screen.getByText('Se pueden servir:').parentElement).toHaveTextContent('Se pueden servir: 30')
  expect(screen.getByText('Alto')).toHaveClass('text-success-ink')
  await userEvent.click(screen.getByRole('button', { name: /Hamburguesa Clásica/ }))
  expect(onOpen).toHaveBeenCalled()
})

// Falla si un plato sin receta muestra raciones inventadas en vez de "Sin receta" y el nivel vacío "—".
it('dish card without recipe says so instead of showing numbers', () => {
  wrap(<DishCard dish={{ ...burger, hasRecipe: false, servings: 0, level: null }} category="Hamburguesas" onOpen={() => undefined} />)
  expect(screen.getByText('Sin receta')).toBeInTheDocument()
  expect(screen.getByText('—')).toBeInTheDocument()
})

// Falla si el detalle no lista la receta de recipe_lines con cantidad, unidad y nivel del ingrediente.
it('dish detail lists the recipe with quantity, unit and ingredient level', () => {
  wrap(<DishDetailModal dish={burger} category="Hamburguesas" lines={[line]} loading={false} onClose={() => undefined} />)
  const dialog = screen.getByRole('dialog', { name: 'Detalle del plato' })
  expect(within(dialog).getByText('Se pueden servir 30')).toBeInTheDocument()
  const row = within(dialog).getByRole('listitem')
  expect(row).toHaveTextContent('Carne de res Angus')
  expect(row).toHaveTextContent('150 g')
  expect(within(row).getByText('Medio')).toBeInTheDocument()
})

// Falla si la fila del ingrediente pierde el stock con unidad, el proveedor, el estado o las tres acciones del menú ⋯.
it('ingredient row shows stock, supplier, status and the more menu actions', async () => {
  const onRequest = jest.fn()
  wrap(<ul><IngredientRow ingredient={cheese} onEdit={() => undefined} onRequest={onRequest} onDelete={() => undefined} /></ul>)
  expect(screen.getByText('Stock: 1,5 kg')).toBeInTheDocument()
  expect(screen.getByText('Distribuidora La Finca')).toBeInTheDocument()
  expect(screen.getByText('Solicitar')).toHaveClass('bg-danger-soft')
  await userEvent.click(screen.getByRole('button', { name: 'Más opciones de Queso cheddar' }))
  expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Editar ingrediente', 'Solicitar ingrediente', 'Eliminar ingrediente'])
  await userEvent.click(screen.getByRole('menuitem', { name: 'Solicitar ingrediente' }))
  expect(onRequest).toHaveBeenCalled()
})

// Falla si el panel de filtros no pinta los chips con conteo o si "Restablecer filtros" no avisa.
it('filter panel renders chips with counts and resets', async () => {
  const onReset = jest.fn()
  const onClick = jest.fn()
  wrap(<FilterPanel onReset={onReset} sections={[{ title: 'NIVEL DE STOCK', options: [{ key: 'all', label: 'Todos', count: 8, active: true, onClick }, { key: 'low', label: 'Bajo', count: 3, active: false, onClick }] }]} />)
  expect(screen.getByRole('button', { name: /Todos 8/ })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: /Bajo 3/ }))
  expect(onClick).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }))
  expect(onReset).toHaveBeenCalled()
})

// Falla si el wizard deja pasar un plato sin datos, o si al enviar no llega al addon con su categoría, precio y receta.
it('add dish wizard validates step one and creates the dish with its recipe', async () => {
  const onSaved = jest.fn(async () => undefined)
  wrap(<AddDishWizard open onClose={() => undefined} onSaved={onSaved} categories={[{ id: 1, name: 'Hamburguesas', sequence: 1, station: null }]} ingredients={[cheese]} units={UNITS} />)
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre del plato.')
  await userEvent.type(screen.getByPlaceholderText('Escribe el nombre del plato'), 'Burger BBQ')
  await userEvent.click(screen.getByRole('button', { name: 'Hamburguesas' }))
  await userEvent.type(screen.getByLabelText('Precio'), '35000')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
  await userEvent.selectOptions(screen.getByLabelText('Nombre del ingrediente'), '37')
  await userEvent.type(screen.getByLabelText('Cantidad'), '30')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y enviar' }))
  expect(createDish).toHaveBeenCalledWith({ name: 'Burger BBQ', categoryIds: [1], description: '', price: 35000, recipe: [{ ingredientId: 37, qty: 30, uomId: 16 }] })
})

// Falla si el alta de ingrediente pierde los dos pasos del kit (categoría y unidad en chips, proveedor en rejilla).
it('add ingredient wizard walks the two kit steps and creates the ingredient', async () => {
  const onSaved = jest.fn(async () => undefined)
  wrap(<AddIngredientWizard open onClose={() => undefined} onSaved={onSaved} units={UNITS} suppliers={[{ id: 58, name: 'Distribuidora La Finca', hasImage: false }]} />)
  await userEvent.type(screen.getByPlaceholderText('Escribe el nombre del ingrediente'), 'Cilantro')
  await userEvent.click(screen.getByRole('button', { name: /Frutas y verduras/ }))
  await userEvent.type(screen.getByPlaceholderText('Cantidad en stock'), '3')
  await userEvent.click(screen.getByRole('button', { name: 'Kilogramo (kg)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }))
  await userEvent.click(screen.getByRole('radio', { name: /Distribuidora La Finca/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y enviar' }))
  expect(createIngredient).toHaveBeenCalledWith({ name: 'Cilantro', category: 'produce', uomId: 16, stock: 3, image: undefined, supplierId: 58 })
})
