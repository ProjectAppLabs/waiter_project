import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { OrderBar } from '@/components/ui/OrderBar'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const line = { id: 1, comensal: 'a', mio: true, producto_id: 3, nombre: 'Lomo', precio: 38900, cantidad: 2, nota: '', subtotal: 77800 }

// Falla si la barra fija aparece vacía, o pierde el conteo y el total que el comensal va a pagar.
it('shows count and total only when there is something in the order', () => {
  const { rerender } = wrap(<OrderBar cart={null} href="/x" />)
  expect(screen.queryByRole('link')).toBeNull()
  rerender(<NextIntlClientProvider locale="es" messages={messages}><OrderBar cart={{ sesion: 's', lineas: [line], total: 77800, mio: 77800, por_comensal: [] }} href="/x" /></NextIntlClientProvider>)
  expect(screen.getByRole('link', { name: 'Tu pedido' })).toHaveTextContent('2')
  expect(screen.getByText('$ 77.800')).toHaveClass('font-mono')
})
