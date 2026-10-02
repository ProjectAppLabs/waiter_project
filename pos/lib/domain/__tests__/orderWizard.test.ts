import { addLine, cartTotals, customerInfoValid, DEFAULT_INFO, displayReference, fullProductName, newLine, orderNote, selectionComplete, stepsFor, toggleChoice, toKitPayload, type OptionChoice, type OptionGroup, type TaxRate } from '@/lib/domain/orderWizard'
import type { Product } from '@/lib/types'

const angus: Product = { id: 3, templateId: 3, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: true, storable: false, soldOut: false, hasImage: true }
const iva: TaxRate = { id: 55, name: '19%', amount: 19, amountType: 'percent', priceInclude: false }
const bbq: OptionChoice = { id: 2, name: 'BBQ', priceExtra: 2000, kind: 'attribute', groupId: 1, productId: null, taxIds: [] }
const mostaza: OptionChoice = { id: 3, name: 'Mostaza miel', priceExtra: 2000, kind: 'attribute', groupId: 1, productId: null, taxIds: [] }
const tocineta: OptionChoice = { id: 9, name: 'Tocineta', priceExtra: 6900, kind: 'combo', groupId: 4, productId: 18, taxIds: [55] }
const groups: OptionGroup[] = [
  { id: 1, name: 'Salsa', kind: 'attribute', required: true, multiple: false, choices: [bbq, mostaza] },
  { id: 4, name: 'Adiciones', kind: 'combo', required: false, multiple: true, choices: [tocineta] },
]

// Falla si para llevar o domicilio dejan de cobrar antes de cocina, o si en mesa desaparece el paso de mesa.
it('dine in picks a table and take away / delivery pay before the kitchen', () => {
  expect(stepsFor('dineIn')).toEqual(['customer', 'table', 'menu', 'summary'])
  expect(stepsFor('takeAway')).toEqual(['customer', 'menu', 'summary', 'payment'])
  expect(stepsFor('delivery')).toEqual(['customer', 'menu', 'summary', 'payment'])
})

// Falla si un domicilio se puede crear sin dirección o teléfono.
it('delivery requires name, address and phone; dine in only needs people', () => {
  expect(customerInfoValid({ ...DEFAULT_INFO, type: 'delivery', name: 'Ana' })).toBe(false)
  expect(customerInfoValid({ ...DEFAULT_INFO, type: 'delivery', name: 'Ana', address: 'Cra 7 # 1-2', phone: '300' })).toBe(true)
  expect(customerInfoValid({ ...DEFAULT_INFO, people: 0 })).toBe(false)
})

// Falla si un grupo obligatorio permite dos opciones o si el opcional deja de ser múltiple.
it('attribute groups are single choice and required; combos toggle many', () => {
  let chosen = toggleChoice(groups, [], bbq)
  expect(selectionComplete(groups, [])).toBe(false)
  expect(selectionComplete(groups, chosen)).toBe(true)
  chosen = toggleChoice(groups, chosen, mostaza)
  expect(chosen.map((c) => c.name)).toEqual(['Mostaza miel'])
  chosen = toggleChoice(groups, toggleChoice(groups, chosen, tocineta), tocineta)
  expect(chosen.filter((c) => c.kind === 'combo')).toHaveLength(0)
})

// Falla si el sobreprecio de la adición no entra en el subtotal o el IVA deja de salir de account.tax.
it('totals add price_extra per unit and the real tax rate', () => {
  const lines = addLine(addLine([], newLine(angus, 1, '', [bbq])), newLine(angus, 1, '', [bbq]))
  expect(lines).toHaveLength(1)
  expect(lines[0].qty).toBe(2)
  expect(cartTotals(lines, [iva])).toEqual({ subtotal: 77800, tax: 14782, total: 92582, taxNames: ['19%'] })
  expect(fullProductName(lines[0])).toBe('Hamburguesa Angus (BBQ)')
})

// Falla si el payload pierde el tipo de servicio, la mesa o la nota de silla de bebé.
it('payload carries service, table and the baby chair note', () => {
  const info = { ...DEFAULT_INFO, babyChair: true, name: 'Zahir Mays', people: 2 }
  const note = orderNote(info, { babyChair: '[Silla de bebé]', delivery: (a, p) => `[Domicilio: ${a} · ${p}]` })
  const payload = toKitPayload({ uuid: 'u1', tableId: 9, info, note })
  expect(payload).toMatchObject({ type: 'dineIn', tableId: 9, people: 2, name: 'Zahir Mays', note: '[Silla de bebé]' })
  expect(toKitPayload({ uuid: 'u2', tableId: 9, info: { ...info, type: 'takeAway' }, note: '' })).toMatchObject({ type: 'takeAway', tableId: null })
  expect(displayReference('takeAway', '7')).toBe('TA007')
})
