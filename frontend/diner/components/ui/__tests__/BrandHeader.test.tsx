import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { BrandHeader } from '@/components/ui/BrandHeader'
import messages from '@/lib/i18n/messages/es.json'
import type { Brand } from '@/lib/types'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const brand: Brand = {
  nombre: 'Burger House', lema: 'Cocina de barrio', logo: '/api/v1/burger-house/poblado/logo/?v=20260905010203', saludo: '', mesero: 'Alex',
  bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F2EAEA', fuente: 'Fraunces', radio: 14,
}

// Falla si el encabezado pierde el nombre cuando hay logo, o pinta el nombre dos veces (logo y texto).
it('shows the logo instead of the name when the brand has one', () => {
  wrap(<BrandHeader brand={brand} table={8} />)
  expect(screen.getByRole('img', { name: 'Burger House' })).toHaveAttribute('src', brand.logo!)
  expect(screen.queryByText('Burger House')).toBeNull()
  expect(screen.getByText('Mesa 8')).toBeInTheDocument()
})

// Falla si un logo roto (Odoo caído, logo/ en 404, binario no ráster) deja el encabezado sin logo y sin nombre.
it('falls back to the name when the logo fails to load', () => {
  wrap(<BrandHeader brand={brand} table={null} />)
  fireEvent.error(screen.getByRole('img', { name: 'Burger House' }))
  expect(screen.getByText('Burger House')).toHaveClass('font-display')
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('Domicilio')).toBeInTheDocument()
})

// Falla si el nombre no aparece cuando la marca no tiene logo (registro sin logo_url y Odoo sin brand_logo).
it('shows the name when there is no logo', () => {
  wrap(<BrandHeader brand={{ ...brand, logo: null }} table={8} />)
  expect(screen.getByText('Burger House')).toBeInTheDocument()
  expect(screen.queryByRole('img')).toBeNull()
})
