import { contrastRatio, readableText } from '@/lib/domain/contrast'

// Plan D: los colores del mapa de domicilio. «marca» los saca de la plantilla (fondo, superficie, tinta y acento);
// «claro», «oscuro» y «gris» son estilos fijos. En todos, las etiquetas se leen con 4.5:1 sobre el terreno, las calles y
// su halo, y el pin se distingue con 3:1 del terreno, los parques, el agua y los edificios (WCAG para gráficos).
export type MapVariant = 'marca' | 'claro' | 'oscuro' | 'gris'
export const MAP_VARIANTS: readonly MapVariant[] = ['marca', 'claro', 'oscuro', 'gris']
export interface MapTokens { fondo: string; superficie: string; tinta: string; acento: string }
export interface MapPalette {
  base: 'light' | 'dark' | 'grayscale'
  earth: string; park: string; water: string; buildings: string; minor: string; major: string; highway: string; casing: string
  label: string; halo: string; place: string; pin: string; pinRing: string
}

const HEX = /^#[0-9a-f]{6}$/i
const hex = (value: string, fallback: string) => (HEX.test(value.trim()) ? value.trim().toUpperCase() : fallback)

// Mezcla `a` hacia `b` (t = 0 deja `a`, t = 1 da `b`).
export function mix(a: string, b: string, t: number): string {
  return '#' + [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16)
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
}
const isDark = (color: string) => contrastRatio(color, '#FFFFFF') > contrastRatio(color, '#000000')

// Un gráfico (el pin) necesita 3:1 contra todo lo que puede quedar detrás; se aclara u oscurece lo justo.
export function readableGraphic(preferred: string, backgrounds: string[]): string {
  const ok = (color: string) => backgrounds.every((b) => contrastRatio(color, b) >= 3)
  if (ok(preferred)) return preferred
  for (let step = 1; step <= 20; step++) {
    for (const target of ['#000000', '#FFFFFF']) {
      const candidate = mix(preferred, target, step / 20)
      if (ok(candidate)) return candidate
    }
  }
  return isDark(backgrounds[0] ?? '#FFFFFF') ? '#FFFFFF' : '#111111'
}

const FIXED: Record<Exclude<MapVariant, 'marca'>, Omit<MapPalette, 'label' | 'place' | 'pin' | 'pinRing'>> = {
  claro: { base: 'light', earth: '#F2EFE9', park: '#D3E6CF', water: '#AAD3E6', buildings: '#E2DDD5', minor: '#FFFFFF', major: '#FFFFFF', highway: '#FBE7B5', casing: '#D6D1C8', halo: '#F2EFE9' },
  oscuro: { base: 'dark', earth: '#1F2023', park: '#1F2C25', water: '#1E2B38', buildings: '#2A2B2F', minor: '#34363B', major: '#3E4046', highway: '#4A4C52', casing: '#17181A', halo: '#1F2023' },
  gris: { base: 'grayscale', earth: '#EDEDED', park: '#DDDDDD', water: '#CFCFCF', buildings: '#E0E0E0', minor: '#FFFFFF', major: '#FFFFFF', highway: '#F7F7F7', casing: '#C9C9C9', halo: '#EDEDED' },
}

