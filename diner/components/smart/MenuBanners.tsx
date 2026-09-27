'use client'
/* eslint-disable @next/next/no-img-element -- Admin-provided banner image. */
import Link from 'next/link'
import type {Dish,MenuBanner} from '@/lib/types'
import {FoodPhoto,Icon,money,useSmartRoute} from './SmartMenu'
import { Plantilla } from '@/components/plantillas/Renderizador'
import { usePlantilla } from '@/components/plantillas/usePlantilla'
import type { TemplateData } from '@/lib/domain/plantillas'
import './smart-tokens.css'
import './smart-banners.css'
const LABELS: Record<MenuBanner['layout'], string> = { product: 'Plato destacado', promotion: 'Promoción', category: 'Explora el menú', notice: 'Novedades', image: '' }

// Datos que una plantilla del banner puede enlazar (contrato «banners» de experience/diseno/componentes/banners.json).
export function bannerTemplateData(b: MenuBanner, product?: Dish): TemplateData {
 const flyer = b.layout === 'image'
 return {
  'banner.titulo': b.title, 'banner.subtitulo': b.subtitle || null, 'banner.etiqueta': product?.atributos?.combo?.length ? 'Combo destacado' : LABELS[b.layout] || null,
  'banner.boton': b.button || 'Ver más', 'banner.tipo': b.layout, 'banner.flyer': flyer, 'banner.copia': !flyer, 'banner.accion': b.target !== 'none',
  'banner.producto': !!product, 'banner.producto.nombre': product?.nombre ?? null, 'banner.producto.precio': product?.precio ?? null,
  'banner.imagen': !!(b.image || product),
 }
}

// Un banner: la raíz (enlace, botón o artículo) es del código; dentro, la plantilla de la sede o el diseño de fábrica.
function BannerItem({ b, product, onCategory }: { b: MenuBanner; product?: Dish; onCategory: (id: number) => void }) {
 const { href } = useSmartRoute()
 const { arbol, marker } = usePlantilla('banners')
 const flyer = b.layout === 'image'
 const image = flyer ? <img className="sm-banner-full" src={b.image} alt={b.title}/> : b.image ? <img className="sm-banner-photo" src={b.image} alt=""/> : product ? <FoodPhoto dish={product}/> : null
 const cta = b.target !== 'none' ? <span className="sm-banner-cta">{b.button || 'Ver más'}<Icon name="arrow"/></span> : null
 const copy = <div className="sm-banner-copy"><span className="sm-banner-label">{product?.atributos?.combo?.length ? 'Combo destacado' : LABELS[b.layout]}</span><h2>{b.title}</h2>{b.subtitle && <p>{b.subtitle}</p>}{product && <strong>{product.nombre} · {money(product.precio)}</strong>}{cta}</div>
 const factory = flyer ? image : <>{copy}{image}</>
 const content = arbol ? <Plantilla arbol={arbol} datos={bannerTemplateData(b, product)} ranuras={{ imagen: image, copia: copy, cta }} fallback={factory}/> : factory
 const className = `sm-promo-banner sm-banner-${b.layout} sm-banner-${b.theme}`
 return b.target === 'product' ? <Link className={className} href={href('plato', b.targetId!)} {...marker}>{content}</Link>
  : b.target === 'category' ? <button className={className} onClick={() => onCategory(b.targetId!)} {...marker}>{content}</button>
  : <article className={className} {...marker}>{content}</article>
}

export function MenuBanners({banners,dishes,onCategory}:{banners:MenuBanner[];dishes:Dish[];onCategory:(id:number)=>void}){
 if(!banners.length)return null
 return <div className="sm-banner-rail" aria-label="Destacados del restaurante">{banners.map((b,i)=><BannerItem key={i} b={b} product={b.target==='product'?dishes.find(d=>d.id===b.targetId):undefined} onCategory={onCategory}/>)}</div>
}
