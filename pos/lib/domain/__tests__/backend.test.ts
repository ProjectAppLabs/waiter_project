import { backendFor } from '@/lib/domain/backend'

// Falla si una organización que sigue en Odoo se manda al sistema propio (o al revés), o si sin organización no se
// sigue en Odoo como hasta ahora.
it('decide en qué sistema vive cada organización', () => {
  expect(backendFor('burger-house', 'burger-house')).toBe('odoo')
  expect(backendFor('frisby', 'burger-house, otra')).toBe('core')
  expect(backendFor('otra', 'burger-house, otra')).toBe('odoo')
  expect(backendFor(null, 'burger-house')).toBe('odoo')
  expect(backendFor('frisby', '')).toBe('core')
})

// Falla si, tras el corte de T6 (ninguna organización en Odoo), una tableta sin organización conocida sigue llamando a
// Odoo apagado en vez del sistema propio.
it('sin organizaciones en Odoo, lo desconocido va al sistema propio', () => {
  expect(backendFor(null, '')).toBe('core')
  expect(backendFor(null, 'burger-house')).toBe('odoo')
  expect(backendFor('burger-house', '')).toBe('core')
})
