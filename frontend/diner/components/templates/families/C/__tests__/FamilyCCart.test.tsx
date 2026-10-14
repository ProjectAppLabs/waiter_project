import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'

import { FamilyCCart } from '@/components/templates/families/C/FamilyCCart'
import { cartOf, entryOf, line, templateC, wrap } from '@/components/templates/families/C/__tests__/fixtures'
import type { CartLayoutProps } from '@/components/templates/types'
import type { Discount } from '@/lib/types'

// La miniatura de C2 y el extra de cierre de C3 salen de la carta del store (la línea solo trae producto_id); el ＋ de C3 agrega por
// el store: se simula con la carta de prueba y un add espía.
const storeAdd = jest.fn()
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel: (s: { entry: unknown; add: unknown }) => unknown) => sel({ entry: entryOf(), add: storeAdd }) }))

const hrefs = { home: '/h', menu: '/m', pay: '/p', table: '/t', signup: '/s' }
const applied: Discount = { porcentaje: 5, monto: 3290, aplicable: true, aplicado: true }
const pending: Discount = { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false }
const props = (codigo: string, over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf([line({ nota: 'papas grandes' }), line({ id: 2, producto_id: 5, nombre: 'Limonada', precio: 12900, cantidad: 1, subtotal: 12900 })]),
  template: templateC(codigo), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn().mockResolvedValue('ord-1'), goPay: jest.fn(), goMenu: jest.fn(), discount: null, retry: jest.fn(), hrefs, ...over,
})

// Falla si C1 pierde la numeración por posición, el banner del 5 % aplicado, el Subtotal/Descuento/Total coherentes, o si las
// acciones del genérico (enviar a cocina, ir a pagar, pagar en la mesa) desaparecen del pie.
it('C1: numbers the lines, shows the applied banner and keeps the three actions', async () => {
  let finish!: (id: string) => void
  const p = props('C1', { discount: applied, confirm: jest.fn().mockReturnValue(new Promise<string>((resolve) => { finish = resolve })) })
  wrap(<FamilyCCart {...p} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Tu pedido' })).toHaveClass('t-title')
  expect(screen.getByText('3 ítems')).toBeInTheDocument()
  expect(screen.getByText('Primera compra: descuento aplicado.')).toBeInTheDocument()
  expect(screen.getByText('papas grandes')).toBeInTheDocument()
  expect(screen.getByText('Subtotal').nextSibling).toHaveTextContent('78.700')
  expect(screen.getByText('Descuento primera compra 5%').nextSibling).toHaveTextContent('−3.290')
  expect(screen.getByText('$ 75.410')).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('button', { name: 'Enviar a cocina' }))
  expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled()
  finish('ord-1')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar a cocina' })).toBeEnabled())
  expect(p.confirm).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(p.goPay).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/t')
})

// Falla si donde el marco no dibuja controles un toque en la línea no los abre, si el stepper no cambia la cantidad, si bajar de 1
// no quita la línea, o si el banner disponible no invita al registro.
it('C1: opens the controls on tap, steps and removes, and turns the banner into the signup invitation', () => {
  const p = props('C1', { discount: pending })
  wrap(<FamilyCCart {...p} />)
  expect(screen.getByRole('link', { name: /Regístrate y ahorra 5%/ })).toHaveAttribute('href', '/s')
  expect(screen.queryByRole('button', { name: 'Más' })).toBeNull()
  const row = screen.getByRole('button', { name: /Editar Limonada/ })
  fireEvent.click(row)
  expect(row).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(p.setQty).toHaveBeenCalledWith(2, 2)
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(p.remove).toHaveBeenCalledWith(2)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Limonada' }))
  expect(p.remove).toHaveBeenCalledTimes(2)
})

// Falla si C2 no pinta la miniatura real del producto (sobre el token de fondo apagado, no un hex), si el stepper y «Quitar» no están
// siempre visibles, si el CTA pierde los 56 px del marco, o si la nota verde del 5 % no acompaña al CTA cuando el descuento aplica.
it('C2: shows the product thumbnail, visible steppers, the 56 px CTA and the green discount note', () => {
  const p = props('C2', { discount: applied })
  wrap(<FamilyCCart {...p} />)
  expect(document.querySelector('img')).toHaveAttribute('src', 'https://x/burger.jpg')
  expect(document.querySelector('img')?.parentElement).toHaveClass('bg-muted')
  expect(screen.getByRole('button', { name: 'Enviar a cocina' })).toHaveClass('h-14')
  expect(screen.getAllByRole('button', { name: 'Más' })).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Más' })[0])
  expect(p.setQty).toHaveBeenCalledWith(1, 3)
  expect(screen.getByText('Incluye tu 5% de primera compra')).toHaveClass('text-free')
})

