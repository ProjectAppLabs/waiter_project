import { contrastRatio } from '@/lib/domain/contrast'
import { flavorOverrides, HIDDEN_POIS, MAP_VARIANTS, mapPalette, mix, readableGraphic, referenceColors, referenceLayer, REFERENCE_GROUPS, type MapTokens } from '@/lib/domain/mapTheme'

const MARCAS: Record<string, MapTokens> = {
  burger: { fondo: '#F9F3EB', superficie: '#FFFFFF', tinta: '#1A1815', acento: '#C1873A' },
  amarillo: { fondo: '#FFFFFF', superficie: '#FFFFFF', tinta: '#32324D', acento: '#FFE14D' },
  oscura: { fondo: '#141418', superficie: '#202026', tinta: '#F2F2F2', acento: '#1D2A6B' },
  violeta: { fondo: '#F8F8FA', superficie: '#FFFFFF', tinta: '#32324D', acento: '#6755A0' },
  invalida: { fondo: 'rojo', superficie: '', tinta: '#12', acento: 'azul' },
}

// Falla si en alguna marca o variante las etiquetas de calles, barrios o puntos de referencia no se leen (4.5:1 sobre
// terreno, halo, calles, parques y edificios) o el pin no se distingue (3:1 sobre terreno, parques, agua, edificios y calles).
it.each(Object.entries(MARCAS).flatMap(([marca, tokens]) => MAP_VARIANTS.map((v) => [marca, v, tokens] as const)))('%s · %s se lee y el pin se distingue', (_, variante, tokens) => {
  const p = mapPalette(variante, tokens)
  for (const fondo of [p.earth, p.halo, p.minor, p.major, p.highway, p.park, p.buildings]) expect(contrastRatio(p.label, fondo)).toBeGreaterThanOrEqual(4.5)
  for (const fondo of [p.earth, p.halo, p.park]) expect(contrastRatio(p.place, fondo)).toBeGreaterThanOrEqual(4.5)
  for (const fondo of [p.earth, p.park, p.water, p.buildings, p.minor]) expect(contrastRatio(p.pin, fondo)).toBeGreaterThanOrEqual(3)
  expect(contrastRatio(p.pin, p.pinRing)).toBeGreaterThanOrEqual(3)
  for (const color of Object.values(referenceColors(p))) {
    for (const fondo of [p.earth, p.halo, p.park, p.buildings, p.minor, p.major, p.water]) expect(contrastRatio(color, fondo)).toBeGreaterThanOrEqual(4.5)
  }
})

// Falla si «marca» no toma los colores de la plantilla (terreno de la superficie donde vive el mapa, pin del acento
// cuando ya contrasta) o si una marca de superficie oscura recibe un mapa claro.
it('la variante marca sale de la plantilla', () => {
  const burger = mapPalette('marca', MARCAS.burger)
  expect(burger.base).toBe('light')
  expect(burger.earth).toBe(mix('#FFFFFF', '#F9F3EB', .05))
  expect(burger.pin).not.toBe('#111111')
  expect(mapPalette('marca', MARCAS.oscura).base).toBe('dark')
  expect(mapPalette('claro', MARCAS.oscura).base).toBe('light')
})

// Falla si el estilo deja colores de Protomaps sin cambiar en lo que el cliente lee (etiquetas y halos) o en el terreno.
it('aplica la paleta a las capas del mapa', () => {
  const p = mapPalette('marca', MARCAS.violeta)
  const o = flavorOverrides(p)
  expect(o.earth).toBe(p.earth)
  expect([o.roads_label_minor, o.roads_label_major, o.address_label]).toEqual([p.label, p.label, p.label])
  expect([o.roads_label_minor_halo, o.city_label_halo]).toEqual([p.halo, p.halo])
  expect(o.minor_a).toBe(p.minor)
  expect(readableGraphic('#FFE14D', ['#FFFFFF'])).not.toBe('#FFE14D')
})


// Falla si el mapa deja de mostrar puntos de referencia útiles (droguerías, supermercados, bancos, iglesias), si muestra
// la competencia o lugares inapropiados, o si los grupos no llevan su propio color.
it('muestra puntos de referencia y nunca la competencia', () => {
  const p = mapPalette('marca', MARCAS.burger)
  const layer = referenceLayer({ id: 'pois', filter: ['all'], paint: { 'text-color': '#000000' } }, p)
  const kinds = (layer.filter as unknown[][])[1][2] as [string, string[]]
  for (const k of ['pharmacy', 'supermarket', 'bank', 'place_of_worship', 'fuel', 'hospital', 'mall']) expect(kinds[1]).toContain(k)
  for (const k of ['restaurant', 'fast_food', 'cafe', 'bar', 'erotic']) expect(kinds[1]).not.toContain(k)
  expect(HIDDEN_POIS).toContain('restaurant')
  const colors = referenceColors(p)
  expect(new Set(Object.values(colors)).size).toBe(Object.keys(REFERENCE_GROUPS).length)
  expect((layer.paint as Record<string, unknown>)['text-halo-color']).toBe(p.halo)
})
