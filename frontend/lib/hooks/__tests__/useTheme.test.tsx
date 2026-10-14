import { act, renderHook } from '@testing-library/react'

import { applyTheme, useTheme } from '@/lib/hooks/useTheme'

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme })

// Falla si elegir Oscuro no marca <html data-theme="dark"> o no se recuerda entre cargas.
it('applies and persists the chosen mode', () => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setMode('dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('waiter.theme')).toBe('dark')
  const again = renderHook(() => useTheme())
  expect(again.result.current.mode).toBe('dark')
})

// Falla si "Sistema" deja de seguir a prefers-color-scheme (matchMedia está mockeado en claro en jest.setup).
it('system resolves through matchMedia', () => {
  applyTheme('system')
  expect(document.documentElement.dataset.theme).toBe('light')
})
