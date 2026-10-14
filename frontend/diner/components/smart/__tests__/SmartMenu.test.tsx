import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SmartBrowse, SmartDish } from '../SmartMenu'
import { SmartAssistant, SmartPreferences, rankDishes } from '../SmartJourneys'
import { SmartHome, greeting } from '../SmartHome'
import { SmartHistory, SmartSignup } from '../SmartAccount'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import type { Entry } from '@/lib/types'
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const initial = useDinerStore.getState()
const dish = { id: 3, nombre: 'Hamburguesa Angus', precio: 30000, agotado: false, categorias: [1], descripcion: 'Con queso y cebolla' }
const entry: Entry = { contexto: { restaurante: { slug: 'demo', nombre: 'Demo' }, sede: { slug: 'salon', nombre: 'Salón' }, mesa: { numero: 8, token: 'mesa8' }, marca: { nombre: 'Demo', logo: null } as never }, carta: { restaurante: 'Demo', categorias: [{ id: 1, nombre: 'Hamburguesas', productos: [dish] }, { id: 2, nombre: 'Bebidas', productos: [{ ...dish, id: 4, nombre: 'Limonada', categorias: [2] }] }] } }
beforeEach(() => { useDinerStore.setState(initial, true); useDinerStore.setState({ keys: { rest: 'demo', venue: 'salon', token: 'mesa8' }, entry, template: DEFAULT_TEMPLATE }); push.mockClear() })
// Falla si la búsqueda no filtra los platos o si guardar un favorito sin cuenta lleva al registro sin la mesa.
it('searches dishes and keeps table context when opening account for favorites', () => {
  render(<SmartBrowse entry={entry}/>)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'limonada' } })
  expect(screen.queryByRole('heading', { name: dish.nombre })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar en favoritos: Limonada' }))
  expect(push).toHaveBeenCalledWith('/demo/salon/t/mesa8/cuenta/registro')
})
// Falla si «Favoritos» muestra platos que el comensal no marcó o no marca como activos los suyos.
it('uses personal favorites and the account name, independently of restaurant recommendations', () => {
  useDinerStore.setState({ account: { id: 'a', nombre: 'Camila Rojas' } as never, favorites: [4] })
  render(<SmartBrowse entry={entry} favoritesOnly/>)
  expect(screen.getByRole('heading', { name: 'Limonada' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: dish.nombre })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Quitar de favoritos: Limonada' })).toHaveAttribute('aria-pressed', 'true')
})
// Falla si se envía una cantidad distinta de la elegida o se anuncia el agregado cuando la petición falla. La nota para
// cocina ya no se escribe en la ficha: va al confirmar el pedido (diálogo de modalidad), así que la línea sale sin nota.
it('sends real quantity and does not report success when the request fails', async () => {
  const add = jest.fn().mockImplementation(async () => { useDinerStore.setState({ error: 'Sin conexión' }) })
  useDinerStore.setState({ add })
  render(<SmartDish entry={entry} rest="demo" venue="salon" token="mesa8" id="3"/>)
  fireEvent.click(screen.getByLabelText('Más unidades'))
  expect(screen.queryByLabelText('¿Alguna indicación para cocina?')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Agregar a mi pedido/ }))
  await waitFor(() => expect(add).toHaveBeenCalledWith(3, 2, ''))
  expect(screen.queryByText('Agregado a tu pedido')).not.toBeInTheDocument()
})
// Falla si el registro no exige aceptar los términos, si marca novedades por defecto o no avisa que es de demostración.
it('requires consent and clearly identifies the demo registration', () => {
  render(<SmartSignup/>)
  expect(screen.getByRole('checkbox', { name: /Acepto/ })).toBeRequired()
  expect(screen.getByRole('checkbox', { name: /novedades/ })).not.toBeChecked()
  expect(screen.getByText(/Registro de demostración/)).toBeInTheDocument()
})

