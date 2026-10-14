import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CardsHistory, orderSummary } from '@/components/templates/patterns/CardsHistory'
import type { HistoryProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { AccountOrder } from '@/lib/types'

const account = { id: 'a1', nombre: 'Camila Restrepo', correo: 'camila@correo.com', verificada: true }
const recent: AccountOrder = { id: 'o2', fecha: '2025-11-16T02:41:00Z', local: 'El Fogón de la 85', mesa: 14, items: 3, total: 97812, estado: 'pagado', descuento: 5, lineas: [{ producto_id: 3, nombre: 'Hamburguesa Angus', cantidad: 1, precio: 43911 }, { producto_id: 5, nombre: 'Limonada de Coco', cantidad: 2, precio: 11781 }, { producto_id: 15, nombre: 'Brownie', cantidad: 1, precio: 17731 }] }
const older: AccountOrder = { id: 'o1', fecha: '2025-11-09T01:00:00Z', local: 'El Fogón de la 85', mesa: 4, items: 4, total: 62400, estado: 'enviado', descuento: 0 }
const wrap = (p: HistoryProps) => render(<NextIntlClientProvider locale="es" messages={messages}><CardsHistory {...p} /></NextIntlClientProvider>)

// Falla si las tarjetas no van de la más reciente a la más antigua con local, «fecha · primer plato +N», total en mono de 19 px y chips,
// si «Volver a pedir» no está solo en la más reciente con líneas, o si el pie no repite el último pedido.
it('paints one card per order, newest first, and reorders from the newest card and the footer', () => {
  const onReorder = jest.fn()
  wrap({ template: DEFAULT_TEMPLATE, account, orders: [older, recent], onReorder })
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Mis pedidos')
  expect(screen.getByText('2 pedidos')).toBeInTheDocument()
  const cards = screen.getAllByRole('listitem')
  expect(cards).toHaveLength(2)
  expect(cards[0]).toHaveTextContent(/nov.*· Hamburguesa Angus \+2/)
  expect(within(cards[0]).getByText('97.812')).toHaveClass('font-t-mono', 'text-[19px]')
  expect(within(cards[0]).getByText('Pagado')).toBeInTheDocument()
  expect(within(cards[0]).getByText('Ahorraste $ 5')).toBeInTheDocument()
  expect(cards[1]).toHaveTextContent('4 ítems')
  expect(within(cards[1]).getByText('Pendiente')).toBeInTheDocument()
  expect(within(cards[1]).queryByRole('button')).toBeNull()
  fireEvent.click(within(cards[0]).getByRole('button', { name: 'Volver a pedir' }))
  expect(onReorder).toHaveBeenCalledWith(recent)
  fireEvent.click(screen.getByRole('button', { name: 'Volver a pedir · El Fogón de la 85' }))
  expect(onReorder).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(/factura/i)).toBeNull()
})

// Falla si sin ningún pedido con líneas se ofrece «Volver a pedir» en el pie, o si el resumen inventa platos.
it('omits the footer when no order can be reordered', () => {
  wrap({ template: DEFAULT_TEMPLATE, account, orders: [older], onReorder: jest.fn() })
  expect(screen.queryByRole('button')).toBeNull()
  expect(orderSummary(older, '4 ítems')).toBe('4 ítems')
  expect(orderSummary({ ...recent, lineas: recent.lineas!.slice(0, 1) }, '')).toBe('Hamburguesa Angus')
})
