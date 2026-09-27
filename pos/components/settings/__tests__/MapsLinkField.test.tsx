import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { MapsLinkField } from '@/components/settings/MapsLinkField'
import { messages } from '@/lib/i18n/messages'

const wrap = (onChange = jest.fn(), initial: { lat: number; lng: number } | null = null) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><MapsLinkField initial={initial} onChange={onChange} /></NextIntlClientProvider>)
const paste = (value: string) => fireEvent.change(screen.getByLabelText('Enlace de Google Maps'), { target: { value } })
const realFetch = global.fetch
afterEach(() => { global.fetch = realFetch })

// Falla si un enlace largo no entrega sus coordenadas al formulario o no deja comprobarlas en el mapa.
it('takes the point from a long link and lets you check it on the map', () => {
  const onChange = jest.fn()
  wrap(onChange)
  paste('https://www.google.com/maps/place/X/@6.21,-75.57,17z/data=!3d6.2088!4d-75.5675')
  expect(onChange).toHaveBeenLastCalledWith({ lat: 6.2088, lng: -75.5675 }, 'found')
  expect(screen.getByText('Ubicación: 6.20880, -75.56750')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver en el mapa' })).toHaveAttribute('href', 'https://www.google.com/maps?q=6.2088,-75.5675')
})

// Falla si el enlace corto no se manda a resolver al servidor, o si un enlace que no es de Maps pasa como válido.
it('resolves short links on the server and rejects other links', async () => {
  const onChange = jest.fn()
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ lat: 4.6097, lng: -74.0817, name: 'Burger House' }) }) as Response)
  wrap(onChange)
  paste('https://maps.app.goo.gl/AbC123')
  expect(screen.getByText('Buscando la ubicación del enlace…')).toBeInTheDocument()
  expect(await screen.findByText('Ubicación: 4.60970, -74.08170')).toBeInTheDocument()
  expect(screen.getByText('Burger House ·')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/mapas/resolver?url=https%3A%2F%2Fmaps.app.goo.gl%2FAbC123')
  paste('https://example.com/lugar')
  expect(screen.getByRole('alert')).toHaveTextContent('Pega un enlace de Google Maps')
  expect(onChange).toHaveBeenLastCalledWith(null, 'invalid')
})

// Falla si al abrir el formulario las coordenadas guardadas no aparecen como enlace, o si vaciar el campo no las borra.
it('shows the saved point as a link and clears it when emptied', () => {
  const onChange = jest.fn()
  wrap(onChange, { lat: 6.2, lng: -75.5 })
  expect(screen.getByLabelText('Enlace de Google Maps')).toHaveValue('https://www.google.com/maps?q=6.2,-75.5')
  paste('')
  expect(onChange).toHaveBeenLastCalledWith(null, 'empty')
})
