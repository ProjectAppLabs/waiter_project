import { render, screen } from '@testing-library/react'

import { Money } from '@/components/ui/Money'

// Falla si una cifra sale sin mono tabular: en columnas dejan de alinearse.
it('renders the formatted amount in tabular mono', () => {
  render(<Money amount={80960} withSymbol />)
  const el = screen.getByText('$ 80.960')
  expect(el).toHaveClass('font-mono', 'tabular')
})
