import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ProductCard } from '@/components/order/ProductCard'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const base = { id: 3, templateId: 3, name: 'Burrata italiana', price: 32900, categoryIds: [1], taxIds: [], favorite: false, storable: false, soldOut: false, hasImage: false }

// Falla si el favorito pierde su insignia y el anillo Brasa que lo destacan en la rejilla.
it('highlights a favorite with a badge and the brand ring', () => {
  wrap(<ProductCard product={{ ...base, favorite: true }} onAdd={jest.fn()} />)
  expect(screen.getByText('El favorito')).toBeInTheDocument()
  expect(screen.getByRole('button')).toHaveClass('border-brand-500')
})

// Falla si un producto agotado sigue pudiendo agregarse al pedido (la cocina no puede prepararlo).
it('marks a sold out product and blocks adding it', () => {
  wrap(<ProductCard product={{ ...base, storable: true, soldOut: true, hasImage: false }} onAdd={jest.fn()} />)
  expect(screen.getByText('Agotado')).toBeInTheDocument()
  expect(screen.getByRole('button')).toBeDisabled()
})
