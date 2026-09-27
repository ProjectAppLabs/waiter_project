'use client'
/* eslint-disable @next/next/no-img-element -- Logo del restaurante servido por la API. */
import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import type {Entry} from '@/lib/types'
import {createReservationPayment,finishReservationPaymentTest,readReservationPayment,reservationPayContext,type PublicReservation} from '@/lib/services/payments'
import {OnlinePayPanel,type PayAdapter,type PayTexts} from './OnlinePayPanel'
import {Icon,useSmartRoute} from './SmartMenu'
import './smart-tokens.css'
import './smart-reservation.css'

const longDate=(iso:string)=>{const text=new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});return text.charAt(0).toUpperCase()+text.slice(1)}

// Página del enlace de pago del anticipo. Quien la abre no es un comensal en una mesa: es alguien a quien el restaurante
// le envió un enlace. Ve la marca del restaurante, su reserva (lo justo para reconocerla) y cómo pagar. El monto, los
// medios y el estado los decide el servidor; con el anticipo ya pagado o la reserva inactiva, no se ofrece cobrar.
export function SmartReservationPay({entry,rest,venue,token}:{entry:Entry;rest:string;venue:string;token:string|null}){
 const {href}=useSmartRoute()
 const [reservation,setReservation]=useState<PublicReservation|null>(null)
 const brand=entry.contexto.marca
 const name=brand.nombre||entry.carta.restaurante
 const adapter=useMemo<PayAdapter>(()=>({
   key:token??'',
   load:()=>reservationPayContext(rest,venue,token!),
   create:data=>createReservationPayment(rest,venue,token!,data),
   read:id=>readReservationPayment(rest,venue,token!,id),
   finishTest:id=>finishReservationPaymentTest(rest,venue,token!,id),
 }),[rest,venue,token])
 const texts:PayTexts={heading:'Anticipo de tu reserva',note:'Con este pago tu mesa queda confirmada',
  sandbox:'Modo de prueba · No se cobra dinero ni se marca pagada la reserva.',approved:'Anticipo recibido · Tu reserva está confirmada',
  unavailable:`${name} aún no recibe pagos en línea. Escríbele para pagar tu anticipo por otro medio.`,noAmount:'Esta reserva no tiene un anticipo pendiente.',refresh:'Actualizar'}
 // La pestaña dice qué es esto: quien llega por un enlace no está «en la carta».
 useEffect(()=>{const before=document.title;document.title=`Pagar anticipo · ${name}`;return()=>{document.title=before}},[name])
 // Un grupo grande puede apartar varias mesas; un servidor anterior a eso solo manda la principal.
 const tables=reservation?.table_numbers?.length?reservation.table_numbers:[reservation?.table_number??0]
 const settled=reservation&&(reservation.deposit_state!=='pending'||!['confirmed','seated'].includes(reservation.state))
 return <div className="sm-reservation">
  <header className="sm-reservation-brand">{brand.logo?<img src={brand.logo} alt=""/>:<span aria-hidden="true"><Icon name="plate"/></span>}<div><strong>{name}</strong><small>{entry.contexto.sede.nombre}</small></div></header>
  {!token?<p className="sm-error" role="alert">Este enlace de pago no es válido.</p>:<>
   {reservation&&<section className="sm-reservation-ticket" aria-label="Tu reserva">
    <p className="sm-reservation-hello">{reservation.customer?`Hola, ${reservation.customer}`:'Hola'}</p>
    <h1>{longDate(reservation.date)}</h1>
    <dl>
     <div><dt><Icon name="clock"/>Hora</dt><dd>{reservation.time_label}</dd></div>
     <div><dt><Icon name="user"/>Personas</dt><dd>{reservation.people}</dd></div>
     <div><dt><Icon name="plate"/>{tables.length>1?'Mesas':'Mesa'}</dt><dd>{tables.length>1?`${tables.slice(0,-1).join(', ')} y ${tables[tables.length-1]}`:tables[0]}</dd></div>
    </dl>
    <p className="sm-reservation-code">Reserva {reservation.code}</p>
   </section>}
   {settled?<section className="sm-reservation-done" aria-live="polite">
     <span className="sm-reservation-mark" data-tone={reservation.deposit_state==='paid'?'ok':'muted'}><Icon name={reservation.deposit_state==='paid'?'check':'clock'}/></span>
     <h2>{reservation.deposit_state==='paid'?'Tu anticipo ya está pagado':['cancelled','no_show'].includes(reservation.state)?'Esta reserva ya no está activa':'Esta reserva no tiene costo'}</h2>
     <p>{reservation.deposit_state==='paid'?`Te esperamos en ${name}.`:['cancelled','no_show'].includes(reservation.state)?`Si crees que es un error, comunícate con ${name}.`:'No hay nada que pagar. Te esperamos.'}</p>
    </section>
    :<OnlinePayPanel adapter={adapter} texts={texts} onContext={c=>setReservation((c as {reservation?:PublicReservation}).reservation??null)}/>}
  </>}
  <Link className="sm-text-button sm-reservation-menu" href={href('carta')}>Ver el menú de {name}</Link>
 </div>
}
