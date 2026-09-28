'use client'
/* eslint-disable @next/next/no-img-element -- Original exported feedback illustrations. */
import {useEffect, useRef, useState} from 'react'
import {http} from '@/lib/services/api'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {FoodPhoto, Icon, Title, useSmartRoute} from './SmartMenu'
import {Recorrido} from './Recorrido'
import {prizeText} from '@/lib/domain/rewards'

type Feedback = {rating:number; comment:string; dishes:Record<string,number>}
type Item = {product_id:number; name:string; qty:number}
const labels = ['Muy mala','Mala','Regular','Buena','Excelente']

export function SmartFeedback({id}: {id:string|null}) {
 const {go} = useSmartRoute()
 const {entry,preview,account,template} = useDinerStore()
 const [existing,setExisting] = useState(false)
 const [step,setStep] = useState(0)
 const [rating,setRating] = useState(3)
 const [comment,setComment] = useState('')
 const [dishes,setDishes] = useState<Record<string,number>>({})
 const [items,setItems] = useState<Item[]>([])
 const [loading,setLoading] = useState(!!id)
 const [error,setError] = useState(id?'':'Abre una opinión desde el detalle de tu pedido.')
 const [saving,setSaving] = useState(false)
 const lock = useRef(false)
 const invitation = useRef<HTMLDialogElement>(null)
 useEffect(() => {
  let current=true
  if (!id) return
  http.get<{feedback:Feedback|null;items:Item[]}>(`/api/v1/pedidos/${id}/opinion/`).then(({data}) => {
   if(!current)return
   setItems(data.items)
   if(data.feedback){setExisting(true);setRating(data.feedback.rating);setComment(data.feedback.comment);setDishes(data.feedback.dishes)}
  }).catch(e => {if(current)setError(e.message)}).finally(() => {if(current)setLoading(false)})
  return () => {current=false}
 },[id])
 useEffect(() => {
  const dialog=invitation.current
  if(step===0 && !loading && !error)dialog?.showModal()
  return () => {if(dialog?.open)dialog.close()}
 },[step,loading,error])
 const submit = async () => {
  if(lock.current || preview || !id)return
  lock.current=true;setSaving(true);setError('')
  try {await http.put(`/api/v1/pedidos/${id}/opinion/`,{rating,comment,dishes});setStep(4)}
  catch(e) {setError(e instanceof Error ? e.message : 'No pudimos guardar tu opinión')}
  finally {lock.current=false;setSaving(false)}
 }
 // Plan N: la opinión de un pedido da un premio una vez (la primera vez que se guarda) y solo con cuenta verificada.
 const earned = !existing && account?.verificada ? template.acciones?.find(a => a.accion === 'opinion')?.premio : undefined
 const catalog = entry?.carta.categorias.flatMap(c => c.productos) || []
 return <section className="sm-journey sm-feedback" data-step={step}>
  <Title title="Tu experiencia" back="historial"/>
  {error && <p className="sm-error" role="alert">{error}</p>}
  {loading ? <p role="status">Cargando tu pedido…</p> : step===0 ? <>
   <div className="sm-feedback-backdrop"><img src="/smart-menu/wallet.png" alt=""/><h1>Gracias por tu visita</h1></div>
   <dialog ref={invitation} className="sm-feedback-invite" aria-labelledby="feedback-invite-title" onCancel={()=>go('historial')}>
    <button className="sm-icon" aria-label="Cerrar invitación" onClick={()=>go('historial')}><Icon name="close"/></button>
    <img src="/smart-menu/stars.png" alt=""/>
    <h2 id="feedback-invite-title">¿Cómo estuvo tu visita?</h2>
    <p>Nos encantaría conocer tu experiencia para seguir mejorando.</p>
    <button className="sm-primary" disabled={!!error} onClick={()=>setStep(1)}>Valorar mi experiencia</button>
   </dialog>
   <div className="sm-journey-footer"><button className="sm-text-button" onClick={()=>go('historial')}>En otro momento</button></div>
  </> : step===1 ? <>
   <h1>¿Qué te pareció la experiencia?</h1>
   <div className="sm-rating-hero"><img src={`/smart-menu/rating-${rating}.png`} alt=""/></div>
   <h2 aria-live="polite">{labels[rating-1]}</h2>
   <div className="sm-rating-control">
    <input className="sm-rating-range" aria-label="Valoración de la experiencia" aria-valuetext={labels[rating-1]} type="range" min="1" max="5" value={rating} onChange={e=>setRating(Number(e.target.value))}/>
    <div className="sm-rating-scale">{labels.map((label,i)=><button key={label} aria-label={`${i+1}: ${label}`} aria-pressed={rating===i+1} onClick={()=>setRating(i+1)}>{i+1}</button>)}</div>
   </div>
   <div className="sm-journey-footer"><button className="sm-text-button" onClick={()=>go('historial')}>En otro momento</button><button className="sm-primary" onClick={()=>setStep(rating<4?2:3)}>Continuar</button></div>
  </> : step===2 ? <>
   <h1>¿Qué te pareció la experiencia?</h1>
   <div className="sm-rating-hero sm-rating-small"><img src={`/smart-menu/rating-${rating}.png`} alt=""/></div>
   <h2>{labels[rating-1]}</h2>
   <div className="sm-field sm-feedback-comment"><label htmlFor="feedback-comment">Tu comentario (opcional)</label><div><textarea id="feedback-comment" maxLength={250} placeholder="¿Qué podemos mejorar?" value={comment} onChange={e=>setComment(e.target.value)} rows={4}/><small>{comment.length}/250</small></div></div>
   <div className="sm-journey-footer"><button className="sm-text-button" onClick={()=>setStep(1)}>Cambiar valoración</button><button className="sm-primary" onClick={()=>setStep(3)}>Continuar</button></div>
  </> : step===3 ? <>
   <h1>¿Y qué tal tus platos?</h1>
   <div className="sm-dish-ratings">{items.map(item=><article key={item.product_id}>
    <FoodPhoto dish={catalog.find(d=>d.id===item.product_id)||{id:item.product_id,nombre:item.name,precio:0,agotado:false,categorias:[]}}/>
    <h2>{item.name}</h2>
    <div role="group" aria-label={`Valorar ${item.name}`}>{labels.map((label,i)=><button key={label} aria-label={`${i+1}: ${label}`} aria-pressed={dishes[item.product_id]===i+1} disabled={saving} onClick={()=>setDishes(d=>{const next={...d};if(next[item.product_id]===i+1)delete next[item.product_id];else next[item.product_id]=i+1;return next})}><img src={`/smart-menu/rating-${i+1}.png`} alt=""/>{dishes[item.product_id]===i+1&&<small>{label}</small>}</button>)}</div>
   </article>)}</div>
   <div className="sm-journey-footer"><button className="sm-text-button" disabled={saving} onClick={()=>setStep(2)}>Agregar un comentario</button><button className="sm-primary" disabled={saving||!!preview} onClick={()=>void submit()}>{saving?'Guardando…':'Enviar mi opinión'}</button></div>
  </> : <>
   <Recorrido ilustracion="/smart-menu/stars.png" titulo="¡Gracias por compartir!" texto={earned?`Tu opinión quedó guardada y ganaste ${prizeText(earned)}. Míralo en Mis recompensas.`:'Tu opinión quedó guardada para este pedido.'} textoAtributos={{role:'status'}} acciones={<><button className="sm-primary" onClick={()=>go('historial')}>Ver mis pedidos</button><button className="sm-text-button" onClick={()=>go('ubicacion','otra')}>Escanear otra mesa</button></>}/>
  </>}
 </section>
}
