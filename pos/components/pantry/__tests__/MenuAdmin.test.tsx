import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { countOffMenu, MenuAdmin, type MenuAdminRequest } from '@/components/pantry/MenuAdmin'
import { messages } from '@/lib/i18n/messages'
import { listCategories, listProducts, listTaxes, saveCategory, saveProduct, setCatalogPhotos, type AdminProduct } from '@/lib/services/catalogAdmin'

jest.mock('@/lib/services/catalogAdmin', () => ({
  listProducts: jest.fn(), listCategories: jest.fn(), listTaxes: jest.fn(), saveProduct: jest.fn(), saveCategory: jest.fn(), setCatalogPhotos: jest.fn(),
}))
// El formulario de producto tiene sus propias pruebas: aquí basta ver qué recibe y poder guardar o cerrar.
const formProps: { current: Record<string, unknown> | null } = { current: null }
jest.mock('@/components/catalog/ProductForm', () => ({
  ProductForm: (props: { initial: { name: string }; extraProducts: { id: number; name: string }[]; onSave: (p: unknown) => Promise<void>; onClose: () => void }) => {
    formProps.current = props
    return <div role="dialog" aria-label={`Ficha de ${props.initial.name}`}>
      <button type="button" onClick={() => void props.onSave({ ...props.initial, price: 99 })}>Guardar ficha</button>
      <button type="button" onClick={() => void props.onSave({ ...props.initial, gallery: [{ id: 5 }] })}>Guardar con fotos</button>
      <button type="button" onClick={props.onClose}>Cerrar ficha</button>
    </div>
  },
}))

const product = (over: Partial<AdminProduct>): AdminProduct => ({ id: 1, name: 'Hamburguesa', price: 25000, categoryIds: [1], taxIds: [], available: true, storable: false, favorite: false, description: '', hasImage: false, dinerAttributes: {}, variantId: 101, ...over })
const PRODUCTS = [
  product({}),
  product({ id: 2, name: 'Malteada', price: 12000, available: false, variantId: 102 }),
  product({ id: 3, name: 'Torta', price: 9000, categoryIds: [], variantId: 103 }),
  product({ id: 4, name: 'Papas', price: 8000, variantId: undefined }),
]
const mount = (request: MenuAdminRequest) => {
  const onClose = jest.fn(), onChanged = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}><MenuAdmin request={request} onClose={onClose} onChanged={onChanged} /></NextIntlClientProvider>)
  return { onClose, onChanged }
}

beforeEach(() => {
  jest.clearAllMocks(); formProps.current = null
  jest.mocked(listProducts).mockResolvedValue(PRODUCTS)
  jest.mocked(listCategories).mockResolvedValue([{ id: 1, name: 'Platos', sequence: 1, station: 'Cocina' }])
  jest.mocked(listTaxes).mockResolvedValue([{ id: 7, name: 'INC', amount: 8 }])
  jest.mocked(saveProduct).mockResolvedValue(1)
  jest.mocked(saveCategory).mockResolvedValue(1)
  jest.mocked(setCatalogPhotos).mockResolvedValue(undefined as never)
})

// Falla si mientras carga no se avisa, o si un fallo al cargar la carta no se muestra.
it('avisa mientras carga y si la carta no se pudo cargar', async () => {
  jest.mocked(listProducts).mockRejectedValue(new Error('red'))
  mount({ kind: 'categories' })
  expect(screen.getByText('Cargando la carta…')).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la carta')
})

