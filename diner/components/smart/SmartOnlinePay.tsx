'use client'
import { dinerHas } from '@/lib/domain/modules'
import {useMemo} from 'react'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {finishPaymentTest,createPayment,paymentContext,readPayment} from '@/lib/services/payments'
import {OnlinePayPanel,type PayAdapter,type PayTexts} from './OnlinePayPanel'
import {Title,useSmartRoute} from './SmartMenu'

const TEXTS:PayTexts={heading:'Tu cuenta',note:'Impuestos incluidos · Saldo completo',sandbox:'Modo de prueba · No se cobra dinero ni se cierra la cuenta del POS.',
 approved:'Pago recibido · Pedido enviado a cocina',unavailable:'El restaurante aún no ha habilitado los pagos en línea. Puedes pagar con el mesero.',
 noAmount:'Confirma primero los platos de tu pedido para conocer el saldo a pagar.',refresh:'Actualizar cuenta'}

// Pagar la cuenta de la visita. Todo lo del pago vive en OnlinePayPanel; aquí solo se dice de dónde salen los datos
// (la sesión del comensal) y qué se ofrece alrededor: seguir el pedido, volver al menú o pagar con el mesero.
export function SmartOnlinePay(){
 const {session,ensureSession,preview,confirm}=useDinerStore()
 const {go}=useSmartRoute()
 const adapter=useMemo<PayAdapter>(()=>({
   key:session?.id??'',
   load:async()=>{const s=await ensureSession();if(!s)throw new Error('No se pudo abrir la sesión.');return paymentContext(s.id)},
   create:data=>createPayment(session!.id,data),read:id=>readPayment(session!.id,id),finishTest:id=>finishPaymentTest(session!.id,id),
 }),[session,ensureSession])
 // Plan W: sin el módulo de pagos en línea, se paga con el mesero (como cuando el restaurante no tiene pasarela).
 if(!dinerHas(useDinerStore.getState().entry,'pagos_en_linea'))return <><Title title="Pagar mi cuenta" back="pedido"/><p className="sm-note" role="status">{TEXTS.unavailable}</p><button className="sm-primary" onClick={async()=>{const id=await confirm();if(id)go('la-cuenta')}}>Pagar con el mesero</button></>
 return <><Title title="Pagar mi cuenta" back="pedido"/><OnlinePayPanel adapter={adapter} texts={TEXTS} disabled={Boolean(preview)}
  resultActions={payment=><>{payment.reconciled&&payment.order_id&&<button className="sm-primary" onClick={()=>go('estado',payment.order_id)}>Seguir mi pedido</button>}<button className="sm-text-button" onClick={()=>go('carta')}>Volver al menú</button></>}
  formActions={busy=><button type="button" className="sm-text-button" disabled={busy} onClick={async()=>{const id=await confirm();if(id)go('la-cuenta')}}>Pagar con el mesero</button>}/></>
}
