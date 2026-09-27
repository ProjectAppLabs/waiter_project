import { fireEvent, render, screen } from '@testing-library/react'
import { DishGallery } from '../SmartMenu'
import type { Dish } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
const dish = (fotos?: string[]): Dish => ({ id: 41, nombre: 'Hamburguesa Clásica', precio: 32000, agotado: false, categorias: [3], foto: '/api/v1/r/s/fotos/41/?v=1', ...(fotos ? { fotos } : {}) })

// Falla si un plato con una sola foto deja de verse como antes (sin carrusel ni puntos).
it('con una sola foto dibuja la foto de siempre', () => {
  const { container } = render(<DishGallery dish={dish()} />)
  expect(container.querySelector('.sm-dish-gallery')).toBeNull()
  expect(container.querySelector('.sm-dish-photo img')).toHaveAttribute('src', '/api/v1/r/s/fotos/41/?v=1')
})

// Falla si la galería no muestra la principal más las de galería (máximo 5), si pierde los textos alternativos o si los
// puntos no dicen qué foto es ni llevan a ella.
it('muestra hasta cinco fotos en carrusel con puntos accesibles', () => {
  const extra = [1, 2, 3, 4, 5].map((n) => `/api/v1/r/s/fotos/41/galeria/${n}/?v=1`)
  const { container } = render(<DishGallery dish={dish(extra)} />)
  const images = container.querySelectorAll('.sm-dish-gallery-rail img')
  expect(images).toHaveLength(5)
  expect(images[0]).toHaveAttribute('alt', 'Hamburguesa Clásica')
  expect(images[1]).toHaveAttribute('alt', 'Hamburguesa Clásica, foto 2')
  expect(screen.getByRole('region', { name: 'Fotos de Hamburguesa Clásica' })).toHaveClass('sm-dish-photo')
  const dots = screen.getAllByRole('button', { name: /Foto \d de 5/ })
  expect(dots).toHaveLength(5)
  expect(dots[0]).toHaveAttribute('aria-current', 'true')
  const rail = container.querySelector('.sm-dish-gallery-rail') as HTMLDivElement
  rail.scrollTo = jest.fn()
  fireEvent.click(dots[2])
  expect(rail.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
})
