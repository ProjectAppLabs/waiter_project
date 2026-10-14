import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { TablaCufeHistory } from '@/components/templates/patterns/TablaCufeHistory'
import type { HistoryProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { AccountOrder } from '@/lib/types'

const account = { id: 'a1', nombre: 'Camila Restrepo', correo: 'camila@correo.com', verificada: true }
const orders: AccountOrder[] = [
  { id: 'o2', fecha: '2025-11-09T20:00:00-05:00', local: 'La Provincia', mesa: 6, items: 4, total: 68000, estado: 'servido', descuento: 0 },
  { id: 'o1', fecha: '2025-11-16T21:41:00-05:00', local: 'La Provincia', mesa: 14, items: 3, total: 105945, estado: 'pagado', descuento: 5, lineas: [{ producto_id: 3, nombre: 'Cordero de Boyacá', cantidad: 1, precio: 68000 }, { producto_id: 1, nombre: 'Burrata', cantidad: 2, precio: 32900 }] },
  { id: 'o3', fecha: '2025-11-02T13:00:00-05:00', local: 'La Provincia', mesa: null, items: 2, total: 28400, estado: 'pagado', descuento: 0 },
]
const props = (over: Partial<HistoryProps> = {}): HistoryProps => ({ template: DEFAULT_TEMPLATE, account, orders, onReorder: jest.fn(), ...over })
const wrap = (p: HistoryProps) => render(<NextIntlClientProvider locale="es" messages={messages}><TablaCufeHistory {...p} /></NextIntlClientProvider>)

// Falla si la tabla pierde la cabecera Fecha / Pedido / Total, si las filas no van de la más reciente a la más antigua con fecha y total en
// mono, si el pedido no resume «plato principal +N» o «N ítems · mesa X», o si el estado de factura no distingue pagado (CUFE) de pendiente.
it('lists the orders as a dated table with the invoice state per row', () => {
  wrap(props())
  const table = screen.getByRole('table', { name: 'Mis pedidos' })
  expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Fecha', 'Pedido', 'Total'])
  const rows = within(table).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(3)
  expect(within(rows[0]).getByText('16 nov')).toHaveClass('font-t-mono')
  expect(rows[0]).toHaveTextContent('Cordero de Boyacá +1')
  expect(rows[0]).toHaveTextContent('CUFE disponible')
  expect(within(rows[0]).getByText('105.945')).toHaveClass('font-t-mono')
  expect(rows[1]).toHaveTextContent('4 ítems · mesa 6')
  expect(rows[1]).toHaveTextContent('Factura pendiente')
  expect(rows[2]).toHaveTextContent('2 ítems')
  expect(screen.getByText('3 pedidos')).toBeInTheDocument()
})

// Falla si «Volver a pedir» no repite el pedido más reciente que trae líneas, o si aparece cuando ningún pedido las trae.
it('reorders the most recent order with lines and hides the button otherwise', () => {
  const p = props()
  const { unmount } = wrap(p)
  fireEvent.click(screen.getByRole('button', { name: 'Volver a pedir' }))
  expect(p.onReorder).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
  unmount()
  wrap(props({ orders: orders.filter((o) => !o.lineas) }))
  expect(screen.queryByRole('button', { name: 'Volver a pedir' })).toBeNull()
})
