'use client'

/* eslint-disable @next/next/no-img-element -- Photos already come resized from the restaurant API; logos can be local upload previews. */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pathFor, type Route, type Screen } from '@/lib/domain/route'
import { formatCop } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Dish, Entry } from '@/lib/types'
import { SmartCart, SmartPay, SmartStatus, SmartBill } from './SmartOrder'
import {
  SmartAccount,
  SmartAccountEdit,
  SmartReceipt,
  SmartSignup,
  SmartCode,
  SmartHistory,
} from './SmartAccount'
import { SmartHome, SmartHeader } from './SmartHome'
import { SmartFeedback } from './SmartFeedback'
import { SmartLocation, SmartRewards } from './SmartEntry'
import { SmartPassword, SmartPasswordReset, SmartEmailEntry, SmartVerificationChannel, SmartRegisteredAccount } from './SmartPassword'
import {SmartWallet} from './SmartWallet'
import { MenuBanners } from './MenuBanners'
import { SmartChat } from './SmartChat'
import { SmartReservationPay } from './SmartReservationPay'
import { IngredientIllustration } from './SmartIngredients'
import './smart-tokens.css'
import './smart-menu.css'
import './smart-dish.css'
import './smart-forms.css'
import './smart-feedback.css'
import './smart-checkout.css'
import './smart-motion.css'

export type SmartProps = {
  entry: Entry
  rest: string
  venue: string
  token: string | null
  id: string | null
}
export type IconName =
  | 'star'
  | 'menu'
  | 'heart'
  | 'bag'
  | 'user'
  | 'search'
  | 'back'
  | 'plus'
  | 'minus'
  | 'arrow'
  | 'check'
  | 'clock'
  | 'bell'
  | 'close'
  | 'logout'
  | 'plate'
