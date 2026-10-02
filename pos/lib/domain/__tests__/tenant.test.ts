import { isPlatformHost, orgFromHost } from '@/lib/domain/tenant'

// Falla si el subdominio no se lee como la organización, si un nombre reservado o el dominio base se toman por una, o
// si una IP o localhost a secas no caen en la organización por omisión (plan T).
it('saca la organización del subdominio', () => {
  expect(orgFromHost('burger-house.waiter.projectapp.co')).toBe('burger-house')
  expect(orgFromHost('burger-house.localhost:3000')).toBe('burger-house')
  expect(orgFromHost('waiter.projectapp.co')).toBeNull()
  expect(orgFromHost('plataforma.waiter.projectapp.co', 'burger-house')).toBe('burger-house')
  expect(orgFromHost('192.168.56.10:3000', 'burger-house')).toBe('burger-house')
  expect(orgFromHost('localhost:3000')).toBeNull()
  expect(orgFromHost('Frisby.localhost:3000')).toBe('frisby')
  expect(orgFromHost('bad_slug.localhost:3000')).toBeNull()
  expect(isPlatformHost('plataforma.waiter.projectapp.co')).toBe(true)
  expect(isPlatformHost('burger-house.localhost:3000')).toBe(false)
})
