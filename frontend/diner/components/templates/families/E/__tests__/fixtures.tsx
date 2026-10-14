import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { MenuLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart, CartLine, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia E: cervezas con ABV/IBU y etiquetas, un cóctel con descripción, un barril vacío (agotado), un plato
// con tamaños y «solo hoy», y otro sin atributos ni foto. Cubre: fotos y sin fotos, categorías, agotado, atributos presentes/ausentes.
export const brand = { nombre: 'Cervecería Norte', lema: 'Doce grifos, seis clásicos', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
export const dish = (over: Partial<Dish> & { id: number; nombre: string }): Dish => ({ precio: 14000, agotado: false, categorias: [1], foto: null, ...over })
export const golden = dish({ id: 1, nombre: 'Golden Ale', precio: 14000, foto: 'http://x/golden.jpg', atributos: { abv: 4.8, ibu: 22, etiquetas: ['ligera'] } })
export const ipa = dish({ id: 2, nombre: 'IPA de la casa', precio: 16000, atributos: { abv: 6.5, ibu: 64, etiquetas: ['lupulada'] } })
export const sour = dish({ id: 3, nombre: 'Sour de maracuyá', precio: 17000, agotado: true, atributos: { abv: 4.2, etiquetas: ['ligera'] } })
export const humo = dish({ id: 4, nombre: 'Humo de páramo', precio: 34000, categorias: [2], descripcion: 'Mezcal, aguacate, limón, sal de gusano.', atributos: { etiquetas: ['Ahumado', 'Fuerte'] } })
export const alitas = dish({ id: 5, nombre: 'Alitas BBQ', precio: 28000, categorias: [3], foto: 'http://x/alitas.jpg', atributos: { tamanos: [{ nombre: '6 piezas', precio: 28000 }, { nombre: '12 piezas', precio: 52000 }], soloHoy: true } })
export const papas = dish({ id: 6, nombre: 'Papas rústicas', precio: 12000, categorias: [3] })
export const grifos: Category = { id: 1, nombre: 'Grifos', productos: [golden, ipa, sour] }
export const cocteles: Category = { id: 2, nombre: 'Cócteles', productos: [humo] }
export const picar: Category = { id: 3, nombre: 'Para picar', productos: [alitas, papas] }
export const categories = [grifos, cocteles, picar]
export const allDishes = [golden, ipa, sour, humo, alitas, papas]

export const entryOf = (cats: Category[] = categories, table: number | null = 6): Entry => ({
  contexto: { restaurante: { slug: 'norte', nombre: 'Cervecería Norte' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: table === null ? null : { numero: table, token: 'Z2XUVG' }, marca: brand },
  carta: { restaurante: 'norte', categorias: cats },
})

export const templateOf = (codigo: string, modo: 'claro' | 'oscuro' = 'oscuro'): Template => ({ ...DEFAULT_TEMPLATE, codigo, familia: 'E', tokens: { ...DEFAULT_TEMPLATE.tokens, modo }, layouts: { ...DEFAULT_TEMPLATE.layouts, menu: codigo, carrito: 'familia-E', pago: 'familia-E' } })

export const line = (over: Partial<CartLine> & { id: number }): CartLine => ({ comensal: 'me', mio: true, producto_id: 1, nombre: 'Golden Ale', precio: 14000, cantidad: 1, nota: '', subtotal: 14000, ...over })
export const cartOf = (lineas: CartLine[], extra: Partial<Cart> = {}): Cart => ({
  sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0),
  por_comensal: Array.from(new Set(lineas.map((l) => l.comensal))).map((c) => ({ comensal: c, total: lineas.filter((l) => l.comensal === c).reduce((a, l) => a + l.subtotal, 0) })),
  ...extra,
})

export const menuProps = (codigo: string, over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateOf(codigo), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(), cart: null, orderBarHref: '/norte/centro/t/Z2XUVG/pedido', ...over,
})

export const wrap = (ui: ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
