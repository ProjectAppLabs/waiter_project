import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { MenuLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart, CartLine, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia F: fotos y sin fotos, categorías, agotado y atributos presentes / ausentes.
export const brand = { nombre: 'Kaiseki', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
export const dish = (over: Partial<Dish> & { id: number; nombre: string }): Dish => ({ precio: 10000, agotado: false, categorias: [1], ...over })
export const california = dish({ id: 1, nombre: 'California', precio: 28000, descripcion: 'Cangrejo, aguacate, pepino', foto: 'http://x/california.jpg', atributos: { piezas: 8, alergenos: ['soya'] } })
export const spicyTuna = dish({ id: 2, nombre: 'Spicy tuna', precio: 34000, descripcion: 'Atún, sriracha, cebollín', foto: 'http://x/tuna.jpg', atributos: { piezas: 8, picante: 2, alergenos: ['pescado', 'soya'] } })
export const veggie = dish({ id: 3, nombre: 'Veggie tempura', precio: 26000, atributos: { piezas: 8, etiquetas: ['vegano'] } })
export const sopa = dish({ id: 4, nombre: 'Sopa miso', precio: 9000, categorias: [2], foto: 'http://x/sopa.jpg' })
export const tabla = dish({ id: 5, nombre: 'Set 24 piezas', precio: 96000, categorias: [2], descripcion: 'California, spicy tuna, dragón', foto: 'http://x/set.jpg', atributos: { piezas: 24, etiquetas: ['para 3'] } })
export const agotado = dish({ id: 6, nombre: 'Anguila de río', precio: 42000, categorias: [2], agotado: true, foto: 'http://x/anguila.jpg', atributos: { piezas: 6 } })
export const rollos: Category = { id: 1, nombre: 'Rollos', productos: [california, spicyTuna, veggie] }
export const compartir: Category = { id: 2, nombre: 'Para compartir', productos: [sopa, tabla, agotado] }
export const entryOf = (categorias: Category[] = [rollos, compartir], mesa: number | null = 14): Entry => ({
  contexto: { restaurante: { slug: 'kaiseki', nombre: 'Kaiseki' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: mesa === null ? null : { numero: mesa, token: 'T0K3N' }, marca: brand },
  carta: { restaurante: 'kaiseki', categorias },
})
export const templateOf = (codigo: string, extra: Partial<Template> = {}): Template => ({ ...DEFAULT_TEMPLATE, codigo, familia: 'F', layouts: { ...DEFAULT_TEMPLATE.layouts, menu: codigo, carrito: 'familia-F', pago: 'familia-F' }, ...extra })

export const line = (over: Partial<CartLine>): CartLine => ({ id: 1, comensal: 'me', mio: true, producto_id: 1, nombre: 'California', precio: 28000, cantidad: 2, nota: '', subtotal: 56000, ...over })
export const cartOf = (lineas: CartLine[], extra: Partial<Cart> = {}): Cart => ({ sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [], ...extra })

export const menuProps = (codigo: string, over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateOf(codigo), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(), cart: null, orderBarHref: '/kaiseki/centro/t/T0K3N/pedido', ...over,
})
export const wrap = (el: ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{el}</NextIntlClientProvider>)
