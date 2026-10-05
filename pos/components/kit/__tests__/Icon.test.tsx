import { render } from '@testing-library/react'

import { Icon, KIT_ICON_NAMES } from '@/components/kit/Icon'

// Falla si un icono del kit deja de resolver a un SVG de Tabler o pierde el tamaño por defecto (20).
it('renders a decorative svg at 20px by default', () => {
  const { container } = render(<Icon name="bell" />)
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('aria-hidden', 'true')
  expect(svg).toHaveAttribute('width', '20')
})

// Falla si un icono con etiqueta deja de ser accesible.
it('exposes a label as an accessible image when given', () => {
  const { getByRole } = render(<Icon name="search" label="Buscar" />)
  expect(getByRole('img', { name: 'Buscar' })).toBeInTheDocument()
})

// Falla si algún nombre de la lista de iconos del kit no tiene su SVG y la pantalla muestra un hueco.
it('every kit icon name resolves', () => {
  for (const name of KIT_ICON_NAMES) expect(render(<Icon name={name} />).container.querySelector('svg')).not.toBeNull()
})
