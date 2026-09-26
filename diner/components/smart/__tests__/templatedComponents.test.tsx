import { render } from '@testing-library/react'
import { contracts, factoryTree, parseTemplate } from '@/components/plantillas/__tests__/helpers'
import { MenuBanners } from '../MenuBanners'
import { SmartHeader } from '../SmartHome'
import { DishHero } from '../SmartMenu'
import { CartLineItem, StatusCard } from '../SmartOrder'
import { HistoryCard, PaperReceipt } from '../SmartAccount'
import { Recorrido } from '../Recorrido'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { AccountOrder, CartLine, Dish, Entry, MenuBanner, MenuTheme, OrderStatus } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
const dish: Dish = { id: 7, nombre: 'Bandeja paisa', precio: 32000, agotado: false, categorias: [1], foto: '/b.png', descripcion: 'Con frijol.', valoracion: { promedio: 4.75, cantidad: 12 }, atributos: { tiempoPreparacion: 15, precioAntes: 40000, combo: [{ producto: 1, cantidad: 1, nombre: 'Jugo' }] } }
const entry = { banners: null, contexto: { restaurante: { slug: 'demo', nombre: 'Demo' }, sede: { slug: 'salon', nombre: 'Salón' }, mesa: { numero: 8, token: 'X' },
  marca: { nombre: 'Casa Demo', lema: '', logo: '/logo.png', saludo: 'Hola de nuevo', mesero: '', bienvenida: '', color: '#6755A0', colorTexto: '#FFFFFF', colorSuave: '#EEEBF5', fuente: 'Mulish', radio: 16 } },
  carta: { restaurante: 'Casa Demo', categorias: [{ id: 1, nombre: 'Fuertes', productos: [dish] }] } } as Entry
const banner: MenuBanner = { layout: 'product', title: 'Prueba el combo', subtitle: 'Solo hoy', button: 'Ver combo', target: 'product', targetId: 7, image: '', theme: 'violet', active: true }
const line: CartLine = { id: 3, comensal: 'abcdef12', mio: true, producto_id: 7, nombre: 'Bandeja paisa', precio: 32000, cantidad: 2, nota: 'sin arepa', subtotal: 64000 }
const order: OrderStatus = { id: 'a1b2c3d4e5', sesion: 's', estado: 'en_cocina', total: 64000, impuestos: 5000, intentos: 1 }
const past: AccountOrder = { id: 'a1b2c3d4e5f6', fecha: '2026-09-20T18:30:00Z', local: 'Casa Demo', mesa: 8, items: 2, total: 64000, estado: 'pagado', descuento: 3200, lineas: [{ producto_id: 7, nombre: 'Bandeja paisa', cantidad: 2, precio: 32000 }] }
const noop = async () => undefined

