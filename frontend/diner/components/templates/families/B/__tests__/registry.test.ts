import { B1Menu } from '@/components/templates/families/B/B1Menu'
import { B2Menu } from '@/components/templates/families/B/B2Menu'
import { B3Menu } from '@/components/templates/families/B/B3Menu'
import { B4Menu } from '@/components/templates/families/B/B4Menu'
import { B5Menu } from '@/components/templates/families/B/B5Menu'
import { FamilyBCart } from '@/components/templates/families/B/FamilyBCart'
import { FamilyBPay } from '@/components/templates/families/B/FamilyBPay'
import { CardsHistory } from '@/components/templates/patterns/CardsHistory'
import { CART_LAYOUTS, HISTORY_PATTERNS, MENU_LAYOUTS, PAY_LAYOUTS, cartLayout, menuLayout, ownsChrome, payLayout } from '@/components/templates/registry'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'

// Falla si B1–B5, el carrito o el pago de la familia vuelven a caer al genérico o los sustituye otro layout, o si el patrón
// «tarjetas» deja de ser el de la familia (el test general del registro solo comprueba que haya algo registrado).
it('registers exactly the family B layouts and the cards history pattern', () => {
  expect(MENU_LAYOUTS.B1).toBe(B1Menu)
  expect(MENU_LAYOUTS.B2).toBe(B2Menu)
  expect(MENU_LAYOUTS.B3).toBe(B3Menu)
  expect(MENU_LAYOUTS.B4).toBe(B4Menu)
  expect(MENU_LAYOUTS.B5).toBe(B5Menu)
  expect(CART_LAYOUTS.B).toBe(FamilyBCart)
  expect(PAY_LAYOUTS.B).toBe(FamilyBPay)
  expect(HISTORY_PATTERNS.tarjetas).toBe(CardsHistory)
  expect(menuLayout('b4')).toBe(B4Menu)
  expect(cartLayout('B')).toBe(FamilyBCart)
  expect(payLayout('B')).toBe(FamilyBPay)
})

// Falla si la página volviera a pintar su cabecera de marca o su barra de pedido sobre la carta, el pedido o el pago de la familia
// (la plantilla por defecto es B1: carta con la barra oscura del marco).
it('owns the chrome of menu, cart and pay for every B template', () => {
  for (const code of ['B1', 'B2', 'B3', 'B4', 'B5']) {
    const t = { ...DEFAULT_TEMPLATE, codigo: code, layouts: { ...DEFAULT_TEMPLATE.layouts, menu: code } }
    expect(ownsChrome('carta', t)).toBe(true)
    expect(ownsChrome('pedido', t)).toBe(true)
    expect(ownsChrome('pago', t)).toBe(true)
    expect(ownsChrome('cuenta', t)).toBe(false)
  }
})
