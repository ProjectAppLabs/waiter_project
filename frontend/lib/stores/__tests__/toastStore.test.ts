import { act } from '@testing-library/react'

import { toast, useToastStore } from '@/lib/stores/toastStore'

beforeEach(() => { jest.useFakeTimers(); useToastStore.setState({ toasts: [] }) })
afterEach(() => jest.useRealTimers())

// Falla si un toast no desaparece solo a los 5 s o si se pierde el orden de llegada.
it('pushes toasts and removes them after five seconds', () => {
  act(() => { toast({ title: 'Pedido #DI001 enviado' }); toast({ title: 'Otro', tone: 'danger' }) })
  expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(['Pedido #DI001 enviado', 'Otro'])
  expect(useToastStore.getState().toasts[1].tone).toBe('danger')
  act(() => { jest.advanceTimersByTime(5_000) })
  expect(useToastStore.getState().toasts).toHaveLength(0)
})
