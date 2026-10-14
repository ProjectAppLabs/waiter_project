import { qrMatrix, qrSvg, utf8Bytes } from '@/lib/domain/qr'

// Falla si el QR pierde los patrones de posición, el módulo oscuro fijo o el tamaño de su versión.
it('builds a version 1 symbol with finder patterns and the fixed dark module', () => {
  const m = qrMatrix('waiter://pago/1')
  expect(m).toHaveLength(21)
  const finder = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6].every((i) => m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]) && m[y + 3][x + 3]
  expect(finder(0, 0) && finder(14, 0) && finder(0, 14)).toBe(true)
  expect(m[13][8]).toBe(true)
  expect(m[7][7]).toBe(false)
})

// Falla si textos más largos no suben de versión o si se acepta más de lo que cabe.
it('grows to bigger versions and refuses text beyond version 5', () => {
  expect(qrMatrix('x'.repeat(40))).toHaveLength(29)
  expect(qrMatrix('x'.repeat(106))).toHaveLength(37)
  expect(() => qrMatrix('x'.repeat(107))).toThrow()
  expect(utf8Bytes('ñ')).toEqual([0xc3, 0xb1])
})

// Falla si el SVG deja de ser determinista o de heredar el color (currentColor) para el modo oscuro.
it('renders a deterministic svg path in currentColor', () => {
  const a = qrSvg('waiter://pago/7?total=241550')
  expect(a).toBe(qrSvg('waiter://pago/7?total=241550'))
  expect(a).toContain('fill="currentColor"')
  expect(a).toContain('viewBox="0 0 27 27"')
})
