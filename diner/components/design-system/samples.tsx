'use client'

// Muestras de la página viva del sistema de diseño (Plan J5). Cada muestra usa los componentes y las clases reales del
// menú, dentro de un contenedor con los atributos data-ds-* del tema, para que el CSS de variantes actúe igual que en la carta.
import type { ReactNode } from 'react'
import { COMPONENT_VARIANTS, SCREEN_LAYOUTS, designSystemAttributes } from '@/lib/domain/designVariants'
import type { Dish, Entry, MenuBanner, Template } from '@/lib/types'
import { CategoryNav, DishHero, DishRating, FoodCard, FoodPhoto, Icon, PriceBlock, SearchBox, SectionHeading, money } from '@/components/smart/SmartMenu'
import { SmartHeader } from '@/components/smart/SmartHome'
import { MenuBanners } from '@/components/smart/MenuBanners'
import { CartLineItem, OrderSummary, StatusCard } from '@/components/smart/SmartOrder'
import { HistoryCard, PaperReceipt, ProfileSection } from '@/components/smart/SmartAccount'
import { CouponField, PointsBalanceView } from '@/components/smart/SmartBenefits'
import { RewardBanner } from '@/components/smart/SmartEntry'
import { Recorrido } from '@/components/smart/Recorrido'
import type { AccountOrder, Cart, CartLine, OrderStatus } from '@/lib/types'

// Copia del inventario de experience (id, nombre y variantes que consume) para dibujar la página aunque el contrato
// público no responda; la prueba de paridad falla si diverge de inventario.json.
export const COMPONENTS = [
  { id: 'cabecera', nombre: 'Cabecera y saludo', variantes: ['cabecera', 'saludo'] },
  { id: 'banners', nombre: 'Banners del restaurante', variantes: ['banners'] },
  { id: 'categorias', nombre: 'Navegación de categorías', variantes: ['categorias'] },
  { id: 'plato', nombre: 'Tarjeta de plato', variantes: ['tarjeta', 'precio', 'imagen', 'formaImagen', 'insignia'] },
  { id: 'boton', nombre: 'Acción principal', variantes: ['boton', 'formaBoton'] },
  { id: 'campo', nombre: 'Campo de formulario', variantes: [] },
  { id: 'hoja', nombre: 'Diálogo y hoja inferior', variantes: [] },
  { id: 'texto', nombre: 'Texto del menú', variantes: [] },
  { id: 'imagen', nombre: 'Fotografía del plato', variantes: ['imagen', 'formaImagen', 'marcoImagen'] },
  { id: 'pedido', nombre: 'Barra y resumen del pedido', variantes: [] },
  { id: 'precio', nombre: 'Precio del plato', variantes: ['precio'] },
  { id: 'insignia', nombre: 'Valoración, rebaja y estado', variantes: ['insignia'] },
  { id: 'carta', nombre: 'Distribución de los platos', variantes: ['carta'] },
  { id: 'ficha', nombre: 'Ficha del plato', variantes: ['ficha'] },
  { id: 'carrito', nombre: 'Líneas del pedido', variantes: ['carrito'] },
  { id: 'tarjeta-historial', nombre: 'Tarjeta de pedido pasado', variantes: ['insignia'] },
  { id: 'tarjeta-estado', nombre: 'Tarjeta de estado del pedido', variantes: [] },
  { id: 'recibo', nombre: 'Recibo', variantes: ['insignia'] },
  { id: 'recorrido', nombre: 'Recorrido con ilustración', variantes: [] },
  { id: 'buscador', nombre: 'Buscador', variantes: [] },
  { id: 'seccion', nombre: 'Encabezado de sección', variantes: [] },
  { id: 'resumen', nombre: 'Resumen del pedido', variantes: [] },
  { id: 'cupon', nombre: 'Cupón de descuento', variantes: [] },
  { id: 'perfil', nombre: 'Perfil de la cuenta', variantes: [] },
  { id: 'saldo-puntos', nombre: 'Saldo de puntos', variantes: [] },
  { id: 'banner-recompensa', nombre: 'Banner de recompensa', variantes: [] },
] as const
export type ComponentId = (typeof COMPONENTS)[number]['id']
export type VariantField = keyof typeof COMPONENT_VARIANTS | keyof typeof SCREEN_LAYOUTS

