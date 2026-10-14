import { formatCop } from '@/lib/domain/money'

// Falla si el separador de miles deja de ser el punto colombiano.
it('formats thousands with a dot and no decimals', () => {
  expect(formatCop(36900)).toBe('36.900')
  expect(formatCop(80960)).toBe('80.960')
})

// Falla si un total en cero se pinta vacío o como "0.000".
it('formats zero as a bare zero', () => {
  expect(formatCop(0)).toBe('0')
})

// Falla si los centavos del servidor se cuelan en el ticket.
it('rounds half-up cents away before formatting', () => {
  expect(formatCop(87822.4)).toBe('87.822')
})
