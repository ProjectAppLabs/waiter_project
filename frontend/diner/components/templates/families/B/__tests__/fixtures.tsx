import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'

import type { MenuLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart, CartLine, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia B: fotos y sin fotos, agotado, favorito y todos los atributos del contrato 2 (presentes y ausentes).
export const brand = { nombre: 'Burger House', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F2EAEA', fuente: 'Fraunces', radio: 14 }
export const dish = (id: number, nombre: string, categorias: number[], over: Partial<Dish> = {}): Dish => ({ id, nombre, precio: 10000 * id, agotado: false, categorias, foto: `/f/${id}.jpg`, ...over })
export const angus = dish(3, 'Hamburguesa Angus', [1], { foto: null, favorito: true, descripcion: 'Doble carne, cheddar', atributos: { tamanos: [{ nombre: 'Sencilla', precio: 32000 }, { nombre: 'Doble', precio: 36900 }], soloHoy: true } })
export const clasica = dish(2, 'Hamburguesa Clásica', [1])
export const club = dish(6, 'Club Colombia', [2], { agotado: true, atributos: { abv: 4.7, ibu: 18, etiquetas: ['rubia'] } })
export const limonada = dish(5, 'Limonada de Coco', [2])
export const tacos = dish(11, 'Tacos de carne', [3], { atributos: { piezas: 3, picante: 2 } })
export const sushi = dish(14, 'Tabla de sushi', [5], { descripcion: '24 piezas variadas', atributos: { piezas: 24, etiquetas: ['para 3'] } })
export const picada = dish(12, 'Picada para compartir', [5], { favorito: true })
export const hamburguesas: Category = { id: 1, nombre: 'Hamburguesas', productos: [angus, clasica] }
export const bebidas: Category = { id: 2, nombre: 'Bebidas', productos: [club, limonada] }
export const platos: Category = { id: 3, nombre: 'Platos', productos: [tacos] }
export const compartir: Category = { id: 5, nombre: 'Para compartir', productos: [sushi, picada] }
export const postres: Category = { id: 6, nombre: 'Postres', productos: [] }
export const CATEGORIES = [hamburguesas, bebidas, platos, compartir]
export const ALL_DISHES = [angus, clasica, club, limonada, tacos, sushi, picada]

export const entryOf = (categorias: Category[] = CATEGORIES, over: Partial<Entry['carta']> = {}): Entry => ({
  contexto: { restaurante: { slug: 'burger-house', nombre: 'Burger House' }, sede: { slug: 'poblado', nombre: 'Poblado' }, mesa: { numero: 9, token: 'Z2XUVG' }, marca: brand },
  carta: { restaurante: 'burger-house', categorias, ...over },
})
export const templateOf = (codigo: string): Template => ({ ...DEFAULT_TEMPLATE, codigo, layouts: { ...DEFAULT_TEMPLATE.layouts, menu: codigo } })
export const line = (over: Partial<CartLine> = {}): CartLine => ({ id: 1, comensal: 'me', mio: true, producto_id: 2, nombre: 'Hamburguesa Clásica', precio: 38080, cantidad: 2, nota: '', subtotal: 76160, ...over })
export const cartOf = (lineas: CartLine[], over: Partial<Cart> = {}): Cart => ({ sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [], ...over })

export const menuProps = (codigo: string, over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateOf(codigo), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(),
  cart: cartOf([line()]), orderBarHref: '/burger-house/poblado/t/Z2XUVG/pedido/', ...over,
})
export const wrap = (ui: ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