// Cada campo se demuestra una sola vez, en el componente cuyo selector cambia; los demás consumidores enlazan allí.
export const DEMONSTRATED_BY: Record<VariantField, ComponentId> = {
  boton: 'boton', formaBoton: 'boton', tarjeta: 'plato', categorias: 'categorias', precio: 'precio', imagen: 'imagen',
  formaImagen: 'imagen', cabecera: 'cabecera', saludo: 'cabecera', insignia: 'insignia', carta: 'carta', ficha: 'ficha', carrito: 'carrito',
  banners: 'banners', marcoImagen: 'imagen',
}
export const FIELD_LABELS: Record<VariantField, string> = {
  boton: 'Estilo del botón', formaBoton: 'Forma del botón', tarjeta: 'Tarjeta', categorias: 'Categorías', precio: 'Precio',
  imagen: 'Recorte de la foto', formaImagen: 'Forma de la foto', cabecera: 'Cabecera', saludo: 'Saludo', insignia: 'Insignias',
  carta: 'Carta', ficha: 'Ficha del plato', carrito: 'Carrito', banners: 'Colores de los banners', marcoImagen: 'Marco de las fotos',
}
export const FIELDS: Record<VariantField, { attribute: string; default: string; values: readonly string[] }> = { ...COMPONENT_VARIANTS, ...SCREEN_LAYOUTS }

export const PLACEHOLDERS: Dish[] = [
  { id: -1, nombre: 'Plato de muestra', precio: 25000, agotado: false, categorias: [], descripcion: 'Un plato de ejemplo mientras la carta de la sede no tiene productos.' },
  { id: -2, nombre: 'Segundo plato de muestra', precio: 32000, agotado: false, categorias: [] },
  { id: -3, nombre: 'Tercer plato de muestra', precio: 18000, agotado: false, categorias: [] },
]

// Platos reales de la sede: primero los que tienen foto y no están agotados; se completan con muestras si faltan.
export function sampleDishes(entry: Entry, count = 3): Dish[] {
  const unique = [...new Map(entry.carta.categorias.flatMap((c) => c.productos).map((d) => [d.id, d])).values()]
  const ranked = [...unique].sort((a, b) => Number(!!b.foto && !b.agotado) - Number(!!a.foto && !a.agotado))
  return [...ranked, ...PLACEHOLDERS].slice(0, count)
}

// Añade valoración, rebaja y tiempo cuando el plato no los trae: las insignias y los precios deben verse siempre.
export function showcase(dish: Dish): Dish {
  const atributos = { ...dish.atributos }
  if (!atributos.precioAntes || atributos.precioAntes <= dish.precio) atributos.precioAntes = Math.round(dish.precio * 1.25 / 100) * 100
  if (!atributos.tiempoPreparacion) atributos.tiempoPreparacion = 15
  return { ...dish, atributos, valoracion: dish.valoracion?.cantidad ? dish.valoracion : { promedio: 4.8, cantidad: 12 } }
}

export function sampleBanners(entry: Entry, dish: Dish): MenuBanner[] {
  if (entry.banners?.length) return entry.banners
  return [{ layout: 'product', title: 'Prueba nuestro favorito', subtitle: 'Banner de muestra con el tema de la sede', button: 'Ver plato',
    target: 'product', targetId: dish.id, image: '', theme: 'violet', active: true }]
}

export interface SampleContext { entry: Entry; dishes: Dish[] }

// Pedido de muestra para las tarjetas de historial, estado y recibo: platos reales de la sede, sin tocar ninguna cuenta.
export function sampleOrder(dishes: Dish[]): AccountOrder {
  const lineas = dishes.slice(0, 2).map((dish, i) => ({ producto_id: dish.id, nombre: dish.nombre, cantidad: i + 1, precio: dish.precio }))
  const total = lineas.reduce((sum, l) => sum + l.precio * l.cantidad, 0)
  return { id: 'muestra-0001', fecha: '2026-09-20T18:30:00Z', local: 'Muestra', mesa: 8, items: lineas.length, total, estado: 'pagado', descuento: Math.round(total * 0.05), lineas }
}
export function sampleLines(dishes: Dish[]): CartLine[] {
  return dishes.slice(0, 2).map((dish, i) => ({ id: i + 1, comensal: 'muestra', mio: true, producto_id: dish.id, nombre: dish.nombre, precio: dish.precio, cantidad: i + 1, nota: i === 0 ? 'Sin cebolla' : '', subtotal: dish.precio * (i + 1) }))
}
const never = async () => undefined

// Contenedor de una muestra: atributos completos del tema (con la opción demostrada encima), .smart-menu y .sm-page reales.
// `inert` deja las muestras sin interacción: la página enseña el diseño, nunca abre sesiones ni escribe.
export function Sample({ template, override, screen = 'carta', children }: { template: Template; override?: Partial<Record<VariantField, string>>; screen?: string; children: ReactNode }) {
  const attributes = designSystemAttributes(template.tema)
  for (const [field, value] of Object.entries(override ?? {})) attributes[FIELDS[field as VariantField].attribute as `data-ds-${string}`] = value
  return <div className="ds-sample" inert {...attributes}><div className={`smart-menu sm-screen-${screen}`}><div className="sm-page">{children}</div></div></div>
}

