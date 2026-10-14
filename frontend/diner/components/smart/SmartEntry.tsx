'use client'
/* eslint-disable @next/next/no-img-element -- Exporty illustrations and restaurant assets. */
import Link from 'next/link'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {Plantilla} from '@/components/plantillas/Renderizador'
import {usePlantilla} from '@/components/plantillas/usePlantilla'
import {useRouter} from 'next/navigation'
import type {EarnedReward,Entry} from '@/lib/types'
import {SmartHeader} from './SmartHome'
import {ShareLocation,PointsBalance,useRewards} from './SmartBenefits'
import {REWARD_ACTIONS,prizeText,prizeTitle} from '@/lib/domain/rewards'
import type {VenueLocation} from '@/lib/types'
import {applyCoupon,getEntry,getVenueLocation} from '@/lib/services/api'
import {pathFor} from '@/lib/domain/route'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {FoodPhoto, Icon, Title, money, useSmartRoute} from './SmartMenu'
import {Recorrido} from './Recorrido'
const slides = [
 ['onboarding-reviews.png','Descubre tu próximo favorito','Explora el menú, conoce los platos y elige a tu ritmo.'],
 ['onboarding-menu.png','Una elección más fácil','El asistente te ayuda a encontrar opciones según tus preferencias.'],
 ['onboarding-order.png','Disfruta mientras cocinamos','Envía tu pedido y sigue su preparación desde tu mesa.'],
 ['onboarding-favorites.png','Recuerda lo que te encanta','Guarda favoritos y vuelve a pedir desde tu historial.'],
]
export function SmartWelcome({entry}: {entry:Entry}) {
 const [step,setStep]=useState(-1)
 const {href}=useSmartRoute()
 const products=entry.carta.categorias.flatMap(c=>c.productos).filter(d=>d.foto)
 return <section className="sm-journey sm-intro sm-welcome">{step===-1?<><div className="sm-splash-plates">{products.slice(0,2).map(d=><FoodPhoto dish={d} key={d.id}/>)}</div><div className="sm-splash-name">{entry.contexto.marca.logo&&<img src={entry.contexto.marca.logo} alt=""/>}<h1>{entry.contexto.marca.nombre}</h1><p>Una experiencia deliciosa empieza aquí</p></div><div className="sm-journey-footer"><button className="sm-primary" onClick={()=>setStep(0)}>Comenzar<Icon name="arrow"/></button><Link href={href('portada')}>Ya conozco el menú</Link></div></>:step<4?<><button className="sm-icon" aria-label="Paso anterior" onClick={()=>setStep(step-1)}><Icon name="back"/></button><div className="sm-orbit-hero"><img src={`/smart-menu/${slides[step][0]}`} alt=""/></div><nav className="sm-slide-dots" aria-label="Introducción">{slides.map((s,i)=><button key={s[0]} aria-label={`Página ${i+1}`} aria-current={i===step?'step':undefined} onClick={()=>setStep(i)}/>)}</nav><h1>{slides[step][1]}</h1><p>{slides[step][2]}</p><div className="sm-journey-footer"><button className="sm-primary" onClick={()=>setStep(step+1)}>Continuar<Icon name="arrow"/></button><button className="sm-text-button" onClick={()=>setStep(4)}>Omitir introducción</button></div></>:<><div className="sm-orbit-hero"><img src="/smart-menu/stars.png" alt=""/></div><h1>Hazlo más personal</h1><p>Tu nombre, tus favoritos y tus pedidos te acompañan durante la visita.</p><div className="sm-journey-footer"><Link className="sm-primary" href={href('cuenta/correo')}>Continuar con correo</Link><Link className="sm-secondary" href={href('cuenta/entrar')}>Ya tengo una cuenta</Link><Link href={href('portada')}>Continuar como invitado</Link></div></>}</section>
}
export function SmartLocation({entry, rescan=false}: {entry:Entry;rescan?:boolean}) {
 const [step,setStep]=useState<'choose'|'scan'|'manual'|'list'|'detail'|'rescan'|'share'>(rescan?'rescan':'choose')
 const [venueInfo,setVenueInfo]=useState<VenueLocation|null>(null)
 const [distance,setDistance]=useState<number|null>(null)
 useEffect(()=>{let active=true;getVenueLocation(entry.contexto.restaurante.slug,entry.contexto.sede.slug).then(v=>{if(active)setVenueInfo(v)}).catch(()=>{});return()=>{active=false}},[entry.contexto.restaurante.slug,entry.contexto.sede.slug])
 const [code,setCode]=useState('')
 const [query,setQuery]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const scan=async(file:File|undefined)=>{
  if(!file)return
  if(file.size>12*1024*1024){setError('Elige una imagen de menos de 12 MB.');return}
  setBusy(true);setError('')
  const source=URL.createObjectURL(file)
  try{const {BrowserQRCodeReader}=await import('@zxing/browser');const result=await new BrowserQRCodeReader().decodeFromImageUrl(source);setCode(result.getText());setStep('manual')}catch{setError('No pudimos leer ese QR. Intenta con una foto más nítida o introduce el código.')}finally{URL.revokeObjectURL(source);setBusy(false)}
 }
 const router=useRouter()
 const {href}=useSmartRoute()
 const venue=entry.contexto.sede
 const join=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy)return
  setBusy(true);setError('')
  try {
   let token=code.trim()
   if(token.includes('/')) {
    const url=new URL(token,location.origin)
    const prefix=`/${entry.contexto.restaurante.slug}/${venue.slug}/t/`
    if(url.origin!==location.origin || !url.pathname.startsWith(prefix))throw new Error('Este enlace no corresponde a este restaurante.')
    token=url.pathname.slice(prefix.length).split('/')[0]
   }
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(token))throw new Error('Revisa el código de tu mesa.')
   await getEntry(entry.contexto.restaurante.slug,venue.slug,token)
   router.push(pathFor(entry.contexto.restaurante.slug,venue.slug,token,'portada'))
  }catch(e){setError(e instanceof Error?e.message:'No encontramos esta mesa')}finally{setBusy(false)}
 }
 return <section className="sm-journey">{step==='share'&&<div className="sm-location-nav"><SmartHeader entry={entry}/></div>}{step!=='share'&&<Title title="Tu restaurante"/>}{step!=='choose'&&step!=='share'&&<button className="sm-text-button" onClick={()=>{setStep('choose');setError('')}}><Icon name="back"/>Volver a las opciones</button>}{step==='share'?<ShareLocation venue={venueInfo} onManual={()=>setStep('list')} onLocated={d=>{setDistance(d);setStep('list')}}/>:step==='rescan'?<Recorrido ilustracion="/smart-menu/qr.png" titulo="Una nueva mesa, otra experiencia" texto="Escanea el código QR de tu mesa para abrir su menú y continuar tu visita." acciones={<><button className="sm-primary" onClick={()=>setStep('scan')}>Escanear código QR<Icon name="arrow"/></button><Link href={href('portada')}>Lo haré después</Link></>}/>:step==='choose'?<><h1>¿Dónde vas a disfrutar?</h1><p>Abre el menú de tu mesa o explora el restaurante.</p><div className="sm-home-options"><button className="sm-home-card" onClick={()=>setStep('scan')}><img src="/smart-menu/qr.png" alt=""/><h2>Código de tu mesa</h2><p>Escanea el QR con la cámara de tu teléfono o introduce su código aquí.</p><span className="sm-home-arrow"><Icon name="arrow"/></span></button><button className="sm-home-card" onClick={()=>setStep('share')}><img src="/smart-menu/location.png" alt=""/><h2>Elegir restaurante</h2><p>Consulta el local donde estás haciendo tu pedido.</p><span className="sm-home-arrow"><Icon name="arrow"/></span></button></div></>:step==='scan'?<><h1>Escanea el QR de tu mesa</h1><p>Abre la cámara o elige una foto del código. La imagen se procesa en tu dispositivo.</p><div className="sm-qr-viewfinder"><img src="/smart-menu/qr.png" alt=""/><span/></div><label className="sm-primary sm-scan-upload">{busy?'Leyendo QR…':'Escanear o elegir una foto'}<input aria-label="Foto del código QR" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>void scan(e.target.files?.[0])}/></label>{error&&<p className="sm-error" role="alert">{error}</p>}<button className="sm-secondary" onClick={()=>setStep('manual')}>Introducir código manualmente</button></>:step==='manual'?<Recorrido ilustracion="/smart-menu/qr.png" titulo="Introduce el código de tu mesa" texto="También puedes pegar el enlace que contiene el QR." cuerpo={<form onSubmit={e=>void join(e)}><label className="sm-field"><span>Código o enlace de la mesa</span><input required value={code} onChange={e=>setCode(e.target.value)} autoCapitalize="none" autoCorrect="off" maxLength={500}/></label>{error&&<p className="sm-error" role="alert">{error}</p>}<button className="sm-primary" disabled={busy}>{busy?'Buscando tu mesa…':'Abrir mi mesa'}<Icon name="arrow"/></button></form>}/>:step==='list'?<><h1>Elige tu restaurante</h1><label className="sm-field"><span>Buscar por nombre</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre del restaurante"/></label>{`${venue.nombre} ${entry.contexto.marca.nombre} ${venueInfo?.direccion||''}`.toLowerCase().includes(query.toLowerCase())?<button className="sm-venue-card" onClick={()=>setStep('detail')}><img src="/smart-menu/location.png" alt=""/><span><strong>{entry.contexto.marca.nombre}</strong><small>{venueInfo?.direccion||venue.nombre}{distance!==null&&` · A ${distance.toLocaleString('es-CO',{maximumFractionDigits:1})} km`}</small></span><Icon name="arrow"/></button>:<p>No encontramos un local con ese nombre.</p>}</>:<Recorrido ilustracion={entry.contexto.marca.logo||'/smart-menu/location.png'} titulo={entry.contexto.marca.nombre} texto={venueInfo?.direccion||venue.nombre} cuerpo={<>{venueInfo&&(venueInfo.direccion||venueInfo.latitud!==null)&&<a className="sm-text-button" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venueInfo.latitud!==null&&venueInfo.longitud!==null?`${venueInfo.latitud},${venueInfo.longitud}`:venueInfo.direccion)}`}>Cómo llegar</a>}{entry.contexto.marca.lema&&<p>{entry.contexto.marca.lema}</p>}</>} acciones={<><Link className="sm-primary" href={href('carta')}>Ver el menú<Icon name="arrow"/></Link><button className="sm-secondary" onClick={()=>setStep('manual')}>Conectar con mi mesa</button></>}/>}</section>
}
// Plan N: «Mis recompensas» reúne los puntos, lo que la persona ya ganó por sus acciones (Tus beneficios) y las acciones que
// aún le dan premio (Gana más). Sin cuenta, las acciones salen de la plantilla pública e invitan a crearla.
export function SmartRewards() {
 const {account,template,session}=useDinerStore()
 const {href,go}=useSmartRoute()
 const dialog=useRef<HTMLDialogElement>(null)
 const reward=template.descuento
 const rewards=useRewards()
 const [using,setUsing]=useState(''),[useError,setUseError]=useState('')
 const earned=rewards.data?.beneficios??[]
 const offers=(account&&rewards.data?.acciones?rewards.data.acciones:template.acciones??[])
  // Crear la cuenta con descuento ya lo anuncia el banner de primera compra; con cuenta, esa acción ya está hecha.
  .filter(o=>!o.hecha&&!(o.accion==='cuenta'&&(account||(reward.activo&&o.premio.tipo==='descuento'))))
 const firstPurchase=!!account?.descuentoDisponible&&reward.activo
 const useCoupon=async(codigo:string)=>{
  if(!session)return
  setUsing(codigo);setUseError('')
  try{const cart=await applyCoupon(session.id,codigo);useDinerStore.setState({cart});go('pedido')}
  catch(e){setUseError(e instanceof Error?e.message:'No pudimos aplicar el cupón')}
  finally{setUsing('')}
 }
 return <><Title title="Mis recompensas"/><section className="sm-rewards"><PointsBalance rewards={rewards}/><h1>Disfruta tus beneficios</h1>
  {/* El banner invita a crear la cuenta; con cuenta, la primera compra se ve en «Tus beneficios» mientras esté disponible. */}
  {reward.activo&&!account&&<RewardBanner porcentaje={reward.porcentaje} onOpen={()=>dialog.current?.showModal()}/>}
  {(firstPurchase||earned.length>0)&&<><h2>Tus beneficios</h2>{useError&&<p className="sm-error" role="alert">{useError}</p>}<ul className="sm-reward-list" aria-label="Tus beneficios">
   {firstPurchase&&<li className="sm-reward-item"><span className="sm-empty-icon"><Icon name="gift"/></span><span><strong>{reward.porcentaje}% en tu primera compra</strong><small>Por crear tu cuenta · Se aplica solo al confirmar tu pedido</small></span></li>}
   {earned.map(e=><li key={e.id} className="sm-reward-item" data-estado={e.estado}><span className="sm-empty-icon"><Icon name={e.premio.tipo==='cupon'?'ticket':e.premio.tipo==='puntos'?'star':'gift'}/></span>
    <span><strong>{prizeTitle(e.premio)}</strong><small>Por {REWARD_ACTIONS[e.accion].origen} · {earnedStatus(e)}</small></span>
    {e.premio.tipo==='cupon'&&e.estado==='disponible'&&session&&<button className="sm-text-button" disabled={!!using} onClick={()=>void useCoupon((e.premio as {codigo:string}).codigo)}>{using===e.premio.codigo?'Aplicando…':'Usar en mi pedido'}</button>}
   </li>)}
  </ul></>}
  {offers.length>0&&<><h2>Gana más</h2><ul className="sm-reward-list" aria-label="Gana más">{offers.map(o=><li key={o.accion}><Link className="sm-profile-link" href={href(account?REWARD_ACTIONS[o.accion].pantalla:'cuenta/registro')}>
   <span><strong>{REWARD_ACTIONS[o.accion].titulo}</strong><small>Gana {prizeText(o.premio)}{!account&&o.accion!=='cuenta'?' · Necesitas una cuenta verificada':''}</small></span><Icon name="arrow"/></Link></li>)}</ul></>}
  {!(reward.activo&&!account)&&!firstPurchase&&!earned.length&&!offers.length&&<p>El restaurante no tiene recompensas activas en este momento.</p>}
  <h2>Tu próxima experiencia</h2><Link className="sm-profile-link" href={href('favoritos')}><span><strong>Vuelve a tus favoritos</strong><small>Esos platos que vale la pena repetir.</small></span><Icon name="arrow"/></Link><Link className="sm-profile-link" href={href('historial')}><span><strong>Recuerda tus visitas</strong><small>Encuentra tus pedidos y valora tu experiencia.</small></span><Icon name="arrow"/></Link></section><dialog ref={dialog} className="sm-filter-dialog sm-reward-dialog"><button className="sm-icon" aria-label="Cerrar beneficio" onClick={()=>dialog.current?.close()}><Icon name="close"/></button><div className="sm-orbit-hero"><img src="/smart-menu/trophy.png" alt=""/></div><h1>{reward.porcentaje}% para tu primera visita</h1><p>Se aplica automáticamente sobre tu consumo elegible al confirmar el pedido. Puedes revisar el importe en el carrito.</p><Link className="sm-primary" href={href(account?'pedido':'cuenta/registro')}>{account?'Ver mi pedido':'Crear mi cuenta'}</Link></dialog></>
}

