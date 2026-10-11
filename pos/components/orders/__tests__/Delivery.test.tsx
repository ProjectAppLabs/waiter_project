import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CashierOrderCard } from '@/components/orders/CashierOrderCard'
import { DeliveryPanel } from '@/components/orders/DeliveryPanel'
import { PrintHost } from '@/components/print/PrintHost'
import { deliveryReceipt, mapsUrl } from '@/lib/domain/delivery'
import type { KitOrder } from '@/lib/domain/orderState'
import { messages } from '@/lib/i18n/messages'
import { toDelivery } from '@/lib/services/core/salesBridge'
import type { CoreOrder } from '@/lib/services/core/sales'
import { usePrintStore } from '@/lib/stores/printStore'

const domicilio: KitOrder = {
  id: 9, number: 'DE009', type: 'delivery', state: 'draft', tableId: null, tableNumber: null, customer: 'Ana Ruiz', startedAt: '2026-10-09 20:00:00', total: 47000, tax: 0, paid: 0,
  lines: [{ id: 1, uuid: 'u1', productId: 3, name: 'Hamburguesa Angus', qty: 1, unitPrice: 42000, subtotal: 42000, total: 42000, note: 'Sin cebolla', courseId: 1, readyAt: null, servedAt: null },
    { id: 2, uuid: 'u2', productId: 99, name: 'Domicilio', qty: 1, unitPrice: 5000, subtotal: 5000, total: 5000, note: '', courseId: 1, readyAt: null, servedAt: null }],
  courses: [{ id: 1, fired: true, readyAt: null, servedAt: null }], phone: '3001234567',
  delivery: { address: 'Calle 9 # 40-10, El Poblado', details: 'Torre 2 apto 301', phone: '3001234567', lat: 6.21, lng: -75.57, fee: 5000, payment: 'cash', distanceKm: 2.4 },
}
const ui = (node: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{node}</NextIntlClientProvider>)
beforeEach(() => { usePrintStore.setState({ sheets: null, receipt: null }); window.print = jest.fn() })

// Falla si en caja un domicilio se ve igual que una cuenta de mesa: sin su color, su insignia, cómo paga y la dirección.
it('distingue el domicilio en caja', () => {
  ui(<CashierOrderCard order={domicilio} status="in_progress" mayCharge />)
  const tarjeta = screen.getByRole('article', { name: 'Domicilio DE009' })
  expect(tarjeta).toHaveAttribute('data-delivery', 'true')
  expect(tarjeta.className).toContain('bg-delivery-soft')
  expect(within(tarjeta).getByText('Efectivo contra entrega')).toBeInTheDocument()
  expect(within(tarjeta).getByText('Calle 9 # 40-10, El Poblado')).toBeInTheDocument()
})

// Falla si el detalle no da a quién despacha la dirección, las indicaciones, el teléfono, el mapa y el envío, o si el
// recibo impreso omite los datos del cliente, repite el envío como plato o no dice si hay que cobrar.
it('muestra el domicilio e imprime su recibo con los datos del cliente', async () => {
  ui(<><DeliveryPanel order={domicilio} /><PrintHost /></>)
  expect(screen.getByText('Torre 2 apto 301')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Abrir en Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=6.21,-75.57')
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Imprimir recibo de domicilio' })))
  const recibo = screen.getByLabelText('Recibo de domicilio DE009', { selector: 'section' })
  expect(within(recibo).getByText('Ana Ruiz')).toBeInTheDocument()
  expect(within(recibo).getByText('Tel. 3001234567')).toBeInTheDocument()
  expect(within(recibo).getByText('Torre 2 apto 301')).toBeInTheDocument()
  expect(within(recibo).getByText('COBRAR: Efectivo contra entrega')).toBeInTheDocument()
  expect(within(recibo).queryByText(/1× Domicilio/)).toBeNull()
  await waitFor(() => expect(window.print).toHaveBeenCalled())
})

// Falla si un pedido pagado en línea se imprime como «por cobrar», si un pedido sin domicilio da recibo de domicilio,
// o si la dirección repite las indicaciones o las cifras del servidor (texto decimal) no se leen como números.
it('marca pagado lo pagado y no inventa domicilios', () => {
  expect(deliveryReceipt({ ...domicilio, delivery: { ...domicilio.delivery!, payment: 'online' } }, true)?.paid).toBe(true)
  expect(deliveryReceipt({ ...domicilio, type: 'takeout' }, false)).toBeNull()
  expect(mapsUrl(null, -75)).toBeNull()
  expect(toDelivery({ service: 'dine_in' } as CoreOrder)).toBeNull()
  expect(toDelivery({ service: 'delivery', delivery_address: 'Calle 1 · Apto 2', delivery_phone: '300', delivery_fee: '4000.00', delivery_lat: '6.2', delivery_lng: '-75.5', delivery_payment: 'online', delivery_details: 'Apto 2', delivery_distance_km: '1.20' } as unknown as CoreOrder))
    .toEqual({ address: 'Calle 1', details: 'Apto 2', phone: '300', lat: 6.2, lng: -75.5, fee: 4000, payment: 'online', distanceKm: 1.2 })
})
