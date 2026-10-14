import { render, screen } from '@testing-library/react'

import { Button } from '@/components/ui/Button'

// Falla si la acción de dinero baja de los 64 px que fija el sistema Waiter.
it('money size renders the 64px touch target class', () => {
  render(<Button size="money">Cobrar</Button>)
  expect(screen.getByRole('button', { name: 'Cobrar' })).toHaveClass('h-tap-money')
})

// Falla si el primario deja de ser Brasa (el único color de acción permitido en operación).
it('primary variant uses the brand background', () => {
  render(<Button variant="primary">Enviar a cocina</Button>)
  expect(screen.getByRole('button')).toHaveClass('bg-brand-500')
})