// Falla si la ficha de un plato no abre con sus datos, si ofrece como extra el mismo plato, uno oculto o uno sin
// variante, o si guardar no recarga ni avisa del cambio.
it('abre la ficha del plato y al guardar recarga y avisa', async () => {
  const { onChanged, onClose } = mount({ kind: 'product', id: 1 })
  expect(await screen.findByRole('dialog', { name: 'Ficha de Hamburguesa' })).toBeInTheDocument()
  expect(formProps.current!.extraProducts).toEqual([{ id: 103, name: 'Torta' }])
  expect(formProps.current!.initial).toEqual(expect.objectContaining({ name: 'Hamburguesa', price: 25000, categoryIds: [1] }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar ficha' })) })
  expect(saveProduct).toHaveBeenCalledWith(1, expect.objectContaining({ price: 99 }))
  expect(setCatalogPhotos).not.toHaveBeenCalled()
  expect(listProducts).toHaveBeenCalledTimes(2)
  expect(onChanged).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar ficha' }))
  expect(onClose).toHaveBeenCalled()
})

// Falla si al guardar con galería no se guardan las fotos del plato.
it('guarda la galería del plato cuando viene', async () => {
  mount({ kind: 'product', id: 1 })
  const save = await screen.findByRole('button', { name: 'Guardar con fotos' })
  await act(async () => { fireEvent.click(save) })
  expect(setCatalogPhotos).toHaveBeenCalledWith(1, [{ id: 5 }])
})

// Falla si un plato que ya no existe abre una ficha vacía en vez de decirlo.
it('dice que el plato ya no está', async () => {
  mount({ kind: 'product', id: 999 })
  expect(await screen.findByRole('alert')).toHaveTextContent('Este plato ya no está en el catálogo.')
})

// Falla si las categorías no cuentan sus platos, o si guardar una no la manda, recarga y avisa.
it('administra las categorías y cuenta sus platos', async () => {
  const { onChanged } = mount({ kind: 'categories' })
  const section = await screen.findByRole('region', { name: 'Platos' })
  expect(section).toHaveTextContent('3 productos')
  fireEvent.change(within(section).getByLabelText('Nombre'), { target: { value: 'Fuertes' } })
  await act(async () => { fireEvent.click(within(section).getByRole('button', { name: 'Guardar' })) })
  expect(saveCategory).toHaveBeenCalledWith(1, { name: 'Fuertes', station: 'Cocina' })
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  expect(listCategories).toHaveBeenCalledTimes(2)
})

// Falla si la lista de fuera de carta no muestra lo oculto y lo que no tiene categoría con su motivo y precio, o si
// abrir uno y cerrar su ficha no vuelve a la lista.
it('lista lo que está fuera de la carta y abre cada uno', async () => {
  const { onClose } = mount({ kind: 'offMenu' })
  const malteada = await screen.findByRole('button', { name: /Malteada/ })
  expect(malteada).toHaveTextContent('Oculto de la carta')
  expect(malteada).toHaveTextContent('$ 12.000')
  expect(screen.getByRole('button', { name: /Torta/ })).toHaveTextContent('Sin categoría')
  expect(screen.queryByRole('button', { name: /Hamburguesa/ })).not.toBeInTheDocument()
  fireEvent.click(malteada)
  expect(screen.getByRole('dialog', { name: 'Ficha de Malteada' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar ficha' }))
  expect(await screen.findByRole('button', { name: /Torta/ })).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

// Falla si sin nada fuera de la carta la lista queda en blanco en vez de decirlo.
it('dice cuando no hay nada fuera de la carta', async () => {
  jest.mocked(listProducts).mockResolvedValue([product({})])
  mount({ kind: 'offMenu' })
  expect(await screen.findByText('No hay nada fuera de la carta.')).toBeInTheDocument()
})

// Falla si el contador del botón no suma los ocultos y los que no tienen categoría.
it('cuenta lo que está fuera de la carta', async () => {
  await expect(countOffMenu()).resolves.toBe(2)
})

// Falla si una respuesta que llega después de cerrar intenta pintar sobre el modal cerrado.
it('no pinta si se cierra antes de cargar', async () => {
  let resolve!: (p: AdminProduct[]) => void
  jest.mocked(listProducts).mockReturnValue(new Promise((r) => { resolve = r }))
  const { unmount } = render(<NextIntlClientProvider locale="es" messages={messages}><MenuAdmin request={{ kind: 'offMenu' }} onClose={jest.fn()} onChanged={jest.fn()} /></NextIntlClientProvider>)
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  unmount()
  await act(async () => resolve(PRODUCTS))
  expect(error).not.toHaveBeenCalled()
  error.mockRestore()
})