// Falla si «Ir al menú» pierde la mesa o si vuelve a aparecer el enlace al asistente retirado.
it('keeps table context and removes the retired assistant link', () => {
  render(<SmartHome entry={entry}/>)
  expect(screen.getByRole('link', {name: /Ir al menú/})).toHaveAttribute('href', '/demo/salon/t/mesa8/carta')
  expect(screen.queryByRole('link', {name: /Elige con el asistente/})).not.toBeInTheDocument()
})
// Falla si el asistente no completa sus pasos, no guarda las preferencias, no filtra platos reales o no las borra.
it('completes eight assistant steps, persists preferences and filters actual dishes', () => {
  localStorage.clear()
  const view = render(<SmartAssistant entry={entry}/>)
  fireEvent.click(screen.getByRole('button', {name:'Empezar'}))
  fireEvent.click(screen.getByRole('button', {name:'😋 Tengo hambre'}))
  for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', {name:'Continuar'}))
  fireEvent.click(screen.getByRole('button', {name:'Ver mi selección'}))
  fireEvent.click(screen.getByRole('button', {name:'Bebidas'}))
  expect(screen.getByRole('heading', {name:'Limonada'})).toBeInTheDocument()
  expect(screen.queryByRole('heading', {name:dish.nombre})).not.toBeInTheDocument()
  view.unmount()
  render(<SmartPreferences entry={entry} detail/>)
  expect(screen.getByText('Tengo hambre')).toHaveAttribute('data-selected','true')
  fireEvent.click(screen.getByRole('button', {name:'Borrar preferencias'}))
  expect(screen.queryByText('Tengo hambre')).not.toBeInTheDocument()
})
// Falla si el asistente recomienda platos agotados o no prioriza los que coinciden con lo elegido.
it('excludes sold-out recommendations and ranks catalog metadata without inventing dishes', () => {
  const chicken = {...dish,id:5,nombre:'Pollo asado'}
  expect(rankDishes([dish,{...chicken,id:6,agotado:true},chicken],[['🍗 Pollo']]).map(d=>d.id)).toEqual([5,3])
})

