import { render, screen } from '@testing-library/react'

import { CustomerInsights } from '@/components/customers/CustomerInsights'
import type { CoreCustomerProfile } from '@/lib/services/core/loyalty'

const PERFIL: CoreCustomerProfile = {
  consent: { granted_at: '2026-10-01T15:00:00Z', channel: 'whatsapp', version: '2026-10', revoked_at: null },
  addresses: [{ id: 1, label: 'Casa', text: 'Calle 9 # 40-10', details: 'Apto 301', latitude: 6.21, longitude: -75.57, last_used_at: null }],
  insights: { orders: 6, total_spent: 300000, avg_ticket: 50000, first_order_at: '2026-08-01T15:00:00Z', last_order_at: '2026-10-08T23:00:00Z', frequency_days: 11.6,
    hours: { '13': 1, '20': 5 }, weekdays: { '4': 4, '5': 2 }, top_products: [{ product_id: 3, name: 'Hamburguesa Angus', qty: 5 }],
    channels: { pos: 1, menu: 0, whatsapp: 5 }, rfm: { r: 5, f: 4, m: 4, segment: 'fiel' } },
}

// Falla si la ficha no resume cómo pide el cliente (segmento, ticket, frecuencia, día y hora, canal y favoritos) o si
// sus direcciones no se ven con su autorización y su enlace al mapa.
it('resume al cliente y sus direcciones autorizadas', () => {
  render(<CustomerInsights profile={PERFIL} />)
  expect(screen.getByText('Fiel')).toBeInTheDocument()
  expect(screen.getByText('$ 50.000')).toBeInTheDocument()
  expect(screen.getByText('12 días')).toBeInTheDocument()
  expect(screen.getByText('viernes · 20:00')).toBeInTheDocument()
  expect(screen.getByText('WhatsApp')).toBeInTheDocument()
  expect(screen.getByText('Hamburguesa Angus (5)')).toBeInTheDocument()
  expect(screen.getByText('Autorizó sus datos')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver en el mapa' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=6.21,-75.57')
})

// Falla si sin autorización se insinúa que hay datos guardados, o si un cliente sin pedidos muestra indicadores vacíos.
it('sin autorización no muestra direcciones', () => {
  render(<CustomerInsights profile={{ consent: null, addresses: [], insights: { ...PERFIL.insights!, orders: 0 } }} />)
  expect(screen.getByText('Sin autorización')).toBeInTheDocument()
  expect(screen.getByText('Sin su autorización no guardamos direcciones.')).toBeInTheDocument()
  expect(screen.queryByText('Cómo pide')).toBeNull()
})
