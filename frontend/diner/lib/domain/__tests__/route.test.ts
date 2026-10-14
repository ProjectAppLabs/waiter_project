import { parseRoute, pathFor } from '@/lib/domain/route'

// Falla si la URL del NFC (/rest/sede/t/TOKEN) o la de domicilio no abren la carta, o si /plato/3 pierde el id.
it('parses table and delivery routes with their screen and id', () => {
  expect(parseRoute(['t', '8H2KQ7'])).toEqual({ token: '8H2KQ7', screen: 'carta', id: null })
  expect(parseRoute([])).toEqual({ token: null, screen: 'carta', id: null })
  expect(parseRoute(['t', '8H2KQ7', 'plato', '3'])).toEqual({ token: '8H2KQ7', screen: 'plato', id: '3' })
  expect(parseRoute(['pedido'])).toEqual({ token: null, screen: 'pedido', id: null })
  expect(pathFor('burger-house', 'poblado', '8H2KQ7', 'plato', 3)).toBe('/burger-house/poblado/t/8H2KQ7/plato/3')
})

// Falla si las rutas del Plan H no se despachan: pago, Mi cuenta ('cuenta'), registro y código bajo 'cuenta', y pedir la cuenta al salón ('la-cuenta').
it('parses and builds the pay, account and bill routes', () => {
  expect(parseRoute(['t', '8H2KQ7', 'pago'])).toEqual({ token: '8H2KQ7', screen: 'pago', id: null })
  expect(parseRoute(['cuenta'])).toEqual({ token: null, screen: 'cuenta', id: null })
  expect(parseRoute(['cuenta', 'registro'])).toEqual({ token: null, screen: 'cuenta/registro', id: null })
  expect(parseRoute(['t', '8H2KQ7', 'cuenta', 'codigo'])).toEqual({ token: '8H2KQ7', screen: 'cuenta/codigo', id: null })
  // Un sub-segmento desconocido bajo cuenta no es una pantalla: queda como id, como en las demás.
  expect(parseRoute(['cuenta', 'otra'])).toEqual({ token: null, screen: 'cuenta', id: 'otra' })
  expect(parseRoute(['la-cuenta'])).toEqual({ token: null, screen: 'la-cuenta', id: null })
  expect(pathFor('prov', 'centro', '8H2KQ7', 'cuenta/registro')).toBe('/prov/centro/t/8H2KQ7/cuenta/registro')
  expect(pathFor('prov', 'centro', null, 'pago')).toBe('/prov/centro/pago')
  expect(pathFor('prov', 'centro', null, 'la-cuenta')).toBe('/prov/centro/la-cuenta')
})
