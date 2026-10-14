/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { DishCard } from '@/components/ui/DishCard'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const base = { id: 3, nombre: 'Hamburguesa Angus', precio: 43911, agotado: false, categorias: [2], foto: '/api/v1/x/y/fotos/3/?v=1' }

// Falla si un plato agotado con foto no atenúa la foto ni muestra la insignia encima (espec. de imágenes: 55 % + insignia).
test('a sold-out dish keeps its photo at 55% with the badge on top and no add button', () => {
  wrap(<DishCard dish={{ ...base, agotado: true }} onOpen={() => {}} onAdd={() => {}} />)
  expect(screen.getByRole('presentation')).toHaveClass('opacity-55')
  expect(screen.getByTestId('sold-out-badge')).toHaveTextContent('Agotado')
  expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
})

// Falla si un plato disponible sale atenuado, con la insignia de agotado o sin el botón de agregar.
test('an available dish shows the photo at full opacity and the add button', () => {
  wrap(<DishCard dish={base} onOpen={() => {}} onAdd={() => {}} />)
  expect(screen.getByRole('presentation')).not.toHaveClass('opacity-55')
  expect(screen.queryByTestId('sold-out-badge')).toBeNull()
  expect(screen.getByRole('button', { name: /Agregar/ })).toBeInTheDocument()
})
