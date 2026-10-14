import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { FamilyECart } from '@/components/templates/families/E/FamilyECart'
import { cartOf, line, templateOf, wrap } from '@/components/templates/families/E/__tests__/fixtures'
import type { CartLayoutProps } from '@/components/templates/types'

const mockStore = { account: null as { id: string; nombre: string; correo: string; verificada: boolean } | null }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => mockStore }))

const hrefs = { home: '/norte/centro/t/Z2XUVG', menu: '/norte/centro/t/Z2XUVG/carta', pay: '/norte/centro/t/Z2XUVG/pago', table: '/norte/centro/t/Z2XUVG/la-cuenta', signup: '/norte/centro/t/Z2XUVG/cuenta/registro' }
const lines = [line({ id: 1, cantidad: 2, subtotal: 28000, nota: 'bien fría' }), line({ id: 2, comensal: 'c-2', mio: false, producto_id: 4, nombre: 'Humo de páramo', precio: 34000, subtotal: 34000 })]
const base = (codigo: string, over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf(lines), template: templateOf(codigo, codigo === 'E4' ? 'claro' : 'oscuro'), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn().mockResolvedValue('ord-1'),
  goPay: jest.fn(), goMenu: jest.fn(), discount: { porcentaje: 5, monto: 3100, aplicable: true, aplicado: true }, retry: jest.fn(), hrefs, ...over,
})

beforeEach(() => { mockStore.account = null })

// Falla si el base (E1) pierde el avatar con iniciales por línea, el importe en mono, el chip «−5% aplicado» junto al total, o si la
// línea ajena se puede editar.
it('E1: draws owner avatars, mono amounts, the discount chip by the total and Pagar lo mío', () => {
  wrap(<FamilyECart {...base('E1')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu pedido')
  expect(screen.getByText('3 ítems')).toBeInTheDocument()
  expect(screen.getByLabelText('Yo')).toHaveClass('bg-t-acento')
  expect(screen.getByLabelText('Comensal 1')).toHaveClass('bg-kitchen')
  expect(within(screen.getByText('Golden Ale').closest('li') as HTMLElement).getByText('28.000')).toHaveClass('font-t-mono')
  expect(screen.getByText('Lo mío').nextSibling).toHaveTextContent('28.000')
  expect(screen.getByText('2 · bien fría')).toBeInTheDocument()
  expect(screen.getByText('−5% aplicado')).toHaveClass('text-[#A9E0C0]')
  expect(screen.getByText('$ 58.900')).toHaveClass('text-[25px]')
  expect(screen.getByText('Descuento primera compra 5%').nextSibling).toHaveTextContent('−3.100')
  expect(screen.getByText('Subtotal').nextSibling).toHaveTextContent('62.000')
  expect(screen.getByRole('button', { name: 'Pagar lo mío' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Editar Humo de páramo' })).toBeNull()
  expect(screen.getByText('Humo de páramo').closest('li')).toHaveClass('bg-t-superficie')
})

// Falla si tocar mi línea no abre cantidad/quitar, si bajar de 1 deja cantidad 0, o si «Quitar» no quita.
it('opens the stepper on tap, steps the quantity and removes below one', () => {
  const props = base('E1', { cart: cartOf([line({ id: 1, cantidad: 1, subtotal: 14000 })]) })
  wrap(<FamilyECart {...props} />)
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Editar Golden Ale' }))
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(props.setQty).toHaveBeenCalledWith(1, 2)
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(props.remove).toHaveBeenCalledWith(1)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Golden Ale' }))
  expect(props.remove).toHaveBeenCalledTimes(2)
})

// Falla si «Enviar a cocina» no es la acción principal con el total en mono, si se puede tocar dos veces, o si «Ir a pagar» y
// «o pagar en la mesa con el mesero» desaparecen.
it('sends to the kitchen once, goes to pay and keeps the pay-at-table way out', async () => {
  let finish!: (id: string) => void
  const props = base('E2', { confirm: jest.fn().mockReturnValue(new Promise<string>((r) => { finish = r })) })
  wrap(<FamilyECart {...props} />)
  const send = screen.getByRole('button', { name: /Enviar a cocina · \$ 58\.900/ })
  expect(within(send).getByText('58.900')).toHaveClass('font-t-mono')
  fireEvent.click(send)
  expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled()
  finish('ord-1')
  await waitFor(() => expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(props.goPay).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', hrefs.table)
  expect(screen.getByRole('link', { name: 'Agregar algo más' })).toHaveAttribute('href', hrefs.menu)
})

// Falla si E2 pierde la voz serif en cabecera, líneas y total, o si E4 (claro) pinta el chip de E1 en vez de la línea.
it('E2 uses the display voice; E4 keeps the discount as a line', () => {
  const { unmount } = wrap(<FamilyECart {...base('E2')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('t-title', 'text-[22px]')
  expect(screen.getByText('Golden Ale')).toHaveClass('t-title', 'text-[20px]')
  expect(screen.getByText('Total de la mesa')).toHaveClass('t-title')
  expect(screen.queryByText('−5% aplicado')).toBeNull()
  unmount()
  wrap(<FamilyECart {...base('E4')} />)
  expect(screen.queryByText('−5% aplicado')).toBeNull()
  expect(screen.getByText('Descuento primera compra 5%')).toBeInTheDocument()
  expect(screen.getByLabelText('Yo')).toBeInTheDocument()
})

// Falla si E3 pierde la banda dorada del 5 % o los índices en mono en el acento, o si el CTA no mide 60 px.
it('E3 shows the discount banner, numbered lines and the tall CTA', () => {
  wrap(<FamilyECart {...base('E3')} />)
  expect(screen.getByText('5%').parentElement).toHaveClass('bg-t-acento-suave')
  expect(screen.getByText('Primera compra: descuento aplicado.')).toBeInTheDocument()
  expect(screen.getByText('1')).toHaveClass('font-t-mono', 'text-t-acento')
  expect(screen.getByText('2')).toHaveClass('font-t-mono')
  expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toHaveClass('h-[60px]')
  expect(screen.queryByText('−5% aplicado')).toBeNull()
})

// Falla si E3 no invita a registrarse desde la banda cuando el descuento aún no aplica.
it('E3 turns the banner into the signup invitation while the discount is pending', () => {
  wrap(<FamilyECart {...base('E3', { discount: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } })} />)
  expect(screen.getByRole('link', { name: /Primera compra: regístrate y ahorra 5%/ })).toHaveAttribute('href', hrefs.signup)
})

// Falla si E5 pierde los chips bajo la línea o la nota verde «Incluye tu 5% de primera compra».
it('E5 draws chips under each line and the discount note under the CTA', () => {
  wrap(<FamilyECart {...base('E5')} />)
  expect(screen.getByText('2 · bien fría')).toHaveClass('rounded-t-chip')
  expect(screen.getAllByText('IVA incluido')).toHaveLength(2)
  expect(screen.getByText('Incluye tu 5% de primera compra')).toHaveClass('text-free')
})

// Falla si los estados cargando / no se pudo / vacío se confunden entre sí.
it('tells loading, failed and empty apart', () => {
  const { unmount } = wrap(<FamilyECart {...base('E1', { cart: null })} />)
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  unmount()
  const failed = base('E1', { cart: null, error: 'x' })
  const r2 = wrap(<FamilyECart {...failed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(failed.retry).toHaveBeenCalledTimes(1)
  r2.unmount()
  const empty = base('E1', { cart: cartOf([]) })
  wrap(<FamilyECart {...empty} />)
  expect(screen.getByText('Todavía no has agregado nada.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(empty.goMenu).toHaveBeenCalledTimes(1)
})
