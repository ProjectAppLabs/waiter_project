import { render, screen, waitFor, within } from '@testing-library/react'
import OrganizationLanding from '../[rest]/page'
import { getEntry, getOrganization } from '@/lib/services/api'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useParams: () => ({ rest: 'burger-house' }), useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/services/api', () => ({ getOrganization: jest.fn(), getEntry: jest.fn().mockRejectedValue(new Error('sin tema')) }))
afterEach(() => jest.clearAllMocks())

// Falla si la portada de una organización con un solo restaurante no lleva directo a su menú (plan O).
it('con un solo restaurante lleva a su menú', async () => {
  jest.mocked(getOrganization).mockResolvedValue({ organizacion: { slug: 'burger-house', nombre: 'Burger House' }, restaurantes: [{ slug: 'poblado', nombre: 'Poblado' }] })
  render(<OrganizationLanding />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/burger-house/poblado/'))
  expect(getEntry).not.toHaveBeenCalled()
})

// Falla si con varios restaurantes la portada no deja elegir a cuál entrar o enlaza mal su menú.
it('con varios restaurantes deja elegir', async () => {
  jest.mocked(getOrganization).mockResolvedValue({ organizacion: { slug: 'burger-house', nombre: 'Burger House' },
    restaurantes: [{ slug: 'poblado', nombre: 'Poblado', direccion: 'Calle 10' }, { slug: 'laureles', nombre: 'Laureles' }] })
  render(<OrganizationLanding />)
  const list = await screen.findByRole('navigation', { name: 'Restaurantes' })
  expect(within(list).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['PobladoCalle 10', '/burger-house/poblado/'], ['Laureles', '/burger-house/laureles/']])
  expect(replace).not.toHaveBeenCalled()
})