export function mapPalette(variant: MapVariant, tokens: MapTokens): MapPalette {
  const fondo = hex(tokens.fondo, '#F8F8FA'), superficie = hex(tokens.superficie, '#FFFFFF')
  const tinta = hex(tokens.tinta, '#32324D'), acento = hex(tokens.acento, '#6755A0')
  let base: Omit<MapPalette, 'label' | 'place' | 'pin' | 'pinRing'>
  if (variant === 'marca') {
    // El mapa vive en una hoja o tarjeta: el terreno parte de la superficie con un toque del fondo de la marca;
    // parques, agua y vías mayores llevan un toque del acento.
    const dark = isDark(superficie)
    const earth = dark ? mix(superficie, '#FFFFFF', .04) : mix(superficie, fondo, .05)
    base = {
      base: dark ? 'dark' : 'light', earth,
      park: mix(mix(dark ? '#24372B' : '#CFE5CC', acento, .12), earth, .15),
      water: mix(mix(dark ? '#1C2E3E' : '#A9D2E8', acento, .08), earth, .1),
      buildings: mix(earth, tinta, dark ? .1 : .08),
      minor: dark ? mix(earth, '#FFFFFF', .1) : superficie,
      major: dark ? mix(earth, acento, .28) : mix(superficie, acento, .14),
      highway: dark ? mix(earth, acento, .42) : mix(superficie, acento, .26),
      casing: mix(earth, tinta, dark ? .35 : .16),
      halo: earth,
    }
  } else {
    base = FIXED[variant]
  }
  const surfaces = [base.earth, base.halo, base.minor, base.major, base.highway, base.park, base.buildings]
  const fallbackInk = base.base === 'dark' ? '#F2F2F2' : '#1A1815'
  const preferred = variant === 'marca' ? tinta : base.base === 'dark' ? '#C8C8C8' : '#5A5550'
  const pinPreferred = variant === 'gris' ? (isDark(acento) ? acento : '#111111') : acento
  const pin = readableGraphic(pinPreferred, [base.earth, base.park, base.water, base.buildings, base.minor])
  return {
    ...base,
    label: readableText(preferred, surfaces, fallbackInk),
    place: readableText(variant === 'marca' ? tinta : fallbackInk, [base.earth, base.halo, base.park], fallbackInk),
    pin,
    pinRing: isDark(pin) ? '#FFFFFF' : '#1A1815',
  }
}

// Los colores del estilo de Protomaps que cambian; el resto se queda con el estilo base de la variante.
export function flavorOverrides(p: MapPalette): Record<string, string> {
  const roads: Record<string, string> = {}
  for (const k of ['other', 'minor_service', 'minor_a', 'minor_b', 'pier', 'pedestrian', 'bridges_other', 'bridges_minor', 'tunnel_other', 'tunnel_minor']) roads[k] = p.minor
  for (const k of ['link', 'major', 'bridges_link', 'bridges_major', 'tunnel_link', 'tunnel_major']) roads[k] = p.major
  for (const k of ['highway', 'bridges_highway', 'tunnel_highway']) roads[k] = p.highway
  for (const k of ['minor_service_casing', 'minor_casing', 'link_casing', 'major_casing_late', 'highway_casing_late', 'major_casing_early', 'highway_casing_early',
    'bridges_other_casing', 'bridges_minor_casing', 'bridges_link_casing', 'bridges_major_casing', 'bridges_highway_casing',
    'tunnel_other_casing', 'tunnel_minor_casing', 'tunnel_link_casing', 'tunnel_major_casing', 'tunnel_highway_casing']) roads[k] = p.casing
  return {
    background: p.earth, earth: p.earth, park_a: p.park, park_b: p.park, wood_a: p.park, wood_b: p.park, scrub_a: p.park, scrub_b: p.park,
    zoo: p.park, water: p.water, buildings: p.buildings, school: mix(p.earth, p.buildings, .5), hospital: mix(p.earth, p.buildings, .5),
    industrial: mix(p.earth, p.buildings, .5), ...roads,
    roads_label_minor: p.label, roads_label_major: p.label, address_label: p.label,
    roads_label_minor_halo: p.halo, roads_label_major_halo: p.halo, address_label_halo: p.halo,
    subplace_label: p.place, city_label: p.place, subplace_label_halo: p.halo, city_label_halo: p.halo,
  }
}

// Lugares de interés que ayudan a ubicarse. Nunca restaurantes, cafés ni bares: el mapa no le muestra la competencia.
export const HIDDEN_POIS = ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court', 'ice_cream', 'bakery', 'biergarten', 'nightclub', 'confectionery', 'deli']
