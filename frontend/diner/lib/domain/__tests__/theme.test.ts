import { formatCop, itemCount, recommended } from '@/lib/domain/cart'
import { greetingFor, themeVars } from '@/lib/domain/theme'

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F2EAEA', fuente: 'Fraunces', radio: 24 }

// Falla si el tema del restaurante no llega a las seis variables o si el saludo ignora la hora / el texto propio.
it('maps the brand to css variables and greets by hour unless the restaurant set a greeting', () => {
  expect(themeVars(brand)).toEqual({ '--r-brand': '#7A2E2A', '--r-brand-ink': '#FFFFFF', '--r-brand-soft': '#F2EAEA', '--r-display': "'Fraunces'", '--r-radius': '24px' })
  expect([greetingFor(9, ''), greetingFor(15, ''), greetingFor(21, ''), greetingFor(21, 'Hola, vecino')]).toEqual(['Buenos días', 'Buenas tardes', 'Buenas noches', 'Hola, vecino'])
})

// Falla si "recomendado" muestra agotados o si el conteo de la barra suma líneas en vez de cantidades.
it('recommends live favourites first and counts items by quantity', () => {
  const dishes = [{ id: 1, agotado: true, favorito: true }, { id: 2, agotado: false }, { id: 3, agotado: false, favorito: true }]
  expect(recommended(dishes).map((d) => d.id)).toEqual([3, 2])
  expect(itemCount({ sesion: 's', lineas: [{ cantidad: 2 } as never, { cantidad: 1 } as never], total: 0, mio: 0, por_comensal: [] })).toBe(3)
  expect(formatCop(48800)).toBe('48.800')
})
