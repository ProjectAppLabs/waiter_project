import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QtyStepper } from '@/components/order/QtyStepper'

// Falla si el "+" deja de sumar de uno en uno (el mesero pide 2 y salen 3).
it('plus increments the quantity by one', async () => {
  const onChange = jest.fn()
  render(<QtyStepper qty={1} onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: '＋' }))
  expect(onChange).toHaveBeenCalledWith(2)
})

// Falla si las celdas bajan de los 52 px que "se aciertan sin mirar".
it('renders 52px touch cells', () => {
  render(<QtyStepper qty={1} onChange={jest.fn()} />)
  expect(screen.getByRole('button', { name: '−' })).toHaveClass('w-[52px]', 'h-[52px]')
})
