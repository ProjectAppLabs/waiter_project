import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Card } from '@/components/kit/Card'
import { Chip } from '@/components/kit/Chip'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { StatusPill } from '@/components/kit/StatusPill'
import { Toggle } from '@/components/kit/Toggle'

// Falla si el chip activo pierde el fondo suave del primario o el conteo deja de verse.
it('chip shows its count and marks the active state', async () => {
  const onClick = jest.fn()
  render(<Chip label="En progreso" count={20} active onClick={onClick} />)
  const chip = screen.getByRole('button', { name: /En progreso 20/ })
  expect(chip).toHaveAttribute('aria-pressed', 'true')
  expect(chip).toHaveClass('bg-primary-soft')
  await userEvent.click(chip)
  expect(onClick).toHaveBeenCalled()
})

// Falla si un tono de estado deja de mapear al color del kit (naranja en progreso, verde servido).
it('status pill maps tones to kit colors', () => {
  render(<><StatusPill tone="progress">En progreso</StatusPill><StatusPill tone="success">Servido</StatusPill></>)
  expect(screen.getByText('En progreso')).toHaveClass('bg-progress-soft', 'text-progress-ink')
  expect(screen.getByText('Servido')).toHaveClass('bg-success-soft', 'text-success-ink')
})

// Falla si el interruptor deja de anunciarse como switch o no informa el valor nuevo al cambiar.
it('toggle is a switch that reports the new value', async () => {
  const onChange = jest.fn()
  render(<Toggle checked={false} onChange={onChange} label="Sonido" />)
  await userEvent.click(screen.getByRole('switch', { name: 'Sonido' }))
  expect(onChange).toHaveBeenCalledWith(true)
})

// Falla si la tarjeta pierde su título o su acción, o si el estado vacío no muestra su texto.
it('card renders title, action and body; empty state renders icon and copy', () => {
  render(<Card title="Mesas disponibles" action={<button>Ver</button>}>cuerpo</Card>)
  expect(screen.getByText('Mesas disponibles')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument()
  render(<KitEmptyState icon="cart" title="Sin pedidos" body="Aquí aparecerá el último pedido." />)
  expect(screen.getByText('Sin pedidos')).toBeInTheDocument()
})
