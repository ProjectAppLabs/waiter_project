import { addProduct, createDraft, removeLine, setQty, subtotal } from '@/lib/domain/order'
import type { Product } from '@/lib/types'

const angus: Product = { id: 3, templateId: 2, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [5], favorite: false, storable: false, soldOut: false, hasImage: false }
const draft = () => createDraft({ sessionId: 1, tableId: 6, guests: 2 })

// Falla si agregar el mismo producto dos veces crea dos líneas en vez de subir la cantidad.
it('adding the same product twice increments the existing line', () => {
  const o = addProduct(addProduct(draft(), angus), angus)
  expect(o.lines).toHaveLength(1)
  expect(o.lines[0].qty).toBe(2)
})

// Falla si el subtotal deja de multiplicar cantidad por precio unitario.
it('subtotal sums qty times unit price across lines', () => {
  expect(subtotal(draft())).toBe(0)
  const o = addProduct(draft(), angus)
  expect(subtotal(setQty(o, o.lines[0].uuid, 3))).toBe(110700)
})

// Falla si bajar la cantidad a cero deja una línea fantasma que el servidor rechaza.
it('setting qty to zero removes the line', () => {
  const o = addProduct(draft(), angus)
  expect(setQty(o, o.lines[0].uuid, 0).lines).toHaveLength(0)
})

// Falla si removeLine borra una línea distinta a la pedida.
it('removeLine drops only the targeted line', () => {
  const other: Product = { ...angus, id: 4, name: 'Papas' }
  const o = addProduct(addProduct(draft(), angus), other)
  expect(removeLine(o, o.lines[0].uuid).lines.map((l) => l.productId)).toEqual([4])
})