const noop = () => undefined

export const SAMPLES: Record<ComponentId, (context: SampleContext) => ReactNode> = {
  cabecera: ({ entry }) => <><SmartHeader entry={entry} current="carta" /><div className="sm-greeting"><h1>Elige el mejor plato para ti</h1></div></>,
  banners: ({ entry, dishes }) => <MenuBanners banners={sampleBanners(entry, dishes[0])} dishes={dishes} onCategory={noop} />,
  categorias: ({ entry }) => <CategoryNav categories={(entry.carta.categorias.length ? entry.carta.categorias : ['Entradas', 'Fuertes', 'Bebidas'].map((nombre, id) => ({ id, nombre }))).slice(0, 4)} selected={null} onSelect={noop} />,
  plato: ({ dishes }) => <div className="sm-food-rail">{dishes.slice(0, 2).map((dish) => <FoodCard key={dish.id} dish={showcase(dish)} />)}</div>,
  boton: ({ dishes }) => <div className="ds-stack">
    <button type="button" className="sm-primary">Agregar a mi pedido <span>{money(dishes[0].precio)}</span></button>
    <button type="button" className="sm-secondary">Ver todo el menú<Icon name="arrow" /></button>
    <button type="button" className="sm-text-button">Seguir explorando</button>
  </div>,
  campo: () => <div className="ds-stack">
    <label className="sm-field"><span>Tu nombre</span><input readOnly defaultValue="Camila Ruiz" /></label>
    <label className="sm-field"><span>¿Alguna indicación para cocina?</span><textarea readOnly rows={2} defaultValue="Sin cebolla, por favor" /></label>
  </div>,
  hoja: () => <div className="sm-filter-dialog sm-wallet-dialog" role="group" aria-label="Hoja de muestra">
    <h2>Añadir tarjeta</h2><p>Usa únicamente los datos de prueba indicados.</p>
    <form onSubmit={(e) => e.preventDefault()}>
      <label className="sm-field"><span>Número de prueba</span><input readOnly defaultValue="4242 4242 4242 4242" /></label>
      <label className="sm-field"><span>Nombre del titular</span><input readOnly defaultValue="Camila Ruiz" /></label>
      <button type="button" className="sm-primary">Guardar tarjeta de prueba</button>
    </form>
  </div>,
  texto: ({ dishes }) => <div className="ds-stack">
    <h1>Elige el mejor plato para ti</h1>
    <h2>Platos destacados</h2>
    <h3>{dishes[0].nombre}</h3>
    <p>{dishes[0].descripcion || 'Texto de cuerpo del menú: describe el plato, sus ingredientes y cómo se sirve.'}</p>
    <div className="sm-note"><strong>Alérgenos</strong><p>Gluten, lácteos</p></div>
    <p className="sm-footnote">Algunas fotografías son imágenes de referencia.</p>
  </div>,
  imagen: ({ dishes }) => <div className="ds-row">{dishes.slice(0, 2).map((dish) => <FoodPhoto key={dish.id} dish={dish} className="ds-photo" />)}</div>,
  pedido: ({ dishes }) => <div className="sm-action-dock sm-action-dock-pair">
    <button type="button" className="sm-chat-launch" aria-label="Mi mesero"><Icon name="bell" /><span>Mi mesero</span></button>
    <a className="sm-cart-float" href="#pedido" onClick={(e) => e.preventDefault()}><span className="sm-count">2</span><span>Mi pedido<small>{money(dishes[0].precio * 2)}</small></span></a>
  </div>,
  // Los tres sitios donde se lee un precio: tarjeta (con rebaja), ficha y línea del pedido.
  precio: ({ dishes }) => <div className="ds-stack">
    <PriceBlock dish={showcase(dishes[0])} />
    <div className="sm-dish-heading ds-price-heading"><strong className="sm-price">{money(dishes[1].precio)}</strong></div>
    <div className="sm-cart-line-info"><strong>{money(dishes[2].precio)}</strong></div>
  </div>,
  insignia: ({ dishes }) => <div className="ds-row">
    <DishRating dish={showcase(dishes[0])} />
    <span className="sm-food-deal"><em>-20%</em><s aria-label="Antes">{money(Math.round(dishes[0].precio * 1.25))}</s></span>
    <span className="sm-status-chip">En cocina</span>
  </div>,
  carta: ({ entry, dishes }) => <section>
    <div className="sm-section-heading"><h2>{entry.carta.categorias[0]?.nombre ?? 'Platos'}</h2><span>{dishes.length} platos</span></div>
    <div className="sm-food-rail">{dishes.map((dish) => <FoodCard key={dish.id} dish={showcase(dish)} />)}</div>
  </section>,
  ficha: ({ dishes }) => {
    const dish = showcase(dishes[0])
    return <article className="sm-dish-layout">
      <DishHero dish={dish} />
      <div className="sm-dish-info">
        <p className="sm-description">{dish.descripcion || 'Descripción del plato con sus ingredientes y su preparación.'}</p>
        <div className="sm-dish-purchase"><button type="button" className="sm-primary">Agregar a mi pedido <span>{money(dish.precio)}</span></button></div>
      </div>
    </article>
  },
  carrito: ({ dishes }) => <section className="sm-cart-lines">{sampleLines(dishes).map((line) => <CartLineItem key={line.id} line={line} dish={dishes.find((d) => d.id === line.producto_id)} swiped={false} onSwipe={never} busy={false} setQty={never} remove={never} />)}</section>,
  'tarjeta-historial': ({ dishes }) => <div className="sm-history-grid"><HistoryCard order={sampleOrder(dishes)} busy={false} reordering={null} reorder={never} /></div>,
  'tarjeta-estado': ({ dishes }) => <section className="sm-status"><StatusCard order={{ id: 'muestra-0001', sesion: 'muestra', estado: 'en_cocina', total: sampleOrder(dishes).total, impuestos: 0, intentos: 1 } as OrderStatus} current={1} /></section>,
  recibo: ({ dishes }) => <PaperReceipt order={sampleOrder(dishes)} products={dishes} />,
  // La introducción de la primera visita: ilustración, puntos de diapositiva, título, frase y pie con dos acciones.
  recorrido: ({ entry }) => <section className="sm-journey sm-intro"><Recorrido ilustracion="/smart-menu/onboarding-menu.png" diapositivas={{ actual: 0, total: 4, ir: noop }} titulo="El menú, a tu manera" texto={`Explora los platos de ${entry.contexto.marca.nombre} y encuentra algo que te encante.`}
    acciones={<><button type="button" className="sm-primary">Continuar<Icon name="arrow" /></button><button type="button" className="sm-text-button">Omitir introducción</button></>} /></section>,
  buscador: () => <SearchBox query="Hamburguesa" onChange={noop} />,
  seccion: ({ entry, dishes }) => <SectionHeading title={entry.carta.categorias[0]?.nombre ?? 'Platos'} count={dishes.length} />,
  // Totales de muestra con un descuento aplicado; el cupón lee el pedido real (vacío en la página viva).
  resumen: ({ dishes }) => { const total = sampleOrder(dishes).total; return <OrderSummary cart={{ sesion: 'muestra', lineas: [], por_comensal: [], total, mio: total, descuento: { codigo: 'MUESTRA10', porcentaje: 10, monto: Math.round(total / 10) } } as unknown as Cart}
    confirmar={<div className="sm-cart-submit"><button type="button" className="sm-primary">Continuar al pago<Icon name="arrow" /></button></div>} pago={<button type="button" className="sm-text-button">Ver opciones de pago</button>} /> },
  cupon: () => <CouponField />,
  perfil: () => <ProfileSection account={{ id: 'muestra', nombre: 'Camila Ruiz', correo: 'camila@ejemplo.com', celular: '300 123 4567', verificada: true }} pedidos={3} favoritos={2}
    enlaces={<><h2>General</h2><a className="sm-profile-link" href="#historial" onClick={(e) => e.preventDefault()}><span className="sm-empty-icon"><Icon name="bag" /></span><span><strong>Mis pedidos</strong><small>Recuerda y vuelve a pedir</small></span><Icon name="arrow" /></a></>}
    notificaciones={<><h2>Notificaciones</h2><label className="sm-profile-notification"><span><strong>Novedades y promociones</strong><small>Recibe novedades del restaurante</small></span><input type="checkbox" role="switch" aria-label="Novedades y promociones" readOnly checked /></label></>}
    salir={<button type="button" className="sm-secondary"><Icon name="logout" />Cerrar sesión</button>} />,
  'saldo-puntos': () => <PointsBalanceView data={{ tarjeta: 1, codigo: 'MUESTRA-1234', puntos: 1250, ganados: 0, programa: 'Programa de puntos de muestra', valorPunto: 10, minimoCanje: 500 }} />,
  'banner-recompensa': () => <section className="sm-rewards"><RewardBanner porcentaje={15} onOpen={noop} /></section>,
}
