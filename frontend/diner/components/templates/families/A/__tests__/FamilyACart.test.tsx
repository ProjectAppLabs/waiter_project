import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { FamilyACart, suggestion } from '@/components/templates/families/A/FamilyACart'
import { cartOf, entryOf, line, templateOf, wrap } from '@/components/templates/families/A/__tests__/fixtures'
import type { CartLayoutProps } from '@/components/templates/types'
import type { Entry } from '@/lib/types'

const mockState: { entry: Entry | null } = { entry: entryOf() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector: (s: { entry: Entry | null; cart: null; call: () => Promise<boolean> }) => unknown) => selector({ entry: mockState.entry, cart: null, call: jest.fn() }) }))

const hrefs = { home: '/h', menu: '/m', pay: '/p', table: '/t', signup: '/s' }
const props = (codigo: string, over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf([line({ nota: 'tomate confitado' }), line({ id: 2, producto_id: 3, nombre: 'Cordero de Boyacá', precio: 68000, cantidad: 1, subtotal: 68000 })]),
  template: templateOf(codigo), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn().mockResolvedValue('ord-1'), goPay: jest.fn(), goMenu: jest.fn(),
  discount: { porcentaje: 5, monto: 5045, aplicable: true, aplicado: true }, retry: jest.fn(), hrefs, ...over,
})
const discounted = (codigo: string, over: Partial<CartLayoutProps> = {}) => props(codigo, { cart: cartOf([line({ nota: 'tomate confitado' }), line({ id: 2, producto_id: 3, nombre: 'Cordero de Boyacá', precio: 68000, cantidad: 1, subtotal: 68000 })], { total: 100900, mio: 100900 }), ...over })

beforeEach(() => { mockState.entry = entryOf() })

// Falla si el carrito base (A1) pierde la cabecera centrada con «N platos», las líneas en serif con precio mono y nota, el descuento como
// línea verde, el total en serif + mono 25, el CTA «Enviar a cocina» en serif, «Ir a pagar» y «o pagar en la mesa».
it('paints the A1 base cart: centered header, serif lines, discount line, totals and the three actions', async () => {
  const p = discounted('A1')
  wrap(<FamilyACart {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu pedido')
  expect(screen.getByText('2 platos')).toBeInTheDocument()
  expect(screen.getByText('Burrata italiana')).toHaveClass('font-t-display')
  expect(screen.getByText('tomate confitado')).toBeInTheDocument()
  expect(screen.getByText('Subtotal').nextSibling).toHaveTextContent('100.900')
  expect(screen.getByText('Descuento primera compra 5%').closest('div')).toHaveClass('text-free')
  expect(screen.getByText('$ 95.855')).toHaveClass('font-t-mono')
  const send = screen.getByRole('button', { name: /Enviar a cocina · \$ 95\.855/ })
  expect(send).toHaveClass('font-t-display')
  fireEvent.click(send)
  await waitFor(() => expect(p.confirm).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(p.goPay).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/t')
  expect(screen.getByText('¿Algo para cerrar?')).toBeInTheDocument()
  expect(screen.getByText('Alex sugiere postre o café · desde 9.900')).toBeInTheDocument()
})

// Falla si tocar una línea propia no abre el stepper y «Quitar» (el marco no los dibuja), si bajar de 1 no quita, o si una línea ajena se
// puede editar.
it('opens the quantity controls on tap for my lines only', () => {
  const p = props('A1', { cart: cartOf([line({}), line({ id: 2, comensal: 'other', mio: false, nombre: 'Ajiaco', producto_id: 4 })]) })
  wrap(<FamilyACart {...p} />)
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Burrata italiana/, expanded: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(p.setQty).toHaveBeenCalledWith(1, 2)
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(p.remove).toHaveBeenCalledWith(1)
  expect(screen.getByText('Pedido por otro comensal')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Ajiaco/ })).toBeNull()
  expect(screen.getByText('Lo mío').nextSibling).toHaveTextContent('32.900')
})

// Falla si A2 no muestra el banner «5% · Primera compra: descuento aplicado.» bajo la cabecera, o si sin descuento aplicado (pero aplicable)
// el banner no invita a registrarse.
it('A2 paints the discount banner under the header and the signup invitation when not applied yet', () => {
  wrap(<FamilyACart {...discounted('A2')} />)
  expect(screen.getByText('Primera compra: descuento aplicado.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).not.toHaveClass('font-t-display')
  wrap(<FamilyACart {...props('A2', { discount: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } })} />)
  expect(screen.getByRole('link', { name: /Regístrate y ahorra 5%/ })).toHaveAttribute('href', '/s')
})

// Falla si A3 no lleva la cabecera en una fila, los chips grises bajo la línea (nota + «IVA incluido») ni el chip «−5% aplicado» junto al total.
it('A3 uses chips under the lines and a discount chip next to the total', () => {
  wrap(<FamilyACart {...discounted('A3')} />)
  expect(screen.getByText('Burrata italiana')).not.toHaveClass('font-t-display')
  expect(screen.getAllByText('IVA incluido')).toHaveLength(2)
  expect(screen.getByText('tomate confitado')).toHaveClass('rounded-[6px]')
  expect(screen.getByText('−5% aplicado')).toHaveClass('bg-free-soft')
})

// Falla si A4 no dibuja siempre la miniatura (foto de la carta por producto_id), el stepper y «Quitar» para mis líneas.
it('A4 always draws the thumbnail, the stepper and Quitar', () => {
  const p = discounted('A4')
  wrap(<FamilyACart {...p} />)
  const first = screen.getByText('Burrata italiana').closest('li') as HTMLElement
  expect(within(first).getByRole('presentation')).toHaveAttribute('src', '/api/v1/f/1.jpg')
  expect(screen.getAllByRole('button', { name: 'Más' })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Cordero de Boyacá' }))
  expect(p.remove).toHaveBeenCalledWith(2)
  expect(screen.queryByRole('button', { name: /^Burrata italiana/ })).toBeNull()
})

// Falla si A5 no pinta la nota verde «Incluye tu 5% de primera compra» bajo el CTA (solo con descuento aplicado) o si el CTA no va en serif.
it('A5 adds the green note under the serif CTA only when the discount applies', () => {
  wrap(<FamilyACart {...discounted('A5')} />)
  expect(screen.getByText('Incluye tu 5% de primera compra')).toHaveClass('text-free')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('font-t-display')
  wrap(<FamilyACart {...props('A5', { discount: null })} />)
  expect(screen.getAllByText('Incluye tu 5% de primera compra')).toHaveLength(1)
})

// Falla si los tres estados sin líneas (cargando, no se pudo leer, vacío) no dicen qué pasa y qué hacer, o si la sugerencia se inventa sin postres.
it('handles loading, failure and empty states, and omits the upsell without desserts', () => {
  const p = props('A1', { cart: null })
  const { unmount } = wrap(<FamilyACart {...p} />)
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  unmount()
  const failed = props('A1', { cart: null, error: 'No hay red' })
  const r2 = wrap(<FamilyACart {...failed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(failed.retry).toHaveBeenCalledTimes(1)
  r2.unmount()
  const empty = props('A1', { cart: cartOf([]) })
  wrap(<FamilyACart {...empty} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(empty.goMenu).toHaveBeenCalledTimes(1)
  expect(suggestion(null)).toBeNull()
  expect(suggestion(entryOf([]))).toBeNull()
  expect(suggestion(entryOf())).toEqual({ waiter: 'Alex', from: 9900 })
})
