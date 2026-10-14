import { FONTS, RADII, contrast, greetingFor, inkFor, isHex, linkContrast, linkReadable, meetsContrast, softFor, theme } from '@/lib/domain/brand'
import vectors from './brand-vectors.json'

// brand-vectors.json se genera EJECUTANDO la implementación Python del registro, que es la fuente de verdad del tema:
//   registry/venv/bin/python -c "import sys, json; sys.path.insert(0, 'registry'); from registry_app.utils.brand import theme; ..."
// y lo comparten este espejo y el test de paridad de experience/. Si alguien cambia brand.py (umbral de luminancia,
// mezcla, redondeo) sin regenerarlo, alguno de los dos lados falla.
interface Vector { color: string; font: string; radius: number; theme: { color: string; colorTexto: string; colorSuave: string; fuente: string; radio: number; contraste: number } }
const PYTHON_THEMES: Vector[] = vectors.vectors

// Los 256 valores de canal mezclados al 10 % sobre blanco, de la misma implementación Python:
//   python3 -c "print(''.join('%02X' % round(255 - (255 - c) * 0.10) for c in range(256)))"
// Trece de ellos caen en mitad exacta y Python los manda al par; Math.round los subiría. Esta tabla lo detecta.
const PYTHON_MIX = 'E6E6E6E6E6E6E6E6E6E6E6E7E7E7E7E7E7E7E7E7E8E8E8E8E8E8E8E8E8E8E8E9E9E9E9E9E9E9E9E9EAEAEAEAEAEAEAEAEAEAEAEBEBEBEBEBEBEBEBEBECECECECECECECECECECECEDEDEDEDEDEDEDEDEDEEEEEEEEEEEEEEEEEEEEEEEFEFEFEFEFEFEFEFEFF0F0F0F0F0F0F0F0F0F0F0F1F1F1F1F1F1F1F1F1F2F2F2F2F2F2F2F2F2F2F2F3F3F3F3F3F3F3F3F3F4F4F4F4F4F4F4F4F4F4F4F5F5F5F5F5F5F5F5F5F6F6F6F6F6F6F6F6F6F6F6F7F7F7F7F7F7F7F7F7F8F8F8F8F8F8F8F8F8F8F8F9F9F9F9F9F9F9F9F9FAFAFAFAFAFAFAFAFAFAFAFBFBFBFBFBFBFBFBFBFCFCFCFCFCFCFCFCFCFCFCFDFDFDFDFDFDFDFDFDFEFEFEFEFEFEFEFEFEFEFEFFFFFFFFFF'

// Falla si el tema del POS se separa del que calcula el registro para el comensal (color, tinta, suave, fuente, radio o contraste).
it('derives the same theme as registry_app.utils.brand for the shared vectors', () => {
  expect(PYTHON_THEMES.length).toBeGreaterThanOrEqual(8)
  expect(PYTHON_THEMES.map((v) => v.color)).toEqual(expect.arrayContaining(['#C1873A', '#7A2E2A', '#1A1815', '#FFFFFF', '#808080', '#2F7A4F', '#F2C94C', '#3B5BDB']))
  for (const v of PYTHON_THEMES) expect(theme(v.color, v.font, v.radius)).toEqual(v.theme)
})

// Falla si el redondeo del canal deja de ser el de Python (mitad al par) o cambia la mezcla del 10 %.
it('mixes every channel value exactly like Python round()', () => {
  const grey = (c: number) => `#${c.toString(16).padStart(2, '0').repeat(3)}`
  const mixed = Array.from({ length: 256 }, (_, c) => softFor(grey(c)).slice(1, 3)).join('')
  expect(mixed).toBe(PYTHON_MIX)
})

// Falla si cambia el umbral de 4.5 o la elección blanco/tinta: #808080 queda justo por debajo con ambas tintas.
it('accepts colors at or above 4.5:1 with their chosen ink and rejects the rest', () => {
  expect(meetsContrast('#7A2E2A')).toBe(true)
  expect(meetsContrast('#C1873A')).toBe(true)
  expect(meetsContrast('#808080')).toBe(false)
  expect(inkFor('#808080')).toBe('#1A1815')
  expect(contrast('#FFFFFF', '#1A1815')).toBeCloseTo(17.7155, 4)
  expect(contrast('#1A1815', '#FFFFFF')).toBe(contrast('#FFFFFF', '#1A1815'))
})

// Falla si la lectura "como texto sobre el fondo claro" deja de medirse contra el crema del comensal (#FDFBF7) o si
// un color claro que sí pasa con su tinta (#F2C94C, 11.16:1) no se marca como tenue para enlaces.
it('measures the color as link text on the cream background without blocking', () => {
  expect(linkContrast('#F2C94C')).toBeCloseTo(1.54, 2)
  expect(linkContrast('#C1873A')).toBeCloseTo(2.99, 2)
  expect(linkContrast('#7A2E2A')).toBeCloseTo(9.02, 2)
  expect(linkReadable('#F2C94C')).toBe(false)
  expect(linkReadable('#2F7A4F')).toBe(true)
  expect(meetsContrast('#F2C94C')).toBe(true)
})

// Falla si el saludo por hora deja de coincidir con diner/lib/domain/theme.ts (cortes a las 12 y a las 19) o si un
// saludo propio, aunque tenga espacios alrededor, no gana a la hora.
it('greets by hour like the diner when the greeting is empty', () => {
  expect(greetingFor(0, '')).toBe('Buenos días')
  expect(greetingFor(11, '  ')).toBe('Buenos días')
  expect(greetingFor(12, '')).toBe('Buenas tardes')
  expect(greetingFor(18, '')).toBe('Buenas tardes')
  expect(greetingFor(19, '')).toBe('Buenas noches')
  expect(greetingFor(23, '')).toBe('Buenas noches')
  expect(greetingFor(9, ' Hola ')).toBe(' Hola ')
})

// Falla si un valor vacío o desconocido no cae en el mismo valor por defecto que el registro (#C1873A, Instrument Serif, 14).
it('falls back like the registry for empty or unknown inputs and normalizes case', () => {
  expect(theme('', 'nope', 99)).toEqual({ color: '#C1873A', colorTexto: '#1A1815', colorSuave: '#F9F3EB', fuente: 'Instrument Serif', radio: 14, contraste: 5.73 })
  expect(theme('#c1873a', 'Lora', 4)).toMatchObject({ color: '#C1873A', radio: 4 })
  expect(isHex('#7a2e2a')).toBe(true)
  expect(isHex('7A2E2A')).toBe(false)
  expect(isHex('#7A2E2')).toBe(false)
  expect(FONTS).toHaveLength(6)
  expect(RADII).toEqual([4, 14, 24])
})
