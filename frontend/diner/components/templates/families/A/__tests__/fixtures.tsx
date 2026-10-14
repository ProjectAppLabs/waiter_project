import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { MenuLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart, Category, Dish, Entry, Template } from '@/lib/types'

// Carta de prueba de la familia A: con fotos y sin fotos, agotado, atributos presentes y ausentes, una categoría vacía.
export const brand = { nombre: 'La Provincia', lema: 'Cocina de barrio', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
export const dish = (id: number, nombre: string, categorias: number[], over: Partial<Dish> = {}): Dish => ({ id, nombre, precio: 10000 * id, agotado: false, categorias, ...over })
export const entradas: Category = { id: 1, nombre: 'Entradas', productos: [
  dish(1, 'Burrata italiana', [1], { descripcion: 'Tomate confitado, pesto de albahaca, focaccia de la casa.', foto: '/api/v1/f/1.jpg' }),
  dish(2, 'Tartar de trucha', [1], { descripcion: 'Curada en casa, aguacate, cítricos del Huila.' }),
] }
export const fuertes: Category = { id: 2, nombre: 'Fuertes', productos: [
  dish(3, 'Cordero de Boyacá', [2], { descripcion: 'Ocho horas a baja temperatura.', foto: '/api/v1/f/3.jpg', atributos: { etiquetas: ['Sin gluten'], piezas: 3, picante: 2, soloHoy: true } }),
  dish(4, 'Ajiaco', [2], { agotado: true, foto: '/api/v1/f/4.jpg' }),
] }
export const postres: Category = { id: 3, nombre: 'Postres', productos: [dish(5, 'Torta de zanahoria', [3], { precio: 9900, atributos: { etiquetas: ['vegetariano'], piezas: 2 } }), dish(6, 'Brownie', [3], { precio: 17700, agotado: true, atributos: { alergenos: ['huevo', 'lácteos'] } })] }
export const vacia: Category = { id: 4, nombre: 'Vinos', productos: [] }
export const entryOf = (categorias: Category[] = [entradas, fuertes, postres, vacia], table: number | null = 14): Entry => ({
  contexto: { restaurante: { slug: 'prov', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: table !== null ? { numero: table, token: 'Z2XUVG' } : null, marca: brand },
  carta: { restaurante: 'prov', categorias },
})
export const templateOf = (codigo: string, modo: 'claro' | 'oscuro' = 'claro'): Template => ({ ...DEFAULT_TEMPLATE, codigo, familia: 'A', tokens: { ...DEFAULT_TEMPLATE.tokens, modo }, layouts: { ...DEFAULT_TEMPLATE.layouts, menu: codigo, carrito: 'familia-A', pago: 'familia-A' } })
export const cartOf = (lineas: Cart['lineas'], over: Partial<Cart> = {}): Cart => ({ sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [], ...over })
export const line = (over: Partial<Cart['lineas'][number]> = {}) => ({ id: 1, comensal: 'me', mio: true, producto_id: 1, nombre: 'Burrata italiana', precio: 32900, cantidad: 1, nota: '', subtotal: 32900, ...over })

export const menuProps = (codigo: string, over: Partial<MenuLayoutProps> = {}): MenuLayoutProps => ({
  entry: entryOf(), template: templateOf(codigo), query: '', setQuery: jest.fn(), category: null, setCategory: jest.fn(), onOpen: jest.fn(), onAdd: jest.fn(),
  cart: cartOf([line({ cantidad: 2, subtotal: 65800 })]), orderBarHref: '/prov/centro/t/Z2XUVG/pedido', ...over,
})

export const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Cuántos ancestros (o el propio nodo) llevan la atenuación de agotado: el texto de un plato agotado debe dar exactamente 1 (una sola vez,
// 55 %) y su insignia 0 (legible).
export const dimmedAncestors = (el: HTMLElement | null): number => {
  let n = 0
  for (let node: HTMLElement | null = el; node; node = node.parentElement) if (node.classList.contains('opacity-55')) n += 1
  return n
}
