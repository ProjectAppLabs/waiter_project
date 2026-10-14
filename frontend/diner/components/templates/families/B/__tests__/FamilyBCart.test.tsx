import { fireEvent, screen, within } from '@testing-library/react'

import { FamilyBCart } from '@/components/templates/families/B/FamilyBCart'
import { cartOf, entryOf, line, templateOf, wrap } from '@/components/templates/families/B/__tests__/fixtures'
import type { CartLayoutProps } from '@/components/templates/types'

// El carrito busca la foto de cada línea en la carta (las líneas no la traen): el store solo aporta `entry`.
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ entry: mockEntry }) }))
const mockEntry = entryOf()

const discount = { porcentaje: 5, monto: 3808, aplicable: true, aplicado: true }
const hrefs = { home: '/h', menu: '/m', pay: '/p', table: '/t', signup: '/s' }
const props = (codigo: string, over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf([line({ nota: 'una sin cebolla' })]), template: templateOf(codigo), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(),
  confirm: jest.fn().mockResolvedValue('o1'), goPay: jest.fn(), goMenu: jest.fn(), discount, retry: jest.fn(), hrefs, ...over,
})
const send = () => screen.getByRole('button', { name: /Enviar a cocina · \$ 72\.352/ })

// Falla si la base B1 pierde la miniatura, el stepper visible, «Quitar», la línea de descuento en verde, el total en mono,
// «Enviar a cocina» como acción principal, «Ir a pagar» o «o pagar en la mesa con el mesero».
it('B1: thumbnail, visible stepper, discount line and the three actions', () => {
  const p = props('B1')
  const { container } = wrap(<FamilyBCart {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu pedido')
  expect(screen.getByText('2 ítems')).toBeInTheDocument()
  expect(container.querySelector('img')).toHaveAttribute('src', '/f/2.jpg')
  expect(screen.getByText('2 · una sin cebolla')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(p.setQty).toHaveBeenCalledWith(1, 3)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Hamburguesa Clásica' }))
  expect(p.remove).toHaveBeenCalledWith(1)
  expect(screen.getByText('Subtotal').nextSibling).toHaveTextContent('76.160')
  expect(screen.getByText('Descuento primera compra 5%').parentElement).toHaveClass('text-free')
  expect(screen.getByText('Descuento primera compra 5%').nextSibling).toHaveTextContent('−3.808')
  expect(screen.getByText('$ 72.352')).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(p.goPay).toHaveBeenCalledTimes(1)
  fireEvent.click(send())
  expect(p.confirm).toHaveBeenCalledTimes(1)
  // Mientras envía, ni pagar ni volver a enviar: el botón se apaga y no se duplica el envío.
  expect(screen.getByRole('button', { name: 'Ir a pagar' })).toBeDisabled()
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/t')
  expect(screen.getByRole('link', { name: 'Agregar algo más' })).toHaveAttribute('href', '/m')
})

// Falla si bajar de 1 no quita la línea, o si sin descuento aplicado no se invita a registrarse (descuento5: linea).
it('B1: removing below one and the signup hint when the discount is still available', () => {
  const p = props('B1', { cart: cartOf([line({ cantidad: 1, subtotal: 38080 })]), discount: { ...discount, monto: 0, aplicable: false, aplicado: false, registrado: false } })
  wrap(<FamilyBCart {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(p.remove).toHaveBeenCalledWith(1)
  expect(screen.getByRole('link', { name: /Regístrate y ahorra 5%/ })).toHaveAttribute('href', '/s')
  expect(screen.queryByText('Descuento primera compra 5%')).toBeNull()
})

// Falla si B2 pierde la banda «5% · Primera compra» (banner) o si la línea sin stepper no abre los controles al tocarla.
it('B2: discount banner and tap-to-edit lines', () => {
  const p = props('B2')
  wrap(<FamilyBCart {...p} />)
  expect(screen.getByText('5%').nextSibling).toHaveTextContent('Primera compra: descuento aplicado.')
  expect(document.querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  const edit = screen.getByRole('button', { name: 'Editar Hamburguesa Clásica' })
  expect(edit).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(edit)
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(p.setQty).toHaveBeenCalledWith(1, 3)
  fireEvent.click(edit)
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
})

// Falla si B2 sin descuento aplicado no enlaza al registro desde la banda.
it('B2: the banner invites to sign up while the discount is still available', () => {
  wrap(<FamilyBCart {...props('B2', { discount: { ...discount, monto: 0, aplicable: false, aplicado: false, registrado: false } })} />)
  expect(screen.getByRole('link', { name: /Primera compra: regístrate y ahorra 5% →/ })).toHaveAttribute('href', '/s')
})

// Falla si B3 pierde el avatar por comensal («Yo» / «Comensal N»), el chip «−5% aplicado» junto al total, «Pagar lo mío» o el bloque de otros.
it('B3: diner avatars, the −5% chip next to the total and «Pagar lo mío»', () => {
  const p = props('B3', { cart: cartOf([line(), line({ id: 2, comensal: 'x', mio: false, producto_id: 5, nombre: 'Limonada de Coco', precio: 11781, cantidad: 1, subtotal: 11781 })]) })
  wrap(<FamilyBCart {...p} />)
  expect(screen.getByText('Yo')).toBeInTheDocument()
  expect(screen.getByLabelText('Comensal 1')).toHaveTextContent('C1')
  expect(screen.getByText('Pedido por otros en la mesa').parentElement).toHaveTextContent('Limonada de Coco')
  expect(screen.getByText('−5% aplicado')).toBeInTheDocument()
  expect(screen.queryByText('Descuento primera compra 5%')).toBeNull()
  expect(screen.getByText('Lo mío').nextSibling).toHaveTextContent('72.352')
  expect(screen.getByText('Total de la mesa').nextSibling).toHaveTextContent('$ 84.133')
  fireEvent.click(screen.getByRole('button', { name: 'Pagar lo mío' }))
  expect(p.goPay).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: /Editar Limonada/ })).toBeNull()
})

// Falla si B4 pierde el índice en mono o el CTA con radio 8, o si B5 pierde los chips «2 · nota» e «Impuestos incluidos».
it('B4 numbers the lines and squares the CTA; B5 shows the chips', () => {
  const { unmount } = wrap(<FamilyBCart {...props('B4')} />)
  expect(screen.getByText('1')).toHaveClass('font-t-mono')
  expect(send()).toHaveClass('rounded-[8px]', 'h-[60px]')
  expect(screen.getByText('Hamburguesa Clásica')).toHaveClass('t-title')
  unmount()
  wrap(<FamilyBCart {...props('B5')} />)
  expect(screen.getByText('2 · una sin cebolla')).toHaveClass('bg-t-acento-suave')
  expect(screen.getByText('Impuestos incluidos')).toHaveClass('bg-t-acento-suave')
  expect(send()).toHaveClass('rounded-t-boton')
})

// Falla si cargando, sin poder leer o vacío no se distinguen (reintentar vs ver la carta).
it('tells loading, load failure and empty apart', () => {
  const p = props('B1', { cart: null, error: 'x' })
  const { unmount } = wrap(<FamilyBCart {...p} />)
  expect(screen.getByText('No pudimos cargar tu pedido.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(p.retry).toHaveBeenCalledTimes(1)
  unmount()
  const q = props('B1', { cart: cartOf([]) })
  wrap(<FamilyBCart {...q} />)
  expect(screen.getByText('Todavía no has agregado nada.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(q.goMenu).toHaveBeenCalledTimes(1)
  expect(within(screen.getByRole('banner')).queryByText(/ítems/)).toBeNull()
})
