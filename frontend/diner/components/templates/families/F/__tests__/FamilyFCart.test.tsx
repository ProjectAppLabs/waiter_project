import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { FamilyFCart } from '@/components/templates/families/F/FamilyFCart'
import { cartOf, entryOf, line, templateOf, wrap } from '@/components/templates/families/F/__tests__/fixtures'
import type { CartLayoutProps } from '@/components/templates/types'

const mockStore = { entry: entryOf(), account: { id: 'a', nombre: 'Camila Ruiz', correo: 'c@c.co', verificada: true } }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore) }))

const base = (codigo: string, over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf([line({}), line({ id: 2, producto_id: 4, nombre: 'Sopa miso', precio: 9000, cantidad: 1, subtotal: 9000 })]),
  template: templateOf(codigo), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn().mockResolvedValue('p1'), goPay: jest.fn(), goMenu: jest.fn(),
  discount: { porcentaje: 5, monto: 3250, aplicable: true, aplicado: true }, retry: jest.fn(),
  hrefs: { home: '/k/c', menu: '/k/c/carta', pay: '/k/c/pago', table: '/k/c/la-cuenta', signup: '/k/c/cuenta/registro' }, ...over,
})

// Falla si la base F1 pierde la cabecera con el conteo de piezas, los chips «N piezas» / «IVA incluido», el descuento como línea verde, o si «Enviar a cocina» no es la acción principal en el acento.
it('F1: header with pieces, chips per line, discount as a green line and the accent CTA', async () => {
  const props = base('F1')
  wrap(<FamilyFCart {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu pedido')
  expect(within(screen.getByRole('banner')).getByText('16 piezas')).toBeInTheDocument()
  const items = screen.getAllByRole('listitem')
  expect(within(items[0]).getByText('16 piezas')).toHaveClass('bg-muted')
  expect(within(items[0]).getByText('IVA incluido')).toBeInTheDocument()
  expect(within(items[1]).queryByText(/piezas/)).toBeNull()
  expect(screen.getByText('Descuento primera compra 5%').parentElement).toHaveClass('text-free')
  expect(screen.getByText('−3.250')).toHaveClass('font-t-mono')
  expect(screen.getByText('$ 61.750')).toHaveClass('font-t-mono', 'text-[25px]')
  expect(screen.queryByText('−5% aplicado')).toBeNull()
  const send = screen.getByRole('button', { name: /Enviar a cocina · \$ 61\.750/ })
  expect(send).toHaveClass('bg-t-acento')
  fireEvent.click(send)
  await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(props.goPay).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/k/c/la-cuenta')
})

// Falla si tocar una línea propia no abre los controles, si − / ＋ / Quitar no llaman al contenedor, o si bajar de 1 no quita.
it('F1: a tap on my line opens the quantity controls', () => {
  const props = base('F1')
  wrap(<FamilyFCart {...props} />)
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /California ×2/, expanded: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(props.setQty).toHaveBeenCalledWith(1, 3)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: California' }))
  expect(props.remove).toHaveBeenCalledWith(1)
  fireEvent.click(screen.getByRole('button', { name: /Sopa miso/, expanded: false }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Menos' })[1])
  expect(props.remove).toHaveBeenCalledWith(2)
})

// Falla si F2 pierde la miniatura, el stepper siempre visible, «Quitar» o el chip «−5% aplicado» junto al total.
it('F2: photo, always-visible stepper, Quitar and the discount chip', () => {
  const props = base('F2')
  wrap(<FamilyFCart {...props} />)
  const items = screen.getAllByRole('listitem')
  expect(within(items[0]).getByRole('presentation')).toHaveAttribute('src', 'http://x/california.jpg')
  expect(within(items[0]).getByText('16 piezas')).not.toHaveClass('bg-muted')
  expect(screen.getAllByRole('button', { name: 'Más' })).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Menos' })[0])
  expect(props.setQty).toHaveBeenCalledWith(1, 1)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Sopa miso' }))
  expect(props.remove).toHaveBeenCalledWith(2)
  expect(screen.getByText('−5% aplicado')).toHaveClass('bg-free-soft')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('rounded-[8px]', 'h-[60px]')
})

// Falla si F3 pierde la piel oscura de la familia A: cabecera centrada en serif, guía de puntos, CTA de contorno, y la fila «5% ya usado» cuando el descuento se consumió.
it('F3: serif centred header, dotted leaders, outline CTA and the used-discount row', () => {
  wrap(<FamilyFCart {...base('F3', { discount: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false } })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('t-title')
  expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('flex-col')
  expect(screen.getByText(/California ×2/)).toHaveClass('t-title')
  expect(screen.getByText('5% ya usado en tu 1ª visita').nextSibling).toHaveTextContent('—')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('border-t-acento', 'text-t-acento')
  expect(screen.queryByText('Descuento primera compra 5%')).toBeNull()
})

// Falla si F5 no pinta un avatar por comensal (el mismo comensal, el mismo número; tres colores rotando), si vuelve la fila «Para la
// mesa» sumando lo ajeno dos veces, si la propina entra en la caja de totales (es informativa: se entrega en la mesa), o si falta «Pagar lo mío».
it('F5: avatars per diner, no duplicated table row, the tip outside the totals and Pagar lo mío', () => {
  const others = [
    line({ id: 3, comensal: 'x', mio: false, producto_id: 4, nombre: 'Sopa miso', precio: 9000, cantidad: 1, subtotal: 9000 }),
    line({ id: 4, comensal: 'y', mio: false, producto_id: 3, nombre: 'Veggie tempura', precio: 26000, cantidad: 1, subtotal: 26000 }),
    line({ id: 5, comensal: 'x', mio: false, producto_id: 3, nombre: 'Veggie tempura', precio: 26000, cantidad: 1, subtotal: 26000 }),
    line({ id: 6, comensal: 'z', mio: false, producto_id: 3, nombre: 'Veggie tempura', precio: 26000, cantidad: 1, subtotal: 26000 }),
    line({ id: 7, comensal: 'w', mio: false, producto_id: 3, nombre: 'Veggie tempura', precio: 26000, cantidad: 1, subtotal: 26000 }),
  ]
  const props = base('F5', { cart: cartOf([line({}), ...others]) })
  wrap(<FamilyFCart {...props} />)
  expect(screen.getByText('Yo')).toHaveClass('bg-t-acento')
  const avatars = screen.getAllByRole('img', { name: /Comensal/ })
  expect(avatars.map((a) => a.textContent)).toEqual(['1', '2', '1', '3', '4'])
  expect(avatars[0]).toHaveClass('bg-kitchen')
  expect(avatars[1]).toHaveClass('bg-free')
  expect(avatars[3]).toHaveClass('bg-pending')
  expect(avatars[4]).toHaveClass('bg-kitchen')
  expect(screen.queryByText('Para la mesa')).toBeNull()
  expect(screen.queryByText('113.000')).toBeNull()
  // Propina: fuera de la <dl> de totales, con su nota; el Total y el CTA no la incluyen.
  const totals = screen.getByText('Subtotal').closest('dl') as HTMLElement
  expect(within(totals).queryByText(/Propina/)).toBeNull()
  expect(within(totals).queryByRole('radio')).toBeNull()
  const tipSection = screen.getByRole('region', { name: 'Propina' })
  expect(within(tipSection).getByRole('radio', { name: '10%', checked: true })).toHaveClass('bg-t-acento')
  expect(within(tipSection).getByTestId('tip-info')).toHaveTextContent('Propina 10% · se entrega en la mesa · 16.900')
  expect(within(tipSection).getByText('La propina se entrega en la mesa: no suma al total.')).toBeInTheDocument()
  expect(within(totals).getByText('$ 165.750')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Enviar a cocina · \$ 165\.750/ })).toBeInTheDocument()
  fireEvent.click(within(tipSection).getByRole('radio', { name: 'Sin propina' }))
  expect(screen.queryByText(/Propina 10%/)).toBeNull()
  expect(screen.getByText('−5% aplicado')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar lo mío' }))
  expect(props.goPay).toHaveBeenCalledTimes(1)
})

// Falla si sin cuenta el carrito no invita a registrarse para el 5 % (o dice «ya usado» sin cuenta verificada), o si los tres estados (cargando, error, vacío) se confunden.
it('invites to sign up when the discount is still available and tells the three empty states apart', () => {
  const { unmount } = wrap(<FamilyFCart {...base('F4', { discount: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } })} />)
  expect(screen.getByRole('link', { name: /Regístrate y ahorra 5%/ })).toHaveAttribute('href', '/k/c/cuenta/registro')
  expect(screen.queryByText(/Descuento primera compra/)).toBeNull()
  unmount()
  mockStore.account.verificada = false
  const r1 = wrap(<FamilyFCart {...base('F3', { discount: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false } })} />)
  expect(screen.queryByText(/ya usado/)).toBeNull()
  mockStore.account.verificada = true
  r1.unmount()
  const props = base('F4', { cart: null, error: 'x' })
  const r2 = wrap(<FamilyFCart {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(props.retry).toHaveBeenCalledTimes(1)
  r2.unmount()
  const props3 = base('F4', { cart: cartOf([]) })
  wrap(<FamilyFCart {...props3} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(props3.goMenu).toHaveBeenCalledTimes(1)
})
