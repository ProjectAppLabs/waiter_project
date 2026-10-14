import { coordinatesFromMapsUrl, isGoogleMapsUrl, isShortMapsUrl, mapsUrlFor, placeIdFromMapsUrl } from '@/lib/domain/mapsLink'

// Falla si del enlace de un lugar se toma la cámara (@) y no el punto del local (!3d/!4d), o si un formato común de
// Google Maps deja de leerse.
it('reads the place point from the usual Google Maps links', () => {
  const place = 'https://www.google.com/maps/place/Parque+Lleras/@6.2101,-75.5700,17z/data=!3m1!4b1!4m6!3m5!1s0x8e4428:0x5c!8m2!3d6.2088!4d-75.5675!16s'
  expect(coordinatesFromMapsUrl(place)).toEqual({ lat: 6.2088, lng: -75.5675 })
  expect(coordinatesFromMapsUrl('https://maps.google.com/?q=6.2442,-75.5812')).toEqual({ lat: 6.2442, lng: -75.5812 })
  expect(coordinatesFromMapsUrl('https://www.google.com/maps/search/?api=1&query=4.6097%2C-74.0817')).toEqual({ lat: 4.6097, lng: -74.0817 })
  expect(coordinatesFromMapsUrl('https://www.google.com/maps/@3.4516,-76.5320,15z')).toEqual({ lat: 3.4516, lng: -76.532 })
})

// Falla si un enlace sin punto, con coordenadas imposibles o en (0, 0) se toma como ubicación del restaurante.
it('returns nothing for links without a real point', () => {
  expect(coordinatesFromMapsUrl('https://maps.google.com/?q=Burger+House&ftid=0x8e44:0x5c')).toBeNull()
  expect(coordinatesFromMapsUrl('https://www.google.com/maps?q=95,10')).toBeNull()
  expect(coordinatesFromMapsUrl('https://www.google.com/maps?q=0,0')).toBeNull()
})

// Falla si el servidor aceptara seguir enlaces que no son de Google Maps (sería un proxy hacia cualquier dirección).
it('accepts only Google Maps domains', () => {
  for (const ok of ['https://maps.app.goo.gl/AbC123', 'https://goo.gl/maps/xyz', 'https://www.google.com/maps/place/x', 'https://www.google.com.co/maps?q=1,2', 'https://maps.google.com/?q=x'])
    expect(isGoogleMapsUrl(ok)).toBe(true)
  for (const bad of ['https://evil.com/maps', 'https://google.com.evil.com/maps', 'https://goo.gl/other', 'https://www.google.com/search?q=x', 'ftp://maps.google.com', 'no es un enlace'])
    expect(isGoogleMapsUrl(bad)).toBe(false)
  expect(isShortMapsUrl('https://maps.app.goo.gl/AbC123')).toBe(true)
  expect(mapsUrlFor({ lat: 6.2, lng: -75.5 })).toBe('https://www.google.com/maps?q=6.2,-75.5')
})

// Falla si no se reconoce el identificador del lugar de un enlace compartido desde el teléfono, o si se deja pasar algo
// más pegado a él (es lo único que el servidor le reenvía a Google Maps).
it('extracts only a well-formed place id', () => {
  expect(placeIdFromMapsUrl('https://www.google.com/maps?q=Pato+Pek%C3%ADn&ftid=0x8e44298f71698167:0xaec317a62bba82e9&entry=gps')).toBe('0x8e44298f71698167:0xaec317a62bba82e9')
  expect(placeIdFromMapsUrl('https://www.google.com/maps?q=x&ftid=0x1:0x2!9m1!1sinyectado')).toBeNull()
  expect(placeIdFromMapsUrl('https://www.google.com/maps?q=6.2,-75.5')).toBeNull()
})
