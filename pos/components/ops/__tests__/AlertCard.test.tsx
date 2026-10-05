import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { AlertCard } from '@/components/ops/AlertCard'
import type { Alert } from '@/lib/domain/ops'
import { messages } from '@/lib/i18n/messages'

const alert = (over: Partial<Alert>): Alert => ({ id: 'a1', kind: 'kitchen', orderId: 42, tableId: 3, tableNumber: 5, seconds: 754, severity: 'busy', ...over })
const mount = (a: Alert) => {
  const onResolve = jest.fn(), onAttend = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}><AlertCard alert={a} late={18} queue={4} onResolve={onResolve} onAttend={onAttend} /></NextIntlClientProvider>)
  return { onResolve, onAttend }
}

// Falla si la alerta de cocina no dice qué pedido, de qué mesa, el umbral y la cola, si el reloj no está en minutos y
// segundos, o si ofrecer cortesía no la resuelve con su texto.
it('pedido demorado: explica la demora y ofrece cortesía', () => {
  const a = alert({})
  const { onResolve } = mount(a)
  const card = screen.getByRole('article', { name: 'Pedido demorado' })
  expect(card).toHaveTextContent('#42 de mesa 5 pasó los 18 minutos. La cocina tiene 4 en cola.')
  expect(card).toHaveTextContent('12:34')
  expect(card).toHaveClass('bg-busy-soft')
  expect(screen.getByRole('link', { name: 'Ver en cocina' })).toHaveAttribute('href', '/kds')
  fireEvent.click(screen.getByRole('button', { name: 'Ofrecer cortesía' }))
  expect(onResolve).toHaveBeenCalledWith(a, 'Cortesía ofrecida en mesa 5')
})

// Falla si la cuenta sin cobrar no dice los minutos enteros, no lleva a Pedidos o «Atendida» no la resuelve.
it('cuenta sin cobrar: lleva a cobrar y se marca atendida', () => {
  const a = alert({ kind: 'payment', seconds: 425, severity: 'warn', tableNumber: null })
  const { onResolve } = mount(a)
  const card = screen.getByRole('article', { name: 'Cuenta sin cobrar' })
  expect(card).toHaveTextContent('Mesa — pidió la cuenta hace 7 min')
  expect(card).not.toHaveClass('bg-busy-soft')
  expect(screen.getByRole('link', { name: 'Ir a cobrar' })).toHaveAttribute('href', '/pedidos')
  fireEvent.click(screen.getByRole('button', { name: 'Atendida' }))
  expect(onResolve).toHaveBeenCalledWith(a, 'Cuenta de mesa — atendida')
})

// Falla si el llamado de una mesa no ofrece «Voy yo» ni lleva al salón, o si «Voy yo» no avisa quién atiende.
it('mesa pide mesero: «Voy yo» y enlace al salón', () => {
  const a = alert({ kind: 'table', severity: 'warn' })
  const { onAttend, onResolve } = mount(a)
  expect(screen.getByRole('article', { name: 'Mesa pide mesero' })).toHaveTextContent('Mesa 5 llamó al mesero desde su celular.')
  expect(screen.getByRole('link', { name: 'Ir al salón' })).toHaveAttribute('href', '/salon')
  fireEvent.click(screen.getByRole('button', { name: 'Voy yo' }))
  expect(onAttend).toHaveBeenCalledWith(a)
  expect(onResolve).not.toHaveBeenCalled()
})

// Falla si «Voy yo» se cae cuando quien pinta la alerta no pasó a quién avisar.
it('«Voy yo» sin manejador no se cae', () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><AlertCard alert={alert({ kind: 'table' })} late={18} queue={0} onResolve={jest.fn()} /></NextIntlClientProvider>)
  expect(() => fireEvent.click(screen.getByRole('button', { name: 'Voy yo' }))).not.toThrow()
})
