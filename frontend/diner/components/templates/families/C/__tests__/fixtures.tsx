import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { MenuLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart, CartLine, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia C: fotos y sin fotos, categorías (con una de extras), agotado, favorito y atributos presentes/ausentes.
export const brand = { nombre: 'El Fogón', lema: 'Cocina de barrio', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Fraunces', radio: 14 }
export const dish = (over: Partial<Dish> & { id: number; nombre: string; precio: number }): Dish => ({ agotado: false, categorias: [1], ...over })
export const combos: Category = { id: 1, nombre: 'Combos', productos: [
  dish({ id: 1, nombre: 'Burger + papas + gaseosa', precio: 32900, descripcion: 'Angus 150 g\nCon todo', foto: 'https://x/burger.jpg', atributos: { tamanos: [{ nombre: 'Sencilla', precio: 32900 }, { nombre: 'Doble', precio: 41900 }], soloHoy: true } }),
  dish({ id: 2, nombre: 'Doble carne + papas', precio: 41900, favorito: true, foto: null }),
  dish({ id: 3, nombre: 'Quesadilla', precio: 21000, agotado: true, foto: 'https://x/quesadilla.jpg' }),
] }
export const bebidas: Category = { id: 2, nombre: 'Bebidas', productos: [dish({ id: 5, nombre: 'Limonada', precio: 12900, categorias: [2], foto: 'https://x/limonada.jpg' }), dish({ id: 6, nombre: 'Agua de Jamaica', precio: 0, categorias: [2] })] }
export const adiciones: Category = { id: 3, nombre: 'Adiciones', productos: [dish({ id: 9, nombre: 'Papas', precio: 6900, categorias: [3] }), dish({ id: 10, nombre: 'Salsa extra', precio: 2000, categorias: [3], foto: 'https://x/salsa.jpg' })] }
export const entryOf = (categorias: Category[] = [combos, bebidas, adiciones]): Entry => ({ contexto: { restaurante: { slug: 'fogon', nombre: 'El Fogón' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 9, token: 'Z2XUVG' }, marca: brand }, carta: { restaurante: 'fogon', categorias } })

export const templateC = (codigo: string): Template => ({ ...DEFAULT_TEMPLATE, codigo, familia: 'C', layouts: { ...DEFAULT_TEMPLATE.layouts, menu: codigo, carrito: 'familia-C', pago: 'familia-C' } })
export const line = (over: Partial<CartLine>): CartLine => ({ id: 1, comensal: 'me', mio: true, producto_id: 1, nombre: 'Burger + papas + gaseosa', precio: 32900, cantidad: 2, nota: '', subtotal: 65800, ...over })
export const cartOf = (lineas: CartLine[], over: Partial<Cart> = {}): Cart => ({ sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [], ...over })

export const menuProps = (codigo: string, over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateC(codigo), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(), cart: null, orderBarHref: '/fogon/centro/t/Z2XUVG/pedido', ...over,
})
export const wrap = (ui: ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