// Falla si C3 pierde los chips de modificador e «IVA incluido» o la fila de upsell del marco («¿Algo para cerrar?» con el extra de la
// carta a nombre del mesero, ＋ que agrega por el store y que no repite lo que ya está en el pedido), o si C4 pierde la guía de puntos,
// el chip «−5% aplicado» junto al total (sobre tokens, legible en la pizarra) o la línea de descuento (que en C4 es el chip, no una fila).
it('C3 chips the modifiers and offers the closing extra; C4 puts the applied discount as a chip next to the total', () => {
  wrap(<FamilyCCart {...props('C3', { discount: applied })} />)
  expect(screen.getByText('papas grandes')).toHaveClass('rounded-[6px]')
  expect(screen.getAllByText('IVA incluido')).toHaveLength(2)
  expect(screen.getByText('Descuento primera compra 5%')).toBeInTheDocument()
  expect(screen.getByText('¿Algo para cerrar?')).toBeInTheDocument()
  expect(screen.getByText('Alex sugiere Papas · 6.900')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Papas' }))
  expect(storeAdd).toHaveBeenCalledWith(9, 1, '')
  cleanup()
  wrap(<FamilyCCart {...props('C3', { cart: cartOf([line({ producto_id: 9, nombre: 'Papas' })]) })} />)
  expect(screen.getByText('Alex sugiere Salsa extra · 2.000')).toBeInTheDocument()
  cleanup()
  wrap(<FamilyCCart {...props('C1', { discount: applied })} />)
  expect(screen.queryByText('¿Algo para cerrar?')).toBeNull()
  cleanup()
  wrap(<FamilyCCart {...props('C4', { discount: applied })} />)
  expect(screen.getByText('−5% aplicado')).toHaveClass('text-free-soft')
  expect(screen.queryByText('Descuento primera compra 5%')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: 'Tu pedido' }).parentElement).toHaveClass('flex-col')
})

// Falla si C5 pierde el selector de propina (10 % por defecto, como el marco), si la propina entra en el Total (el pago no la recibe y
// mostraría otra cifra), si el bloque de propina se cuela dentro de la caja de totales, o si la nota no dice que se confirma al pagar.
it('C5: offers the tip selector as information outside the totals and keeps the total equal to what pay will show', () => {
  wrap(<FamilyCCart {...props('C5', { discount: applied })} />)
  expect(screen.getByRole('radio', { name: '10%' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('Propina 10%').nextSibling).toHaveTextContent('7.870')
  expect(screen.getByText('$ 75.410')).toHaveClass('font-t-mono')
  expect(screen.queryByText('$ 86.570')).toBeNull()
  const totals = screen.getByText('Subtotal').closest('dl') as HTMLElement
  expect(within(totals).queryByRole('radiogroup')).toBeNull()
  expect(screen.getByRole('region', { name: 'Propina' })).toContainElement(screen.getByRole('radio', { name: '15%' }))
  fireEvent.click(screen.getByRole('radio', { name: '15%' }))
  expect(screen.getByText('Propina 15%').nextSibling).toHaveTextContent('11.805')
  expect(screen.getByText('$ 75.410')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Sin propina' }))
  expect(screen.queryByText(/Propina 1\d%/)).toBeNull()
  expect(screen.getByText('$ 75.410')).toBeInTheDocument()
  expect(screen.getByText('La propina se confirma al pagar; no entra en el total del pedido.')).toBeInTheDocument()
})

// Falla si lo de los demás en la mesa se puede editar o desaparece, si el carrito vacío no lleva a la carta, o si un carrito que no cargó
// se presenta como vacío en vez de ofrecer reintentar.
it('keeps the others read-only and tells the truth on empty and failed carts', () => {
  const p = props('C1', { cart: cartOf([line({}), line({ id: 3, comensal: 'x', mio: false, nombre: 'Agua' })]) })
  wrap(<FamilyCCart {...p} />)
  const others = screen.getByText('Pedido por otros en la mesa').parentElement as HTMLElement
  expect(within(others).getByText('Agua')).toBeInTheDocument()
  expect(within(others).queryByRole('button')).toBeNull()
  wrap(<FamilyCCart {...props('C1', { cart: cartOf([]) })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  const failed = props('C1', { cart: null, error: 'Error 503' })
  wrap(<FamilyCCart {...failed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(failed.retry).toHaveBeenCalledTimes(1)
})
