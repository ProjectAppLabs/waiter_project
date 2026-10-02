import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ProductForm } from '@/components/catalog/ProductForm'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const initial = { name: 'Angus', price: 36900, categoryIds: [2], taxIds: [55], available: true, storable: false, favorite: false, description: '', dinerAttributes: {} }
const categories = [{ id: 1, name: 'Bebidas', sequence: 1, station: 'Barra' }, { id: 2, name: 'Hamburguesas', sequence: 2, station: 'Parrilla' }]
const taxes = [{ id: 55, name: '19% IVA', amount: 19 }]

// Falla si el formulario guarda el precio como texto, pierde la categoría marcada o no confirma el guardado.
it('edits price and categories and saves them as numbers', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ProductForm initial={initial} isNew={false} categories={categories} taxes={taxes} onSave={onSave} onClose={jest.fn()} />)
  fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: '38900' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...initial, price: 38900, categoryIds: [2, 1] }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
})

// Falla si el paso "Atributos" no escribe picante, etiquetas, tamaños o "solo hoy" en diner_attributes.
it('edits the diner attributes in the third step', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ProductForm initial={initial} isNew={false} categories={categories} taxes={taxes} onSave={onSave} onClose={jest.fn()} />)
  fireEvent.click(screen.getByRole('tab', { name: /Atributos/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Medio' }))
  fireEvent.blur(screen.getByLabelText(/Etiquetas/), { target: { value: 'popular, sin gluten' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar tamaño' }))
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Doble' } })
  fireEvent.click(screen.getByRole('switch', { name: 'Solo hoy' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...initial, dinerAttributes: { picante: 2, etiquetas: ['popular', 'sin gluten'], tamanos: [{ nombre: 'Doble', precio: 36900 }], soloHoy: true } }))
})

// Falla si la tarjeta del comensal pierde los minutos de preparación o el precio anterior tachado, o si se guardan como texto.
it('saves the preparation minutes and the previous price shown struck through', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ProductForm initial={initial} isNew={false} categories={categories} taxes={taxes} onSave={onSave} onClose={jest.fn()} />)
  fireEvent.click(screen.getByRole('tab', { name: /Atributos/ }))
  fireEvent.change(screen.getByLabelText(/Tiempo de preparación/), { target: { value: '15' } })
  fireEvent.change(screen.getByLabelText(/Precio anterior/), { target: { value: '42000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...initial, dinerAttributes: { tiempoPreparacion: 15, precioAntes: 42000 } }))
})

// Falla si la ficha exige nutrición o pierde ingredientes, peso y valores cero al guardar.
it('saves optional dish information and allows clearing nutrition', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ProductForm initial={initial} isNew={false} categories={categories} taxes={taxes} onSave={onSave} onClose={jest.fn()} />)
  fireEvent.change(screen.getByLabelText(/Descripción/), {target:{value:'Pan tostado con huevo'}})
  fireEvent.click(screen.getByRole('tab', {name:/Atributos/}))
  fireEvent.blur(screen.getByLabelText(/Ingredientes del plato/), {target:{value:'Pan, Huevo'}})
  fireEvent.change(screen.getByLabelText('Peso de la porción (g)'), {target:{value:'180.5'}})
  fireEvent.change(screen.getByLabelText('Grasa (g)'), {target:{value:'0'}})
  fireEvent.click(screen.getByRole('button', {name:'Guardar'}))
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({...initial,description:'Pan tostado con huevo',dinerAttributes:{ingredientes:['Pan','Huevo'],nutricion:{peso:180.5,grasa:0}}}))
  fireEvent.change(screen.getByLabelText('Peso de la porción (g)'), {target:{value:''}})
  fireEvent.change(screen.getByLabelText('Grasa (g)'), {target:{value:''}})
  fireEvent.click(screen.getByRole('button', {name:'Guardar'}))
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({...initial,description:'Pan tostado con huevo',dinerAttributes:{ingredientes:['Pan','Huevo'],nutricion:{peso:undefined,grasa:undefined}}}))
})

// Falla si el combo pierde sus componentes o cambia el precio propio del plato.
it('builds a fixed combo from catalog products and keeps its own selling price',async()=>{
 const onSave=jest.fn().mockResolvedValue(undefined)
 wrap(<ProductForm initial={initial} isNew categories={categories} taxes={taxes} extraProducts={[{id:3,name:'Hamburguesa'},{id:7,name:'Bebida'}]} onSave={onSave} onClose={jest.fn()}/>)
 fireEvent.click(screen.getByRole('switch',{name:'Es un combo'}))
 fireEvent.change(screen.getByLabelText('Producto 1'),{target:{value:'3'}})
 fireEvent.change(screen.getByLabelText('Producto 2'),{target:{value:'7'}})
 fireEvent.change(screen.getByLabelText(/Precio/),{target:{value:'45000'}})
 fireEvent.click(screen.getByRole('button',{name:'Guardar'}))
 await waitFor(()=>expect(onSave).toHaveBeenCalledWith(expect.objectContaining({price:45000,dinerAttributes:{combo:[{producto:3,cantidad:1},{producto:7,cantidad:1}]}})))
})

// Plan M · Galería de la ficha.
jest.mock('@/lib/services/catalogAdmin', () => ({ ...jest.requireActual('@/lib/services/catalogAdmin'), listCatalogPhotos: jest.fn().mockResolvedValue([{ id: 7 }, { id: 8 }]) }))
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

// Falla si la galería no carga las fotos existentes, si quitar o mover no cambia el orden que se guarda, si deja pasar un
// tipo que no es foto o si permite más de 4 fotos además de la principal.
it('edits the dish gallery and saves its final order', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ProductForm initial={initial} templateId={3} isNew={false} categories={categories} taxes={taxes} onSave={onSave} onClose={jest.fn()} />)
  fireEvent.click(screen.getByRole('tab', { name: /Foto|Imagen/ }))
  expect(await screen.findByRole('img', { name: 'Foto 2 de la galería' })).toHaveAttribute('src', '/experience/api/pos/v1/photos/gallery/8?org=null')
  fireEvent.click(screen.getByRole('button', { name: 'Mover la foto 2 antes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ gallery: [{ id: 8 }, { id: 7 }] })))
  fireEvent.change(screen.getByLabelText('Añadir foto a la galería'), { target: { files: [file('menu.gif', 'image/gif')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG o WebP')
  for (const n of [1, 2]) {
    fireEvent.change(screen.getByLabelText('Añadir foto a la galería'), { target: { files: [file(`f${n}.webp`, 'image/webp')] } })
    await screen.findByRole('img', { name: `Foto ${2 + n} de la galería` })
  }
  expect(screen.queryByLabelText('Añadir foto a la galería')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar la foto 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => { const gallery = onSave.mock.lastCall[0].gallery; expect(gallery).toHaveLength(3); expect(gallery[0]).toEqual({ id: 7 }); expect(gallery[1]).toHaveProperty('image') })
})
