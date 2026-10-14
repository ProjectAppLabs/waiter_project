import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { CartLayoutProps, MenuLayoutProps, PayLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Bill, Cart, CartLine, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia D: con y sin foto, agotado, atributos presentes y ausentes, un plato en dos categorías.
export const latte: Dish = { id: 1, nombre: 'Latte', precio: 9000, agotado: false, categorias: [1], descripcion: 'Espresso doble con leche', foto: '/fotos/1/', atributos: { tamanos: [{ nombre: '8 oz', precio: 8000 }, { nombre: '12 oz', precio: 9000 }, { nombre: '16 oz', precio: 11000 }] } }
export const cortado: Dish = { id: 2, nombre: 'Cortado', precio: 6500, agotado: false, categorias: [1], foto: null }
export const coldBrew: Dish = { id: 3, nombre: 'Cold brew', precio: 11000, agotado: true, categorias: [1, 2], foto: '/fotos/3/', descripcion: 'Doce horas en frío' }
export const croissant: Dish = { id: 4, nombre: 'Croissant', precio: 5500, agotado: false, categorias: [2], foto: '/fotos/4/', atributos: { piezas: 2, etiquetas: ['mantequilla'], soloHoy: true } }
export const cerveza: Dish = { id: 5, nombre: 'Ají de la casa', precio: 4000, agotado: false, categorias: [2], atributos: { picante: 2, abv: 4.7, ibu: 18 } }
export const cafe: Category = { id: 1, nombre: 'Café', productos: [latte, cortado, coldBrew] }
export const horno: Category = { id: 2, nombre: 'Del horno', productos: [croissant, cerveza, coldBrew] }
export const vacia: Category = { id: 3, nombre: 'Tardes', productos: [] }

export const brand = { nombre: 'Tinto y Nube', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '¿Qué te provoca hoy?', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
export const entryOf = (categorias: Category[] = [cafe, horno], over: Partial<Entry['contexto']> = {}): Entry => ({
  contexto: { restaurante: { slug: 'tinto', nombre: 'Tinto y Nube' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 14, token: 'Z2XUVG' }, marca: brand, ...over },
  carta: { restaurante: 'tinto', categorias },
})
export const templateOf = (codigo: string): Template => ({ ...DEFAULT_TEMPLATE, codigo, familia: 'D' })

export const line = (over: Partial<CartLine> = {}): CartLine => ({ id: 1, comensal: 'me', mio: true, producto_id: 1, nombre: 'Latte', precio: 9000, cantidad: 2, nota: '', subtotal: 18000, ...over })
export const cartOf = (lineas: CartLine[], descuento?: Cart['descuento']): Cart => ({
  sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [], descuento,
})

export const menuProps = (over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateOf('D1'), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(), cart: null, orderBarHref: '/tinto/centro/t/Z2XUVG/pedido', ...over,
})
export const cartProps = (over: Partial<CartLayoutProps> = {}): CartLayoutProps => ({
  cart: cartOf([line()]), template: templateOf('D4'), busy: false, error: null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn().mockResolvedValue('ord-1'), goPay: jest.fn(), goMenu: jest.fn(), discount: null, retry: jest.fn(),
  hrefs: { home: '/h', menu: '/m', pay: '/p', table: '/t', signup: '/s' }, ...over,
})
export const bill: Bill = { ok: false, total: 15675, mio: 15675, porComensal: [], partes: 1, porParte: 15675, descuento: { porcentaje: 5, monto: 825, aplicable: true, aplicado: true } }
export const payProps = (over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateOf('D3'), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 15675, impuestos: 0, intentos: 1 }, merchant: 'Tinto y Nube S.A.S.', table: 14, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

export const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
