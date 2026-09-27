import { artSize, artTransform, DECOR_ASSETS, DECOR_INFO, rotateDecor, type Decor } from '@/lib/domain/decor'
import { extent, normalizePlan, type FloorDocument } from '@/lib/domain/floorPlan'

const stairs: Decor = { id: 's', asset: 'stairs', rotation: 0, x: 0, y: 0, width: 100, height: 200 }

// Falla si girar no intercambia la caja o se sale de las cuatro orientaciones, o si el dibujo girado no llena su caja.
it('rotates a piece a quarter turn at a time and keeps the drawing inside its box', () => {
  let piece = stairs
  const seen: number[] = []
  for (let i = 0; i < 4; i++) { piece = { ...piece, ...rotateDecor(piece) }; seen.push(piece.rotation) }
  expect(seen).toEqual([90, 180, 270, 0])
  const turned = { ...stairs, ...rotateDecor(stairs) }
  expect([turned.width, turned.height]).toEqual([200, 100])
  expect(artSize(turned)).toEqual({ width: 100, height: 200 })
  expect(artTransform(turned)).toBe('translate(200 0) rotate(90)')
  expect(artTransform(stairs)).toBeUndefined()
})

// Falla si una pieza queda fuera del encuadre o del corrimiento de origen al guardar (se vería cortada o descolocada).
it('frames and shifts decor pieces like the rest of the plan', () => {
  const plan: FloorDocument = { id: 1, name: 'Sala', revision: 0, tables: [], walls: [], zones: [], decor: [{ ...stairs, x: -40, y: 1500 }] }
  expect(extent(plan).height).toBeGreaterThan(1700)
  expect(normalizePlan(plan).decor?.[0]).toMatchObject({ x: 0, y: 1500 })
})

// Falla si una pieza de la galería no tiene nombre o tamaño en celdas enteras (caería fuera de la cuadrícula).
it('gives every gallery piece a name and a size on the grid', () => {
  for (const asset of DECOR_ASSETS) {
    const info = DECOR_INFO[asset]
    expect(info.label).toBeTruthy()
    expect(info.width % 20 + info.height % 20).toBe(0)
  }
})
