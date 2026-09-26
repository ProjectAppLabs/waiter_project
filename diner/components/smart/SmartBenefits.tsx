'use client'
/* eslint-disable @next/next/no-img-element -- Original Exporty assets. */
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import type {DinerRewards,OrderStatus,VenueLocation} from '@/lib/types'
import {applyCoupon,getRewards} from '@/lib/services/api'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {SmartHeader} from './SmartHome'
import {Icon,money,useSmartRoute} from './SmartMenu'
import {Recorrido} from './Recorrido'

export function ShareLocation({venue,onLocated,onManual}:{venue:VenueLocation|null;onLocated:(distance:number|null)=>void;onManual:()=>void}) {
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const locate=()=>{
  setError('')
  if(!window.isSecureContext || !navigator.geolocation){setError('Este navegador necesita una conexión HTTPS para compartir tu ubicación. Puedes buscar el restaurante manualmente.');return}
  setBusy(true)
  navigator.geolocation.getCurrentPosition(position=>{
   const {latitude,longitude}=position.coords
   let distance:number|null=null
   if(venue?.latitud!==null&&venue?.longitud!==null&&venue){
    const rad=Math.PI/180, deltaLat=(venue.latitud-latitude)*rad,deltaLon=(venue.longitud-longitude)*rad
    const a=Math.sin(deltaLat/2)**2+Math.cos(latitude*rad)*Math.cos(venue.latitud*rad)*Math.sin(deltaLon/2)**2
    distance=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))
   }
   setBusy(false);onLocated(distance)
  },e=>{setBusy(false);setError(e.code===1?'No se compartió tu ubicación. Puedes elegir el restaurante manualmente.':'No pudimos obtener tu ubicación. Intenta otra vez o busca el restaurante.')},{enableHighAccuracy:false,timeout:10000,maximumAge:60000})
 }
 return <div className="sm-share-location"><div className="sm-share-location-copy"><img src="/smart-menu/location.png" alt=""/><h1>Comparte tu ubicación<br/>para hacer tu pedido</h1><p>Permite el acceso a tu ubicación para consultar la distancia al restaurante o búscalo manualmente.</p></div>{error&&<p className="sm-error" role="alert">{error}</p>}<div className="sm-journey-footer"><button className="sm-text-button" onClick={onManual}>Introducir una ubicación</button><button className="sm-primary" disabled={busy} onClick={locate}>{busy?'Buscando tu ubicación…':'Continuar'}</button></div></div>
}

export function CouponField() {
 const {cart,session,refreshBill,preview,busy:storeBusy}=useDinerStore()
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const selected=cart?.descuento?.codigo
 const submit=async(remove=false)=>{
  if(!session||busy||preview)return
  setBusy(true);setError('')
  try{const cart=await applyCoupon(session.id,remove?null:code.trim());useDinerStore.setState({cart});await refreshBill();if(remove)setCode('')}
  catch(e){setError(e instanceof Error?e.message:'No se pudo aplicar el cupón')}
  finally{setBusy(false)}
 }
 return <div className="sm-coupon"><form className="sm-coupon-input" data-applied={!!selected&&!cart?.descuento?.error} onSubmit={e=>{e.preventDefault();void submit()}}><span aria-hidden="true">%</span><input aria-label="Código de descuento" placeholder="Código de descuento" value={selected||code} disabled={!!selected||busy||storeBusy} maxLength={32} autoCapitalize="characters" autoCorrect="off" onChange={e=>setCode(e.target.value.toUpperCase())}/>{selected?<><span className="sm-coupon-check" aria-label="Cupón seleccionado"><Icon name="check"/></span><button type="button" aria-label="Quitar cupón" disabled={busy||storeBusy} onClick={()=>void submit(true)}><Icon name="close"/></button></>:<button type="submit" disabled={busy||storeBusy||!session||!code.trim()||!!preview}>{busy?'…':'Aplicar'}</button>}</form>{(error||cart?.descuento?.error)&&<p className="sm-error" role="alert">{error||cart?.descuento?.error}</p>}{selected&&<small>Aplicado a tus platos por confirmar. No se acumula con primera compra.</small>}</div>
}

export function PointsBalance() {
 const {keys,account}=useDinerStore(),{href}=useSmartRoute()
 const [data,setData]=useState<DinerRewards|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;if(!keys||!account)return;getRewards(keys.rest,keys.venue).then(r=>{if(active){setData(r);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[keys,account,retry])
 if(!account)return <Link className="sm-profile-link" href={href('cuenta/entrar')}>Entra a tu cuenta para ver tus puntos<Icon name="arrow"/></Link>
 return <section className="sm-points-balance"><img src="/smart-menu/points.png" alt=""/><h2>Tus puntos</h2>{error?<><p role="alert">{error}</p><button className="sm-secondary" onClick={()=>setRetry(retry+1)}>Reintentar</button></>:!data?<p>Consultando tus beneficios…</p>:data.tarjeta?<><strong>{data.puntos.toLocaleString('es-CO',{maximumFractionDigits:2})} puntos</strong><p>{data.programa}</p><p>Equivalen a {money(Math.max(0,data.puntos)*data.valorPunto)} de descuento. Canje desde {data.minimoCanje} puntos.</p><div className="sm-member-code"><small>Presenta este código al pagar en el POS</small><b>{data.codigo}</b></div><p className="sm-footnote">Los puntos se acreditan al pagar. Las devoluciones ajustan tu saldo.</p></>:<p>El restaurante aún no tiene un programa de puntos activo.</p>}</section>
}

export function PaidCelebration({order}:{order:OrderStatus}) {
 const dialog=useRef<HTMLDialogElement>(null),{href}=useSmartRoute()
 const entry=useDinerStore(s=>s.entry)
 const rewards=order.recompensas
 useEffect(()=>{if(rewards&&rewards.ganados>0){dialog.current?.showModal();dialog.current?.focus()}},[rewards?.ganados,order.id,rewards])
 return <>{entry&&<SmartHeader entry={entry}/>}<section className="sm-journey sm-intro sm-paid-celebration"><Recorrido ilustracion="/smart-menu/payment.png" titulo="¡Gracias por tu visita!" texto="Tu pago fue registrado en el restaurante." cuerpo={rewards&&rewards.ganados>0&&<button className="sm-secondary" onClick={()=>dialog.current?.showModal()}>Ver los puntos de este pedido</button>} acciones={<><Link className="sm-primary" href={href('carta')}>Volver al menú</Link><Link href={href('recompensas')}>Mis recompensas</Link></>}/><dialog ref={dialog} tabIndex={-1} aria-label="Puntos ganados" className="sm-filter-dialog sm-earned-dialog"><div className="sm-earned-copy"><img src="/smart-menu/points.png" alt=""/><div><h2>¡Felicitaciones!</h2><p>Ganaste <strong>{rewards?.ganados.toLocaleString('es-CO',{maximumFractionDigits:2})} puntos</strong> con este pedido. Úsalos en tu próxima visita desde <Link href={href('recompensas')}>Mis recompensas</Link>.</p></div></div><button className="sm-text-button" onClick={()=>dialog.current?.close()}>Guardar para mi próximo pedido</button><Link className="sm-primary" href={href('recompensas')}>Ir a Mis recompensas</Link></dialog></section></>
}
