import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CategoryPanel } from '@/components/catalog/CategoryPanel'
import { messages } from '@/lib/i18n/messages'
import type { AdminCategory } from '@/lib/services/catalogAdmin'

const CATEGORIES: AdminCategory[] = [{ id: 1, name: 'Hamburguesas', sequence: 1, station: 'Parrilla' }, { id: 2, name: 'Bebidas', sequence: 2, station: null }]
const mount = (props: Partial<React.ComponentProps<typeof CategoryPanel>> = {}) => {
  const onSave = jest.fn().mockResolvedValue(undefined), onClose = jest.fn()
  const all = { categories: CATEGORIES, productCount: (id: number) => (id === 1 ? 3 : 1), onSave, onClose, ...props }
  const view = render(<NextIntlClientProvider locale="es" messages={messages}><CategoryPanel {...all} /></NextIntlClientProvider>)
  return { ...view, onSave: all.onSave, onClose: all.onClose }
}

// Falla si cada categoría no muestra su nombre, estación y cuántos productos tiene, o si falta la fila para crear una.
it('muestra cada categoría con su estación, sus productos y la fila nueva', () => {
  mount()
  const burgers = screen.getByRole('region', { name: 'Hamburguesas' })
  expect(within(burgers).getByLabelText('Nombre')).toHaveValue('Hamburguesas')
  expect(within(burgers).getByLabelText(/Estación de cocina/)).toHaveValue('Parrilla')
  expect(burgers).toHaveTextContent('3 productos')
  expect(screen.getByRole('region', { name: 'Bebidas' })).toHaveTextContent('1 producto')
  expect(within(screen.getByRole('region', { name: 'Bebidas' })).getByLabelText(/Estación de cocina/)).toHaveValue('')
  expect(screen.getByRole('region', { name: 'Nueva categoría' })).toBeInTheDocument()
})

// Falla si se puede guardar una fila sin cambios, o si al cambiar la estación no se guarda esa categoría con el texto
// recortado.
it('guarda solo la fila cambiada, con el texto recortado', async () => {
  const { onSave } = mount()
  const burgers = screen.getByRole('region', { name: 'Hamburguesas' })
  const save = within(burgers).getByRole('button', { name: 'Guardar' })
  expect(save).toBeDisabled()
  fireEvent.change(within(burgers).getByLabelText(/Estación de cocina/), { target: { value: '  Fríos ' } })
  expect(save).toBeEnabled()
  await act(async () => { fireEvent.click(save) })
  expect(onSave).toHaveBeenCalledWith(1, { name: 'Hamburguesas', station: 'Fríos' })
})

// Falla si una estación vacía se guarda como texto vacío en lugar de «sin estación», o si se deja guardar sin nombre.
it('una estación vacía se guarda como sin estación y el nombre es obligatorio', async () => {
  const { onSave } = mount()
  const burgers = screen.getByRole('region', { name: 'Hamburguesas' })
  fireEvent.change(within(burgers).getByLabelText(/Estación de cocina/), { target: { value: '   ' } })
  await act(async () => { fireEvent.click(within(burgers).getByRole('button', { name: 'Guardar' })) })
  expect(onSave).toHaveBeenCalledWith(1, { name: 'Hamburguesas', station: null })
  fireEvent.change(within(burgers).getByLabelText('Nombre'), { target: { value: ' ' } })
  expect(within(burgers).getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

// Falla si crear una categoría no la manda sin id, o si después la fila nueva no queda vacía para la siguiente.
it('crea una categoría nueva y limpia la fila', async () => {
  const { onSave } = mount()
  const fresh = screen.getByRole('region', { name: 'Nueva categoría' })
  expect(within(fresh).getByRole('button', { name: 'Guardar' })).toBeDisabled()
  fireEvent.change(within(fresh).getByLabelText('Nueva categoría'), { target: { value: 'Postres' } })
  fireEvent.change(within(fresh).getByLabelText(/Estación de cocina/), { target: { value: 'Fríos' } })
  await act(async () => { fireEvent.click(within(fresh).getByRole('button', { name: 'Guardar' })) })
  expect(onSave).toHaveBeenCalledWith(null, { name: 'Postres', station: 'Fríos' })
  expect(within(fresh).getByLabelText('Nueva categoría')).toHaveValue('')
  expect(within(fresh).getByLabelText(/Estación de cocina/)).toHaveValue('')
})

// Falla si una categoría que llega después de abrir el panel (la recién creada) no se muestra con sus datos.
it('muestra una categoría que llega después sin borrador', () => {
  const { rerender, onSave, onClose } = mount()
  rerender(<NextIntlClientProvider locale="es" messages={messages}>
    <CategoryPanel categories={[...CATEGORIES, { id: 3, name: 'Postres', sequence: 3, station: 'Fríos' }]} productCount={() => 0} onSave={onSave} onClose={onClose} />
  </NextIntlClientProvider>)
  const desserts = screen.getByRole('region', { name: 'Postres' })
  expect(within(desserts).getByLabelText('Nombre')).toHaveValue('Postres')
  expect(within(desserts).getByLabelText(/Estación de cocina/)).toHaveValue('Fríos')
  expect(within(desserts).getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

// Falla si el panel no se puede cerrar.
it('se cierra con Escape', () => {
  const { onClose } = mount()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