const paths: Record<IconName, ReactNode> = {
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
  menu: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  bag: (
    <>
      <path d="M5 7h14l2 14H3L5 7Z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  back: <path d="m14 5-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L20 5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bell: (
    <>
      <path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4ZM10 21h4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: (
    <>
      <path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M2 3v18M22 3v18" />
    </>
  ),
}
export function Icon({
  name,
  filled = false,
}: {
  name: IconName
  filled?: boolean
}) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}
export function money(n: number) {
  return `$ ${formatCop(n)}`
}
export function useSmartRoute() {
  const keys = useDinerStore((s) => s.keys)
  const router = useRouter()
  const href = (screen: Screen, id?: string | number) =>
    keys ? pathFor(keys.rest, keys.venue, keys.token, screen, id) : '#'
  return {
    href,
    go: (screen: Screen, id?: string | number) => router.push(href(screen, id)),
  }
}
export function Title({
  title,
  sub,
  back = 'carta',
  children,
}: {
  title: string
  sub?: string
  back?: Screen
  children?: ReactNode
}) {
  const { href } = useSmartRoute()
  return (
    <div className="sm-title">
      <Link href={href(back)} className="sm-icon" aria-label="Volver">
        <Icon name="back" />
      </Link>
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  )
}
export function Empty({
  icon = 'plate',
  title,
  children,
  action,
  onAction,
}: {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: string
  onAction?: () => void
}) {
  return (
    <section className="sm-empty">
      <span className="sm-empty-icon">
        <Icon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action && (
        <button className="sm-primary" onClick={onAction}>
          {action}
          <Icon name="arrow" />
        </button>
      )}
    </section>
  )
}
export function FoodPhoto({
  dish,
  className = '',
}: {
  dish: Dish
  className?: string
}) {
  const [failed,setFailed] = useState<string|null>(null)
  return (
    <div className={`sm-food-photo ${className}`}>
      {dish.foto && failed!==dish.foto ? (
        <img src={dish.foto} alt={dish.nombre} loading={className.includes('sm-dish-photo')?'eager':'lazy'} onError={()=>setFailed(dish.foto||null)} />
      ) : (
        <div className="sm-photo-empty">
          <Icon name="plate" />
          <span>{dish.nombre}</span>
        </div>
      )}
    </div>
  )
}
export function DishRating({dish, reviews=false}: {dish:Dish;reviews?:boolean}) {
  if(!dish.valoracion?.cantidad)return null
  return <span className={reviews?'sm-dish-rating':'sm-rating-pill'} aria-label={`${dish.valoracion.promedio} de 5, ${dish.valoracion.cantidad} opiniones`}><Icon name="star" filled/><strong>{dish.valoracion.promedio.toFixed(1)}</strong>{reviews&&<small>({dish.valoracion.cantidad} opiniones)</small>}</span>
}
export function Heart({ dish }: { dish: Dish }) {
  const { account, favorites, favorite, favoritesBusy } = useDinerStore()
  const { go } = useSmartRoute()
  const selected = favorites.includes(dish.id)
  return (
    <button
      type="button"
      className={`sm-heart ${selected ? 'is-active' : ''}`}
      aria-label={`${selected ? 'Quitar de' : 'Guardar en'} favoritos: ${dish.nombre}`}
      aria-pressed={selected}
      disabled={favoritesBusy}
      onClick={() => (account ? void favorite(dish.id) : go('cuenta/registro'))}
    >
      <Icon name="heart" filled={selected} />
    </button>
  )
}
// Rebaja informativa: `precioAntes` llega del catálogo ya con impuestos (como `precio`); solo cuenta si es mayor
// que el precio actual. El importe cobrado es siempre `precio`.
export function dealFor(dish: Dish): { antes: number; porcentaje: number } | null {
  const antes = dish.atributos?.precioAntes
  if (!antes || antes <= dish.precio) return null
  const porcentaje = Math.round((1 - dish.precio / antes) * 100)
  return porcentaje > 0 ? { antes, porcentaje } : null
}
export function PriceBlock({ dish }: { dish: Dish }) {
  const deal = dealFor(dish)
  return (
    <div className="sm-food-price">
      <strong>{money(dish.precio)}</strong>
      {deal && (
        <span className="sm-food-deal">
          <em>-{deal.porcentaje}%</em>
          <s aria-label={`Antes ${money(deal.antes)}`}>{money(deal.antes)}</s>
        </span>
      )}
    </div>
  )
}
export function PrepTime({ dish }: { dish: Dish }) {
  const minutes = dish.atributos?.tiempoPreparacion
  if (!minutes) return null
  return <span className="sm-food-time"><Icon name="clock" />{minutes} min</span>
}
function FoodCard({ dish }: { dish: Dish }) {
  const { href } = useSmartRoute()
  const {add,busy} = useDinerStore()
  const [quickAdded,setQuickAdded] = useState(false)
  const adding = useRef(false)
  return (
    <article className="sm-food-card">
      <Heart dish={dish} />
      <Link href={href('plato', dish.id)} className="sm-food-link">
        <FoodPhoto dish={dish} />
        <DishRating dish={dish}/>
        <PriceBlock dish={dish} />
        <h3>{dish.nombre}</h3>
        <div className="sm-food-bottom">
          <PrepTime dish={dish} />
          {dish.agotado && <span className="sm-sold-out">Agotado</span>}
        </div>
      </Link>
      <button className="sm-quick-add" aria-label={`${quickAdded?'Añadido':'Agregar'}: ${dish.nombre}`} disabled={busy||dish.agotado} onClick={async()=>{if(adding.current)return;adding.current=true;try{await add(dish.id,1,'');setQuickAdded(!useDinerStore.getState().error)}finally{adding.current=false}}}><Icon name={quickAdded?'check':'plus'}/></button>
    </article>
  )
}
export function SmartBrowse({
  entry,
  favoritesOnly = false,
}: {
  entry: Entry
  favoritesOnly?: boolean
}) {
  const { account, favorites, call, busy } = useDinerStore()
  const { go, href } = useSmartRoute()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const [called, setCalled] = useState(false)
  const dishes = [
    ...new Map(
      entry.carta.categorias.flatMap((c) => c.productos).map((d) => [d.id, d]),
    ).values(),
  ]
  const normalized = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
  const shown = dishes.filter(
    (d) =>
      (!favoritesOnly || favorites.includes(d.id)) &&
      (!category || d.categorias.includes(category)) &&
      normalized(`${d.nombre} ${d.descripcion ?? ''}`).includes(
        normalized(query),
      ),
  )
  const featured =
    dishes.find((d) => d.favorito && d.foto && !d.agotado) ??
    dishes.find((d) => d.foto && !d.agotado)
  const highlights = dishes.filter(d => d.favorito && d.foto && !d.agotado)
  const featuredDishes = highlights.length ? highlights : featured ? [featured] : []
  return (
    <>
      <SmartHeader entry={entry} current="carta" />
      <div className="sm-greeting">
        <h1>{favoritesOnly ? 'Tus favoritos' : 'Elige el mejor plato para ti'}</h1>
      </div>
      {favoritesOnly && !account ? (
        <Empty
          icon="heart"
          title="Tus antojos, siempre contigo"
          action="Crear mi cuenta"
          onAction={() => go('cuenta/registro')}
        >
          Guarda los platos que te encantan y encuéntralos aquí en tu próxima
          visita.
        </Empty>
      ) : (
        <>
          <div className="sm-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Buscar en el menú"
              placeholder="Busca tu próximo favorito"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery('')}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          {!favoritesOnly&&!query&&entry.banners!=null&&<MenuBanners banners={entry.banners} dishes={dishes} onCategory={id=>{setCategory(id);document.querySelector('.sm-categories')?.scrollIntoView({behavior:'smooth',block:'start'})}}/>}
          {!favoritesOnly && !query && entry.banners==null && featuredDishes.length > 0 && (
            <div className="sm-featured-rail" aria-label="Platos destacados">{featuredDishes.map(featured => <Link key={featured.id} href={href('plato', featured.id)} className="sm-featured">
              <div>
                <span>Plato destacado</span>
                <h2>{featured.nombre}</h2>
                <strong>{money(featured.precio)}</strong>
                <span className="sm-featured-action">
                  Descubrir plato <Icon name="arrow" />
                </span>
              </div>
              <FoodPhoto dish={featured} />
            </Link>)}</div>
          )}
          {!query && <nav className="sm-categories" aria-label="Categorías del menú">
            <button
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              Todos los platos
            </button>
            {entry.carta.categorias.map((c) => (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.nombre}
              </button>
            ))}
          </nav>}
          {shown.length ? (
            !query && !favoritesOnly && category === null ? (
              <div className="sm-menu-sections">
                {entry.carta.categorias.map((section) => (
                  <section key={section.id}>
                    <div className="sm-section-heading"><h2>{section.nombre}</h2></div>
                    <div className="sm-food-rail">{section.productos.map((dish) => <FoodCard key={dish.id} dish={dish} />)}</div>
                  </section>
                ))}
              </div>
            ) : <section><div className="sm-section-heading"><h2>{favoritesOnly ? 'Tus platos guardados' : query ? 'Resultados' : entry.carta.categorias.find(c => c.id === category)?.nombre}</h2><span>{shown.length} {shown.length === 1 ? 'plato' : 'platos'}</span></div><div className={favoritesOnly ? "sm-food-grid" : "sm-food-list"}>{shown.map(dish => <FoodCard key={dish.id} dish={dish} />)}</div></section>
          ) : (
            <Empty
              icon={favoritesOnly ? 'heart' : 'search'}
              title={
                favoritesOnly
                  ? 'Aquí empieza tu lista'
                  : 'No encontramos ese plato'
              }
            >
              {favoritesOnly
                ? 'Toca el corazón de un plato para guardarlo.'
                : 'Prueba con otro nombre o categoría.'}
            </Empty>
          )}
        </>
      )}
      {entry.carta.imagenesDeReferencia && (
        <p className="sm-footnote">
          Algunas fotografías son imágenes de referencia.
        </p>
      )}
      {entry.contexto.mesa && (
        <button
          disabled={busy || called}
          className="sm-waiter"
          onClick={async () => {
            if (await call()) setCalled(true)
          }}
        >
          <Icon name="bell" />
          {called
            ? 'Avisamos al mesero. Ya viene en camino.'
            : '¿Necesitas algo? Llama al mesero'}
        </button>
      )}
    </>
  )
}
export function SmartDish({ entry, id, onClose }: SmartProps & {onClose?:()=>void}) {
  const { add, addBundle, busy } = useDinerStore()
  const { go } = useSmartRoute()
  const [extras,setExtras] = useState<Record<number,number>>({})
  const [qty, setQty] = useState(1),
    [note, setNote] = useState(''),
    [added, setAdded] = useState(false)
  const [sending, setSending] = useState(false)
  const lock = useRef(false)
  const dish = entry.carta.categorias
    .flatMap((c) => c.productos)
    .find((d) => String(d.id) === id)
  if (!dish)
    return (
      <Empty
        title="Este plato no está disponible"
        action="Ver el menú"
        onAction={() => go('carta')}
      />
    )
  const submit = async () => {
    if (lock.current) return
    lock.current = true
    setSending(true)
    try {
      const selected=Object.entries(extras).filter(([,count])=>count>0)
      if(selected.length)await addBundle([{producto_id:dish.id,cantidad:qty,nota:note},...selected.map(([productId,count])=>({producto_id:Number(productId),cantidad:count,nota:`Acompaña: ${dish.nombre}`.slice(0,200)}))])
      else await add(dish.id, qty, note)
      if (!useDinerStore.getState().error) setAdded(true)
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  const attrs = dish.atributos
  const nutrition = ([['calorias','Calorías','kcal'],['peso','Porción','g'],['proteina','Proteína','g'],['carbohidratos','Carbos','g'],['grasa','Grasa','g'],['fibra','Fibra','g']] as const).filter(([key]) => typeof attrs?.nutricion?.[key] === 'number')
  const catalog = [...new Map(entry.carta.categorias.flatMap(c=>c.productos).map(d=>[d.id,d])).values()]
  const toppings = catalog.filter(d=>d.id!==dish.id && attrs?.extras?.includes(d.id))
  const sides = attrs?.acompanamientos
    ? catalog.filter(d=>d.id!==dish.id && !attrs?.extras?.includes(d.id) && attrs.acompanamientos?.includes(d.id))
    : catalog.filter(d=>d.id!==dish.id && !d.agotado && !attrs?.extras?.includes(d.id)).slice(0,3)
  const additions = [...toppings,...sides]
  const atExtraLimit = Object.values(extras).filter(count=>count>0).length>=19
  const changeExtra = (productId:number, count:number) => {setExtras(e=>({...e,[productId]:Math.max(0,Math.min(99,count))}));setAdded(false)}
  const counter = (extra:Dish) => <div className="sm-extra-counter"><button aria-label={`Menos ${extra.nombre}`} disabled={!extras[extra.id]||sending} onClick={()=>changeExtra(extra.id,(extras[extra.id]||0)-1)}><Icon name="minus"/></button><output aria-label={`Cantidad de ${extra.nombre}`}>{extras[extra.id]||0}</output><button aria-label={`Más ${extra.nombre}`} disabled={extra.agotado||sending||(extras[extra.id]||0)>=99||(atExtraLimit&&!extras[extra.id])} onClick={()=>changeExtra(extra.id,(extras[extra.id]||0)+1)}><Icon name="plus"/></button></div>
  const purchaseTotal = dish.precio*qty + additions.reduce((sum,d)=>sum+d.precio*(extras[d.id]||0),0)
  return (
    <>
      <div className="sm-dish-back"><button className="sm-icon" aria-label="Volver al menú" onClick={() => onClose ? onClose() : go('carta')}><Icon name="back" /></button><Heart dish={dish} /></div>
      <article className={`sm-dish-layout ${onClose ? 'sm-dish-sheet' : ''}`}>
        <header className="sm-dish-hero">
          <div className="sm-dish-orbits" aria-hidden="true" />
          <FoodPhoto dish={dish} className="sm-dish-photo" />
          <DishRating dish={dish}/><div className="sm-dish-heading"><h1>{dish.nombre}</h1><strong className="sm-price">{money(dish.precio)}</strong>{dealFor(dish)&&<span className="sm-food-deal"><em>-{dealFor(dish)!.porcentaje}%</em><s aria-label={`Antes ${money(dealFor(dish)!.antes)}`}>{money(dealFor(dish)!.antes)}</s></span>}<PrepTime dish={dish}/></div>
        </header>
        <div className="sm-dish-info">
          {dish.descripcion && (
            <p className="sm-description">{dish.descripcion}</p>
          )}
          {dish.foto && dish.fotoOrigen === 'ia' && (
            <p className="sm-footnote">Imagen de referencia</p>
          )}
          {!!nutrition.length && <dl className="sm-nutrition" aria-label="Información por porción">{nutrition.map(([key,label,unit])=><div key={key} aria-label={`${label}: ${attrs?.nutricion?.[key]} ${unit}`}><dt>{key==='calorias'?'kcal':key==='peso'?'gramos':label}</dt><dd>{attrs?.nutricion?.[key]}</dd></div>)}</dl>}
          {!!attrs?.combo?.length&&<section className="sm-ingredients"><h2>Este combo incluye</h2><ul>{attrs.combo.map(item=><li key={item.producto}>{item.cantidad} × {item.nombre}</li>)}</ul><p className="sm-note">El precio corresponde al combo completo.</p></section>}
          {!!attrs?.ingredientes?.length && <section className="sm-ingredients"><h2>Ingredientes</h2><div>{attrs.ingredientes.map(ingredient=><span key={ingredient}><IngredientIllustration name={ingredient}/>{ingredient}</span>)}</div></section>}
          {!!attrs?.etiquetas?.length && (
            <div className="sm-tags">
              {attrs.etiquetas.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          {!!attrs?.alergenos?.length && (
            <div className="sm-note">
              <strong>Alérgenos</strong>
              <p>{attrs.alergenos.join(', ')}</p>
            </div>
          )}
          {!!toppings.length && <section className="sm-dish-toppings"><h2>Añade adicionales</h2><div>{toppings.map(extra=><div className="sm-topping" key={extra.id} data-selected={!!extras[extra.id]}><label><input type="checkbox" checked={!!extras[extra.id]} disabled={extra.agotado||sending||(atExtraLimit&&!extras[extra.id])} onChange={e=>changeExtra(extra.id,e.target.checked?1:0)}/><span>{extra.nombre}{extra.agotado&&<small>Agotado</small>}</span><strong>{money(extra.precio)}</strong></label>{!!extras[extra.id]&&counter(extra)}</div>)}</div></section>}
          {!!sides.length && <section className="sm-dish-sides"><h2>{attrs?.acompanamientos ? 'Acompañamientos recomendados' : 'También te puede gustar'}</h2><div>{sides.map(extra=><div className="sm-side" key={extra.id}><FoodPhoto dish={extra}/><div className="sm-side-info"><h3>{extra.nombre}</h3><DishRating dish={extra} reviews/>{extra.descripcion&&<p>{extra.descripcion}</p>}<strong>{money(extra.precio)}</strong>{extra.agotado&&<small>Agotado</small>}</div>{counter(extra)}</div>)}</div></section>}
          {atExtraLimit&&<p className="sm-footnote">Puedes elegir hasta 19 adicionales y acompañamientos distintos por plato.</p>}
          <div className="sm-dish-request"><label className="sm-field" htmlFor={`dish-note-${dish.id}`}><span>¿Alguna indicación para cocina?</span></label><div><textarea id={`dish-note-${dish.id}`} rows={3} maxLength={200} value={note} placeholder="Por ejemplo: sin cebolla" onChange={e=>{setNote(e.target.value);setAdded(false)}}/><span aria-live="off">{note.length}/200</span></div></div>
          <div className={`sm-dish-purchase ${added ? 'is-added' : ''}`}>
          <div className="sm-quantity-row">
            <span>Cantidad</span>
            <div className="sm-stepper">
              <button
                aria-label="Menos unidades"
                disabled={qty <= 1 || sending}
                onClick={() => {
                  setQty(qty - 1)
                  setAdded(false)
                }}
              >
                <Icon name="minus" />
              </button>
              <output>{qty}</output>
              <button
                aria-label="Más unidades"
                disabled={qty >= 99 || sending}
                onClick={() => {
                  setQty(qty + 1)
                  setAdded(false)
                }}
              >
                <Icon name="plus" />
              </button>
            </div>
          </div>
          {added ? (
            <div className="sm-added">
              <p role="status">
                <Icon name="check" />
                Agregado a tu pedido
              </p>
              <button className="sm-primary" onClick={() => go('pedido')}>
                Ver mi pedido
                <Icon name="bag" />
              </button>
              <button className="sm-text-button" onClick={() => go('carta')}>
                Seguir explorando
              </button>
            </div>
          ) : (
            <button
              className="sm-primary"
              disabled={dish.agotado || busy || sending}
              onClick={() => void submit()}
            >
              {dish.agotado ? (
                'Agotado por ahora'
              ) : sending ? (
                'Agregando…'
              ) : (
                <>
                  Agregar a mi pedido <span>{money(purchaseTotal)}</span>
                </>
              )}
            </button>
          )}
          </div>
        </div>
      </article>
    </>
  )
}
export function SmartExperience({
  route,
  ...props
}: SmartProps & { route: Route }) {
  const { cart, account, loadAccount, loadFavorites, session, error, preview } =
    useDinerStore()
  const { href } = useSmartRoute()
  useEffect(() => {
    if (session && !preview) void loadAccount()
  }, [session, loadAccount, preview])
  useEffect(() => {
    if (account && !preview) void loadFavorites()
  }, [account, loadFavorites, preview])
  const [cartActionTarget, setCartActionTarget] = useState<HTMLDivElement | null>(null)
  const screen = route.screen
  const count = (cart?.lineas ?? [])
    .filter((l) => l.mio)
    .reduce((n, l) => n + l.cantidad, 0)
  const showConfirm = screen === 'pedido' && !!cart?.lineas.length
  const showCart = count > 0 && ['portada', 'carta', 'favoritos', 'historial', 'cuenta'].includes(screen)
  return (
    <div className={`smart-menu sm-screen-${screen.replaceAll("/", "-")}`}>
      <div className="sm-page">
        {error && (
          <p className="sm-error" role="alert">
            {error}
          </p>
        )}
        {screen === 'portada' && <SmartHome entry={props.entry} />}
        {screen === 'carta' && (
          <SmartBrowse entry={props.entry} />
        )}
        {screen === 'favoritos' && (
          <SmartBrowse entry={props.entry} favoritesOnly />
        )}
        {screen === 'plato' && <SmartDish key={props.id} {...props} />}
        {screen === 'pedido' && <SmartCart actionTarget={cartActionTarget} />}
        {screen === 'pago' && <SmartPay />}
        {screen === 'reserva' && <SmartReservationPay entry={props.entry} rest={props.rest} venue={props.venue} token={props.id} />}
        {screen === 'estado' && <SmartStatus id={props.id} />}
        {screen === 'la-cuenta' && <SmartBill />}
        {screen === 'cuenta' && <SmartAccount />}
        {screen === 'cuenta/correo' && <SmartEmailEntry/>}
        {screen === 'cuenta/canal' && <SmartVerificationChannel/>}
        {screen === 'cuenta/lista' && <SmartRegisteredAccount/>}
        {screen === 'cuenta/tarjetas' && <SmartWallet key={account?.id||'guest'}/>}
        {screen === 'cuenta/recuperar' && <SmartPasswordReset request/>}
        {screen === 'cuenta/restablecer' && <SmartPasswordReset/>}
        {screen === 'cuenta/entrar' && <SmartPassword login/>}
        {screen === 'cuenta/clave' && <SmartPassword/>}
        {screen === 'cuenta/informacion' && <SmartAccountEdit key={account?.id || 'guest'} />}
        {screen === 'historial' && <SmartHistory />}
        {screen === 'ubicacion' && <SmartLocation entry={props.entry} rescan={props.id==='otra'}/>}
        {screen === 'recompensas' && <SmartRewards/>}
        {screen === 'opinion' && <SmartFeedback key={props.id} id={props.id}/>}
        {screen === 'recibo' && <SmartReceipt id={props.id} />}
        {screen === 'cuenta/registro' && <SmartSignup />}
        {screen === 'cuenta/codigo' && <SmartCode />}
      </div>
      {screen !== 'reserva' && <div className={`sm-action-dock${showCart || showConfirm ? ' sm-action-dock-pair' : ''}`}>
        <SmartChat key={`${props.rest}/${props.venue}/${props.token}`} entry={props.entry} rest={props.rest} venue={props.venue} token={props.token}/>
        {showConfirm && <div className="sm-confirm-slot" ref={setCartActionTarget}/>}
        {showCart && <Link href={href('pedido')} className="sm-cart-float">
          <span className="sm-count">{count}</span>
          <span>Mi pedido<small>{money(cart?.mio ?? 0)}</small></span>
        </Link>}
      </div>}

    </div>
  )
}
