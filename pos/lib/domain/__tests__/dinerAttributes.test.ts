import { parseDinerAttributes, serializeDinerAttributes, textToList } from '@/lib/domain/dinerAttributes'

// Falla si un JSON roto o un tipo inesperado rompe el formulario en vez de salir como {} (contrato 2 del Plan H).
it('parses the diner attributes with tolerance', () => {
  expect(parseDinerAttributes('{"piezas": 8, "picante": 2, "etiquetas": ["popular"], "tamanos": [{"nombre": "Copa", "precio": 18000}], "soloHoy": true}'))
    .toEqual({ piezas: 8, picante: 2, etiquetas: ['popular'], tamanos: [{ nombre: 'Copa', precio: 18000 }], soloHoy: true })
  expect(parseDinerAttributes('no es json')).toEqual({})
  expect(parseDinerAttributes('[1,2]')).toEqual({})
  expect(parseDinerAttributes('{"picante": 9, "abv": "5"}')).toEqual({})
  expect(parseDinerAttributes(false)).toEqual({})
})

// Falla si se guardan claves vacías (la carta pintaría "0 piezas") o si sin atributos no se manda false al servidor.
it('serializes only the filled keys and false when empty', () => {
  expect(serializeDinerAttributes({ piezas: 0, picante: 0, etiquetas: [], tamanos: [{ nombre: ' ', precio: 0 }], soloHoy: false })).toBe(false)
  expect(JSON.parse(serializeDinerAttributes({ picante: 3, alergenos: ['maní'], tamanos: [{ nombre: ' Doble ', precio: 36900 }] }) as string))
    .toEqual({ picante: 3, alergenos: ['maní'], tamanos: [{ nombre: 'Doble', precio: 36900 }] })
  expect(textToList(' popular, , sin gluten ')).toEqual(['popular', 'sin gluten'])
})

// Falla si se pierden ingredientes, ceros nutricionales o ids de productos extra.
it('preserves ingredients, nutritional zeroes and real extra product IDs', () => {
  const input = {ingredientes:['Pan','Tomate'],nutricion:{calorias:250,peso:180.5,grasa:0},extras:[31,42]}
  expect(parseDinerAttributes(serializeDinerAttributes(input))).toEqual(input)
})

// Falla si se pierden acompañamientos vacíos explícitos o se aceptan ids inválidos.
it('preserves explicitly empty sides and validates product IDs for both selectors', () => {
  expect(parseDinerAttributes(serializeDinerAttributes({acompanamientos:[]}))).toEqual({acompanamientos:[]})
  expect(parseDinerAttributes('{"acompanamientos":[3,3,-1,0,"4"],"extras":[2,2,1.5]}')).toEqual({acompanamientos:[3],extras:[2]})
})

// Falla si la tarjeta de la carta recibe minutos con decimales, precios anteriores en cero o pierde estos dos datos al guardar.
it('keeps whole preparation minutes and a positive previous price, and drops anything else', () => {
  expect(parseDinerAttributes('{"tiempoPreparacion": 15, "precioAntes": 42000}')).toEqual({ tiempoPreparacion: 15, precioAntes: 42000 })
  expect(parseDinerAttributes('{"tiempoPreparacion": 12.5, "precioAntes": 0}')).toEqual({})
  expect(parseDinerAttributes('{"tiempoPreparacion": "15", "precioAntes": "42000"}')).toEqual({})
  expect(serializeDinerAttributes({ tiempoPreparacion: 0, precioAntes: 0 })).toBe(false)
  expect(JSON.parse(serializeDinerAttributes({ tiempoPreparacion: 20, precioAntes: 42000 }) as string)).toEqual({ tiempoPreparacion: 20, precioAntes: 42000 })
})