// Falla si la categoría muestra platos de otra o si la búsqueda ignora la categoría elegida.
it('keeps category selection scoped to its products and combines it with search', () => {
  render(<SmartBrowse entry={entry}/>)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Categorías del menú' })).getByRole('button', { name: 'Bebidas' }))
  expect(screen.getByRole('heading', { name: 'Limonada' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: dish.nombre })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Angus' } })
  expect(screen.getByRole('heading', { name: 'No encontramos ese plato' })).toBeInTheDocument()
})

// Falla si el historial muestra un pedido ya servido como «Enviado» en vez de «Entregado».
it('does not relabel a delivered historical order as sent', () => {
  useDinerStore.setState({ account: {id:'a',nombre:'Camila'} as never, loadAccount: jest.fn().mockResolvedValue(undefined), accountOrders:[{id:'42',fecha:'2026-09-12T12:00:00Z',local:'Demo',mesa:null,items:1,total:30000,estado:'servido',descuento:0,lineas:[]}] })
  render(<SmartHistory/>)
  expect(screen.getByText('Entregado',{exact:true})).toBeInTheDocument()
  expect(screen.queryByText('Enviado',{exact:true})).not.toBeInTheDocument()
})

// Falla si una alergia elegida en el asistente se toma como gusto y recomienda platos con ese alérgeno.
it('does not promote allergy selections and excludes explicitly declared allergens', () => {
  const answers = Array.from({length:8}, () => [] as string[])
  answers[5] = ['🥚 Huevo']
  const egg = {...dish,id:8,nombre:'Huevo',atributos:{alergenos:['Huevo']}}
  expect(rankDishes([egg,dish],answers).map(d=>d.id)).toEqual([3])
})

// Falla si el extra se agrega aparte del plato, con otra cantidad o sin la nota que lo liga a él.
it('adds configured extras atomically with the displayed quantity', async () => {
  const addBundle = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({addBundle,error:null})
  const configured = JSON.parse(JSON.stringify(entry))
  configured.carta.categorias[0].productos[0].atributos = {extras:[4],acompanamientos:[],ingredientes:['Huevo'],nutricion:{calorias:250}}
  render(<SmartDish entry={configured} rest="demo" venue="salon" token="mesa8" id="3"/>)
  fireEvent.click(screen.getByRole('checkbox',{name:/Limonada/}))
  fireEvent.click(screen.getByRole('button',{name:'Más Limonada'}))
  fireEvent.click(screen.getByRole('button',{name:'Más unidades'}))
  fireEvent.click(screen.getByRole('button',{name:/Agregar a mi pedido/}))
  await waitFor(()=>expect(addBundle).toHaveBeenCalledWith([{producto_id:3,cantidad:2,nota:''},{producto_id:4,cantidad:2,nota:`Acompaña: ${dish.nombre}`}]))
  expect(screen.getByText('Agregado a tu pedido')).toBeInTheDocument()
})

// Falla si se oculta un cero real o se inventa nutrición al dejar los campos vacíos.
it('shows only configured nutrition, including portion weight and zero fat', () => {
  const configured: Entry = JSON.parse(JSON.stringify(entry))
  configured.carta.categorias[0].productos[0].atributos = {nutricion:{peso:180.5,grasa:0}}
  const view = render(<SmartDish entry={configured} rest="demo" venue="salon" token="mesa8" id="3"/>)
  const nutrition = screen.getByLabelText('Información por porción')
  expect(within(nutrition).getByText('180.5')).toBeInTheDocument()
  expect(within(nutrition).getByText('0')).toBeInTheDocument()
  expect(within(nutrition).queryByText(/Calorías/)).not.toBeInTheDocument()
  view.rerender(<SmartDish entry={entry} rest="demo" venue="salon" token="mesa8" id="3"/>)
  expect(screen.queryByLabelText('Información por porción')).not.toBeInTheDocument()
})

// Falla si la cabecera vuelve a ser un enlace con el nombre del restaurante, si ignora el saludo del administrador o la sede,
// o si el filtro de precio/valoración regresa a la carta.
it('greets the diner with the admin greeting and the venue in a non-clickable header, without the filter dialog', () => {
  const branded: Entry = JSON.parse(JSON.stringify(entry))
  branded.contexto.marca.saludo = 'Buenas noches'
  useDinerStore.setState({ account: { id: 'a', nombre: 'Camila Rojas' } as never })
  render(<SmartBrowse entry={branded}/>)
  const header = screen.getByRole('banner')
  expect(within(header).getByText('Buenas noches, Camila')).toBeInTheDocument()
  expect(within(header).getByText('Demo · Salón · Mesa 8')).toBeInTheDocument()
  expect(within(header).queryByRole('link')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Filtrar platos' })).not.toBeInTheDocument()
  // Sin saludo del administrador, el repertorio según la hora; nunca un «Hola» pelado.
  expect(greeting(entry, null, 21, 0)).toBe('Buenas noches')
  expect(greeting(entry, 'Camila Rojas', 9, 0)).toBe('Buenos días, Camila')
})

// Falla si la tarjeta no pone el precio antes del nombre, inventa una rebaja cuando el precio anterior no es mayor, o
// pierde el tiempo de preparación configurado en el POS.
it('shows price first, the struck previous price with its percentage and the preparation time', () => {
  const priced: Entry = JSON.parse(JSON.stringify(entry))
  priced.carta.categorias[0].productos[0].atributos = { precioAntes: 40000, tiempoPreparacion: 15 }
  priced.carta.categorias[1].productos[0].atributos = { precioAntes: 30000 }
  render(<SmartBrowse entry={priced}/>)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Categorías del menú' })).getByRole('button', { name: 'Hamburguesas' }))
  const card = screen.getByRole('link', { name: /Hamburguesa Angus/ })
  const price = within(card).getByText('$ 30.000')
  const name = within(card).getByRole('heading', { name: 'Hamburguesa Angus' })
  expect(price.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(card).getByText('-25%')).toBeInTheDocument()
  expect(within(card).getByLabelText('Antes $ 40.000')).toBeInTheDocument()
  expect(within(card).getByText('15 min')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Categorías del menú' })).getByRole('button', { name: 'Bebidas' }))
  expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  expect(screen.queryByText(/min$/)).not.toBeInTheDocument()
})

// Falla si en el muelle la ficha pierde el selector de cantidad junto a «Agregar», si agrega otra cantidad o si tras
// agregar no vuelve a la carta (el flujo de Rappi: − n + y Agregar abajo, y de vuelta al menú).
it('en el muelle agrega la cantidad elegida y vuelve a la carta', async () => {
  const add = jest.fn().mockResolvedValue(undefined)
  useDinerStore.setState({ add, error: null })
  const slot = document.createElement('div'); document.body.appendChild(slot)
  render(<SmartDish entry={entry} rest="demo" venue="salon" token="mesa8" id="3" actionTarget={slot}/>)
  expect(slot.querySelector('.sm-dock-stepper')).not.toBeNull()
  fireEvent.click(within(slot).getByRole('button', { name: 'Más unidades' }))
  fireEvent.click(within(slot).getByRole('button', { name: /Agregar/ }))
  await waitFor(() => expect(add).toHaveBeenCalledWith(3, 2, ''))
  await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/\/carta$/)))
  expect(screen.queryByText('Agregado a tu pedido')).not.toBeInTheDocument()
  slot.remove()
})