// Cada componente plantillable con sus datos de muestra, su selector raíz y una plantilla propia que enlaza un dato.
const CASES: { id: string; selector: string; render: () => React.ReactElement; custom: string; expect: string }[] = [
  { id: 'banners', selector: '.sm-promo-banner', render: () => <MenuBanners banners={[banner]} dishes={[dish]} onCategory={() => undefined} />,
    custom: '<div class="ds-pila"><h2 class="ds-texto-titulo"><dato nombre="banner.titulo"/></h2><si dato="banner.producto"><span><dato nombre="banner.producto.precio" formato="precio"/></span></si><ranura nombre="imagen"/></div>', expect: 'Prueba el combo$ 32.000' },
  { id: 'cabecera', selector: '.sm-location-header', render: () => <SmartHeader entry={entry} current="carta" />,
    custom: '<div class="ds-fila ds-espacio-8"><ranura nombre="logo"/><strong><dato nombre="marca.nombre"/></strong><si dato="mesa"><span>Mesa <dato nombre="mesa.numero" formato="numero"/></span></si></div><ranura nombre="navegacion"/>', expect: 'Casa DemoMesa 8' },
  { id: 'ficha-heroe', selector: '.sm-dish-hero', render: () => <DishHero dish={dish} />,
    custom: '<ranura nombre="foto"/><h1 class="ds-texto-grande"><dato nombre="plato.nombre"/></h1><p><dato nombre="plato.descripcion"/></p><ranura nombre="precio"/>', expect: 'Bandeja paisaCon frijol.$ 32.000' },
  { id: 'linea-pedido', selector: '.sm-cart-line', render: () => <CartLineItem line={line} dish={dish} swiped={false} onSwipe={() => undefined} busy={false} setQty={noop} remove={noop} />,
    custom: '<div class="ds-pila"><strong><dato nombre="linea.nombre"/></strong><small><dato nombre="linea.cantidad" formato="numero"/> × <dato nombre="linea.precio" formato="precio"/></small><si dato="linea.nota"><em><dato nombre="linea.nota"/></em></si><ranura nombre="controles"/></div>', expect: 'Bandeja paisa2 × $ 32.000sin arepa' },
  { id: 'tarjeta-estado', selector: '.sm-status-card', render: () => <StatusCard order={order} current={1} />,
    custom: '<ranura nombre="arte"/><h2 class="ds-texto-titulo"><dato nombre="estado.titulo"/></h2><small><dato nombre="estado.codigo"/></small>', expect: 'en_cocina' },
  { id: 'tarjeta-historial', selector: '.sm-history-card', render: () => <HistoryCard order={past} busy={false} reordering={null} reorder={noop} />,
    custom: '<div class="ds-pila"><strong><dato nombre="pedido.local"/> · <dato nombre="pedido.numero"/></strong><ul><cada dato="pedido.lineas" como="linea"><li><dato nombre="linea.cantidad" formato="numero"/>× <dato nombre="linea.nombre"/> = <dato nombre="linea.subtotal" formato="precio"/></li></cada></ul><ranura nombre="total"/><ranura nombre="acciones"/></div>', expect: 'Casa Demo · #a1b2c3d42× Bandeja paisa = $ 64.000' },
  { id: 'recibo-papel', selector: '.sm-paper-receipt', render: () => <PaperReceipt order={past} products={[dish]} />,
    custom: '<h1><dato nombre="pedido.local"/></h1><si dato="pedido.descuento"><p>Descuento <dato nombre="pedido.descuento.monto" formato="precio"/></p></si><ranura nombre="total"/>', expect: 'Casa DemoDescuento $ 3.200' },
  { id: 'recorrido', selector: '.sm-recorrido', render: () => <section className="sm-journey sm-intro"><Recorrido ilustracion="/smart-menu/stars.png" diapositivas={{ actual: 1, total: 4, ir: () => undefined }} titulo="Conoce tu menú" texto="Pide desde tu mesa." cuerpo={<p className="sm-note">Nota de la pantalla</p>} acciones={<button type="button" className="sm-primary">Continuar</button>} /></section>,
    custom: '<ranura nombre="ilustracion"/><h1 class="ds-texto-grande"><dato nombre="recorrido.titulo"/></h1><small>Paso <dato nombre="recorrido.paso" formato="numero"/> de <dato nombre="recorrido.pasos" formato="numero"/></small><si dato="recorrido.texto"><p><dato nombre="recorrido.texto"/></p></si><ranura nombre="cuerpo"/><ranura nombre="acciones"/>', expect: 'Conoce tu menúPaso 2 de 4Pide desde tu mesa.Nota de la pantallaContinuar' },
]
const withTemplate = (id: string, arbol: unknown) => useDinerStore.setState({ template: { ...DEFAULT_TEMPLATE, tema: { version: 2, componentes: { [id]: { version: 1, arbol } } } as unknown as MenuTheme } })
const html = (container: HTMLElement, selector: string) => container.querySelector(selector)!.innerHTML

beforeEach(() => useDinerStore.setState({ ...useDinerStore.getInitialState(), keys: { rest: 'demo', venue: 'salon', token: null } }, true))

describe.each(CASES)('$id', (c) => {
  // Falla si la plantilla de fábrica dibujada desde el árbol difiere del JSX de fábrica: el lenguaje dejaría de alcanzar para el diseño actual.
  it('dibuja la plantilla de fábrica igual que el componente actual', () => {
    const first = c.render && render(c.render())
    const root = first.container.querySelector(c.selector)!
    expect(root).not.toHaveAttribute('data-plantilla')
    const factory = html(first.container, c.selector)
    first.unmount()
    withTemplate(c.id, factoryTree(c.id))
    const templated = render(c.render()).container
    expect(templated.querySelector(c.selector)).toHaveAttribute('data-componente', c.id)
    expect(html(templated, c.selector)).toBe(factory)
  })

  // Falla si una plantilla propia no puede enlazar los datos del contrato o pierde las ranuras reales del componente.
  it('enlaza los datos del contrato en una plantilla propia', () => {
    withTemplate(c.id, parseTemplate(c.custom))
    const { container } = render(c.render())
    const root = container.querySelector(c.selector)!
    expect(root).toHaveAttribute('data-plantilla', 'propia')
    expect(root.textContent).toContain(c.expect)
    expect(root.querySelector('script, iframe')).toBeNull()
  })

  // Falla si los datos que ve la plantilla no coinciden con los que declara el contrato del componente.
  it('expone exactamente los datos del contrato', () => {
    withTemplate(c.id, parseTemplate(Object.keys(contracts.componentes[c.id].datos).map((d) => `<si dato="${d}"><span>${d}</span></si>`).join('') + Object.keys(contracts.componentes[c.id].ranuras).map((r) => `<ranura nombre="${r}"/>`).join('')))
    const { container } = render(c.render())
    expect(container.querySelector(c.selector)).toHaveAttribute('data-plantilla', 'propia')
  })
})