// Qué pasa con un premio ganado, en palabras del comensal.
function earnedStatus(e:EarnedReward) {
 if(e.estado==='usado')return 'Ya lo usaste'
 if(e.estado==='reservado')return 'Va en tu pedido actual'
 if(e.premio.tipo==='puntos')return 'Ya están en tu saldo'
 if(e.premio.tipo==='cupon')return e.premio.minimo>0?`Úsalo en una compra desde ${money(e.premio.minimo).replace(' ','\u00a0')}`:'Úsalo al confirmar tu pedido'
 return 'Se aplica solo al confirmar tu pedido'
}

// Plan K, paquete D: el banner de la primera compra (contrato «banner-recompensa»). El botón que abre el detalle es del código;
// «copia» es una ranura de envoltorio: la plantilla puede meter dentro la etiqueta, el título y la acción.
export function RewardBanner({porcentaje,onOpen}:{porcentaje:number;onOpen:()=>void}) {
 const {arbol,marker}=usePlantilla('banner-recompensa')
 const etiqueta=<small>Primera compra</small>
 const titulo=<h2>{porcentaje}% de descuento en tu pedido</h2>
 const accion=<button onClick={onOpen}>Ver beneficio</button>
 const imagen=<img src="/smart-menu/reward.png" alt=""/>
 const copia=(children:ReactNode)=><div>{children}</div>
 const factory=<>{copia(<>{etiqueta}{titulo}{accion}</>)}{imagen}</>
 return <article className="sm-reward-banner" {...marker}>{arbol?<Plantilla arbol={arbol} datos={{'recompensa.porcentaje':porcentaje,'recompensa.titulo':`${porcentaje}% de descuento en tu pedido`,'recompensa.etiqueta':'Primera compra'}} ranuras={{copia,etiqueta,titulo,accion,imagen}} fallback={factory}/>:factory}</article>
}
