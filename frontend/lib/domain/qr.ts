// Codificador QR mínimo (modo bytes, corrección L, versiones 1 a 5 = hasta 106 bytes) para el pago QR simulado del kit.
// Sin dependencias ni servicios externos: el SVG se genera en el navegador. Sigue ISO/IEC 18004 (patrones, RS, máscaras).
const DATA_CW = [0, 19, 34, 55, 80, 108]
const EC_CW = [0, 7, 10, 15, 20, 26]
const ALIGN = [0, 0, 18, 22, 26, 30]
const PAD = [0xec, 0x11]

// GF(256) con el polinomio 0x11d del estándar.
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function rsRemainder(data: number[], degree: number): number[] {
  let gen = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    gen.forEach((g, j) => { next[j] ^= mul(g, EXP[i]); next[j + 1] ^= g })
    gen = next
  }
  const rem = new Array<number>(degree).fill(0)
  for (const b of data) {
    const factor = b ^ rem[0]
    rem.shift(); rem.push(0)
    gen.slice(1).forEach((g, j) => { rem[j] ^= mul(g, factor) })
  }
  return rem
}

export function utf8Bytes(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

function codewords(bytes: number[], version: number): number[] {
  const bits: number[] = []
  const push = (value: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1) }
  push(4, 4); push(bytes.length, 8); bytes.forEach((b) => push(b, 8))
  const capacity = DATA_CW[version] * 8
  push(0, Math.min(4, capacity - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let i = 0; data.length < DATA_CW[version]; i++) data.push(PAD[i % 2])
  return [...data, ...rsRemainder(data, EC_CW[version])]
}

type Grid = boolean[][]
const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function formatBits(mask: number): number {
  const data = (1 << 3) | mask // nivel L = 01
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

function penalty(m: Grid): number {
  const n = m.length
  let score = 0
  const runs = (line: boolean[]) => {
    let run = 1
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) run++
      else { if (run >= 5) score += run - 2; run = 1 }
    }
    const s = line.map((b) => (b ? '1' : '0')).join('')
    score += 40 * ((s.match(/00001011101/g)?.length ?? 0) + (s.match(/10111010000/g)?.length ?? 0))
  }
  for (let i = 0; i < n; i++) { runs(m[i]); runs(m.map((row) => row[i])) }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3
  const dark = m.flat().filter(Boolean).length
  score += 10 * (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1)
  return score
}

// Matriz de módulos (true = oscuro). Lanza si el texto no cabe en la versión 5.
export function qrMatrix(text: string): Grid {
  const bytes = utf8Bytes(text)
  const version = [1, 2, 3, 4, 5].find((v) => DATA_CW[v] - 2 >= bytes.length)
  if (!version) throw new Error('QR: texto demasiado largo')
  const size = 17 + 4 * version
  const grid: Grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fixed: Grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) { grid[y][x] = dark; fixed[y][x] = true } }
  const finder = (cx: number, cy: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4) } }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  for (let i = 0; i < size; i++) { if (!fixed[6][i]) set(i, 6, i % 2 === 0); if (!fixed[i][6]) set(6, i, i % 2 === 0) }
  if (version >= 2) { const c = ALIGN[version]; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1) }
  const drawFormat = (mask: number) => {
    const bits = formatBits(mask)
    const bit = (i: number) => ((bits >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  const data = codewords(bytes, version)
  const cells: [number, number][] = []
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
      if (!fixed[y][x]) cells.push([x, y])
    }
  }
  cells.forEach(([x, y], i) => { grid[y][x] = i < data.length * 8 ? ((data[i >> 3] >> (7 - (i & 7))) & 1) === 1 : false })
  const base = grid.map((row) => [...row])
  let best: { mask: number; score: number; grid: Grid } | null = null
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row) => [...row])
    cells.forEach(([x, y]) => { if (MASKS[mask](x, y)) candidate[y][x] = !candidate[y][x] })
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid[y][x] = candidate[y][x]
    drawFormat(mask)
    const score = penalty(grid)
    if (!best || score < best.score) best = { mask, score, grid: grid.map((row) => [...row]) }
  }
  return best!.grid
}

// SVG cuadrado con margen de un módulo; el color lo hereda de currentColor (claro y oscuro salen solos).
export function qrSvg(text: string): string {
  const m = qrMatrix(text)
  const n = m.length + 2
  const path = m.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + 1} ${y + 1}h1v1h-1z`] : []))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"><path d="${path}" fill="currentColor"/></svg>`
}
