import { cn, initials } from '@/lib/utils'

// Falla si las iniciales del avatar salen mal con un solo nombre, con minúsculas o con tres palabras.
it('builds two uppercase initials at most', () => {
  expect([initials('Alejandra Castro'), initials('administrator'), initials('Ana María Ruiz'), initials('')]).toEqual(['AC', 'A', 'AM', ''])
})

// Falla si cn deja de descartar los falsy (una clase "false" rompería Tailwind).
it('joins only truthy classes', () => {
  expect(cn('a', false, null, undefined, 'b')).toBe('a b')
})
