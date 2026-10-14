import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { FamilyDCart } from '@/components/templates/families/D/FamilyDCart'
import { cartOf, cartProps, entryOf, line, templateOf, wrap } from '@/components/templates/families/D/__tests__/fixtures'
import type { Account, Entry } from '@/lib/types'

const mockStore = { entry: null as Entry | null, account: null as Account | null, accountOrders: [], loadAccount: jest.fn() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel?: (s: typeof mockStore) => unknown) => (sel ? sel(mockStore) : mockStore) }))

const verified: Account = { id: 'a1', nombre: 'Camila', correo: 'c@c.co', verificada: true }
const two = () => cartOf([line(), line({ id: 2, comensal: 'other', mio: false, producto_id: 2, nombre: 'Cortado', precio: 6500, cantidad: 1, subtotal: 6500 })])

beforeEach(() => { mockStore.entry = entryOf(); mockStore.account = null })

// Falla si la piel de familia pierde «Tu pedido» + conteo, la fila con precio mono, lo de los demás en solo lectura, o si un toque en
// la línea no abre el contador (el marco no lo dibuja) con Más / Quitar funcionando.
it('paints the family skin and opens the controls with a tap on the line', () => {
  const p = cartProps({ cart: two() })
  wrap(<FamilyDCart {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu pedido')
  expect(screen.getByText('3 ítems')).toBeInTheDocument()
  expect(screen.getAllByText('18.000')[0]).toHaveClass('font-t-mono')
  expect(screen.getByText('2 × 9.000')).toBeInTheDocument()
  expect(screen.getByText('Pedido por otros en la mesa').closest('section')).toHaveTextContent('Cortado')
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  const edit = screen.getByRole('button', { name: 'Editar: Latte' })
  fireEvent.click(edit)
  expect(edit).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(p.setQty).toHaveBeenCalledWith(1, 3)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Latte' }))
  expect(p.remove).toHaveBeenCalledWith(1)
  expect(screen.getByText('$ 24.500')).toHaveClass('font-t-mono')
})

// Falla si «Enviar a cocina» deja de ser la acción principal (con el total en mono), si «Ir a pagar» no va a pagar, o si se pierde «o pagar en la mesa».
it('keeps send-to-kitchen as the main action, go-pay and pay-at-table', async () => {
  let finish!: (id: string) => void
  const p = cartProps({ confirm: jest.fn().mockReturnValue(new Promise<string>((resolve) => { finish = resolve })) })
  wrap(<FamilyDCart {...p} />)
  const send = screen.getByRole('button', { name: 'Enviar a cocina · $ 18.000' })
  expect(send).toHaveClass('bg-t-acento')
  fireEvent.click(send)
  expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled()
  expect(p.confirm).toHaveBeenCalledTimes(1)
  finish('ord-1')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a cocina · $ 18.000' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(p.goPay).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/t')
})

// Falla si el 5 % no se dibuja como pide cada spec: banner (D5), chip junto al total (D2, con la acción en tinta), «ya usado» con
// «—» (D4 con cuenta verificada), o la invitación a registrarse cuando no hay cuenta.
it('draws the discount the way each template asks', () => {
  const applied = { porcentaje: 5, monto: 825, aplicable: false, aplicado: true }
  const unused = { porcentaje: 5, monto: 0, aplicable: false, aplicado: false }
  const d5 = wrap(<FamilyDCart {...cartProps({ template: templateOf('D5'), discount: applied })} />)
  expect(screen.getByText('Primera compra: descuento aplicado.')).toBeInTheDocument()
  expect(screen.getByText('Descuento primera compra 5%')).toBeInTheDocument()
  d5.unmount()
  const d2 = wrap(<FamilyDCart {...cartProps({ template: templateOf('D2'), discount: applied })} />)
  expect(screen.getByText('−5% aplicado')).toHaveClass('bg-free-soft')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('bg-t-tinta')
  d2.unmount()
  const anon = wrap(<FamilyDCart {...cartProps({ template: templateOf('D4'), discount: unused })} />)
  expect(screen.getByRole('link', { name: 'Regístrate y ahorra 5% en tu primera compra →' })).toHaveAttribute('href', '/s')
  expect(screen.queryByText('5% ya usado en tu 1ª visita')).toBeNull()
  anon.unmount()
  mockStore.account = verified
  wrap(<FamilyDCart {...cartProps({ template: templateOf('D4'), discount: unused })} />)
  expect(screen.getByText('5% ya usado en tu 1ª visita').nextSibling).toHaveTextContent('—')
})

// Falla si la pizarra (D1) pierde el serif centrado, la guía de puntos, el Total en serif con separador punteado o los botones
// crema de 60 px con radio 8; o si un toque en la línea no abre los controles.
it('renders the D1 slate variant with serif lines and cream serif buttons', () => {
  const p = cartProps({ template: templateOf('D1'), cart: two() })
  wrap(<FamilyDCart {...p} />)
  expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('text-center')
  expect(screen.getByRole('button', { name: 'Editar: Latte' }).querySelector('.border-dotted')).not.toBeNull()
  expect(screen.getByText('Total de la mesa')).toHaveClass('font-t-display')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('h-[60px]', 'rounded-[8px]', 'font-t-display')
  fireEvent.click(screen.getByRole('button', { name: 'Editar: Latte' }))
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(p.setQty).toHaveBeenCalledWith(1, 1)
})

// Falla si la vitrina (D3) pierde la miniatura por producto (de la carta cargada) o el contador siempre visible con «Quitar» en rojo.
it('renders the D3 showcase variant with thumbnails and a visible stepper', () => {
  const p = cartProps({ template: templateOf('D3'), cart: cartOf([line(), line({ id: 3, producto_id: 2, nombre: 'Cortado', precio: 6500, cantidad: 1, subtotal: 6500 })]) })
  wrap(<FamilyDCart {...p} />)
  const items = screen.getAllByRole('listitem')
  expect(within(items[0]).getByRole('presentation')).toHaveAttribute('src', '/fotos/1/')
  expect(within(items[1]).getByText('Foto del plato')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Más' })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Quitar: Cortado' })).toHaveClass('text-busy-ink')
  fireEvent.click(screen.getAllByRole('button', { name: 'Menos' })[1])
  expect(p.remove).toHaveBeenCalledWith(3)
})

// Falla si los tres estados previos (cargando, no se pudo leer, vacío) no dicen qué pasa y qué hacer.
it('shows loading, failed and empty states with a way out', () => {
  const p = cartProps({ cart: null })
  const loading = wrap(<FamilyDCart {...p} />)
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  loading.unmount()
  const failed = wrap(<FamilyDCart {...cartProps({ cart: null, error: 'boom' })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  failed.unmount()
  const empty = cartProps({ cart: cartOf([]) })
  wrap(<FamilyDCart {...empty} />)
  expect(screen.getByText('Todavía no has agregado nada.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Enviar a cocina/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(empty.goMenu).toHaveBeenCalledTimes(1)
})
