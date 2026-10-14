import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { AccountHome } from '@/components/templates/generic/AccountHome'
import { EmptyHistory } from '@/components/templates/generic/EmptyHistory'
import { GenericCart } from '@/components/templates/generic/GenericCart'
import { GenericCode } from '@/components/templates/generic/GenericCode'
import { GenericHistory } from '@/components/templates/generic/GenericHistory'
import { GenericMenu } from '@/components/templates/generic/GenericMenu'
import { GenericPay } from '@/components/templates/generic/GenericPay'
import { GenericSignup } from '@/components/templates/generic/GenericSignup'
import { CART_LAYOUTS, CODE_PATTERNS, HISTORY_PATTERNS, MENU_LAYOUTS, PAY_LAYOUTS, SIGNUP_PATTERNS, cartLayout, codePattern, historyPattern, menuLayout, ownsChrome, payLayout, signupPattern } from '@/components/templates/registry'

// Falla si una clave que aún no existe (los 30 llegan en otra oleada) rompe el motor en vez de caer al genérico, o si una registrada no se respeta.
it('falls back to the generic layout for every missing key and honours registered ones', () => {
  // Claves que ninguna oleada registra (las familias A–F y los nueve patrones van llegando): el motor cae al genérico.
  expect(menuLayout('Z9')).toBe(GenericMenu)
  expect(menuLayout(undefined)).toBe(GenericMenu)
  expect(menuLayout('b1')).toBe(MENU_LAYOUTS.B1)
  expect(cartLayout('Z')).toBe(GenericCart)
  expect(cartLayout('familia-Z')).toBe(GenericCart)
  expect(payLayout('Z')).toBe(GenericPay)
  expect(signupPattern('inexistente')).toBe(GenericSignup)
  expect(codePattern('inexistente')).toBe(GenericCode)
  expect(historyPattern('inexistente')).toBe(GenericHistory)
  expect(historyPattern(undefined)).toBe(GenericHistory)

  const Custom = () => null
  const prev = { menu: MENU_LAYOUTS.F5, cart: CART_LAYOUTS.F, pay: PAY_LAYOUTS.F, signup: SIGNUP_PATTERNS.portada, code: CODE_PATTERNS.canal, history: HISTORY_PATTERNS.tablaCufe }
  MENU_LAYOUTS.F5 = Custom
  CART_LAYOUTS.F = Custom
  PAY_LAYOUTS.F = Custom
  SIGNUP_PATTERNS.portada = Custom
  CODE_PATTERNS.canal = Custom
  HISTORY_PATTERNS.tablaCufe = Custom
  try {
    expect(menuLayout('F5')).toBe(Custom)
    expect(cartLayout('F')).toBe(Custom)
    expect(payLayout('F')).toBe(Custom)
    expect(signupPattern('portada')).toBe(Custom)
    expect(codePattern('canal')).toBe(Custom)
    expect(historyPattern('tablaCufe')).toBe(Custom)
  } finally {
    // Se restaura lo que había (registrado por otra familia o nada) para no alterar el registro real.
    if (prev.menu) MENU_LAYOUTS.F5 = prev.menu; else delete MENU_LAYOUTS.F5
    if (prev.cart) CART_LAYOUTS.F = prev.cart; else delete CART_LAYOUTS.F
    if (prev.pay) PAY_LAYOUTS.F = prev.pay; else delete PAY_LAYOUTS.F
    if (prev.signup) SIGNUP_PATTERNS.portada = prev.signup; else delete SIGNUP_PATTERNS.portada
    if (prev.code) CODE_PATTERNS.canal = prev.code; else delete CODE_PATTERNS.canal
    if (prev.history) HISTORY_PATTERNS.tablaCufe = prev.history; else delete HISTORY_PATTERNS.tablaCufe
  }
})

// Falla si alguna de las 30 plantillas, alguna familia o alguno de los nueve patrones vuelve a caer al genérico.
it('registers the 30 menus, the six families and the nine account patterns with real layouts', () => {
  const codes = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((f) => [1, 2, 3, 4, 5].map((n) => `${f}${n}`))
  for (const code of codes) expect(MENU_LAYOUTS[code]).toBeDefined()
  for (const code of codes) expect(MENU_LAYOUTS[code]).not.toBe(GenericMenu)
  for (const f of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    expect(CART_LAYOUTS[f]).toBeDefined(); expect(CART_LAYOUTS[f]).not.toBe(GenericCart)
    expect(PAY_LAYOUTS[f]).toBeDefined(); expect(PAY_LAYOUTS[f]).not.toBe(GenericPay)
  }
  expect(Object.keys(SIGNUP_PATTERNS).sort()).toEqual(['banner5', 'beneficios', 'portada'])
  expect(Object.keys(CODE_PATTERNS).sort()).toEqual(['canal', 'casillas', 'revisaCorreo'])
  expect(Object.keys(HISTORY_PATTERNS).sort()).toEqual(['porMes', 'tablaCufe', 'tarjetas'])
  expect(typeof AccountHome).toBe('function')
  expect(typeof EmptyHistory).toBe('function')
})

// Falla si un layout fiel deja de declarar que trae su propia cabecera y barra (la página las duplicaría).
it('ownsChrome is true for registered menu, cart and pay layouts and false elsewhere', () => {
  const t = { ...DEFAULT_TEMPLATE, codigo: 'A1', familia: 'A', layouts: { ...DEFAULT_TEMPLATE.layouts, menu: 'A1', carrito: 'familia-A', pago: 'familia-A' } } as typeof DEFAULT_TEMPLATE
  expect(ownsChrome('carta', t)).toBe(true)
  expect(ownsChrome('pedido', t)).toBe(true)
  expect(ownsChrome('pago', t)).toBe(true)
  expect(ownsChrome('inicio', t)).toBe(false)
  expect(ownsChrome('carta', { ...t, codigo: 'Z9' })).toBe(false)
})
