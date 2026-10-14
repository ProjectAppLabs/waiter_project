import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

// Falla si el botón de confirmar deja de disparar onConfirm (cobros que nunca se ejecutan).
it('confirm button calls onConfirm once', async () => {
  const onConfirm = jest.fn()
  render(<ConfirmDialog open title="¿Cobrar mesa 9?" body="Total $ 80.960" confirmLabel="Sí, cobrar" cancelLabel="Mejor no" onConfirm={onConfirm} onCancel={jest.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Sí, cobrar' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

// Falla si un diálogo cerrado sigue en el DOM y captura clics del salón.
it('renders nothing when closed', () => {
  render(<ConfirmDialog open={false} title="x" body="y" confirmLabel="a" cancelLabel="b" onConfirm={jest.fn()} onCancel={jest.fn()} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})
