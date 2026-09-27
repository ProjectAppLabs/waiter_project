'use client'
/* eslint-disable @next/next/no-img-element -- Admin-provided banner image. */
import Link from 'next/link'
import type {Dish,MenuBanner} from '@/lib/types'
import {FoodPhoto,Icon,money,useSmartRoute} from './SmartMenu'
import './smart-tokens.css'
import './smart-banners.css'
export function MenuBanners({banners,dishes,onCategory}:{banners:MenuBanner[];dishes:Dish[];onCategory:(id:number)=>void}){
 const {href}=useSmartRoute()
 if(!banners.length)return null
 return <div className="sm-banner-rail" aria-label="Destacados del restaurante">{banners.map((b,i)=>{
  const product=b.target==='product'?dishes.find(d=>d.id===b.targetId):undefined
  const content=b.layout==='image'?<img className="sm-banner-full" src={b.image} alt={b.title}/>:<><div className="sm-banner-copy"><span className="sm-banner-label">{{product:product?.atributos?.combo?.length?'Combo destacado':'Plato destacado',promotion:'Promoción',category:'Explora el menú',notice:'Novedades',image:''}[b.layout]}</span><h2>{b.title}</h2>{b.subtitle&&<p>{b.subtitle}</p>}{product&&<strong>{product.nombre} · {money(product.precio)}</strong>}{b.target!=='none'&&<span className="sm-banner-cta">{b.button||'Ver más'}<Icon name="arrow"/></span>}</div>{b.image?<img className="sm-banner-photo" src={b.image} alt=""/>:product&&<FoodPhoto dish={product}/>}</>
  const className=`sm-promo-banner sm-banner-${b.layout} sm-banner-${b.theme}`
  return b.target==='product'?<Link className={className} href={href('plato',b.targetId!)} key={i}>{content}</Link>:b.target==='category'?<button className={className} onClick={()=>onCategory(b.targetId!)} key={i}>{content}</button>:<article className={className} key={i}>{content}</article>
 })}</div>
}
