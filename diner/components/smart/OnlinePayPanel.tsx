'use client'
/* eslint-disable @next/next/no-img-element -- Wompi supplies a transaction-specific QR image. */
import {useCallback,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {tokenizeCard,type PaymentContext,type OnlinePayment,type OnlineMethod} from '@/lib/services/payments'
import {money} from './SmartMenu'
import './smart-tokens.css'
import './smart-payments.css'

const METHODS:{id:OnlineMethod;name:string;hint:string;icon:string}[]=[
 {id:'BANCOLOMBIA_TRANSFER',name:'Bancolombia',hint:'Paga desde tu cuenta',icon:'↗'},
 {id:'BANCOLOMBIA_QR',name:'Código QR',hint:'Escanea el valor exacto',icon:'▦'},
 {id:'NEQUI',name:'Nequi',hint:'Aprueba desde tu app',icon:'◈'},
 {id:'CARD',name:'Tarjeta',hint:'Crédito o débito',icon:'▰'},
]
const terminal=(p:OnlinePayment)=>['APPROVED','DECLINED','ERROR','VOIDED'].includes(p.status)
const errorText=(e:unknown)=>e instanceof Error?e.message:'No pudimos consultar el pago.'
function uuid(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`}
const safeLink=(url?:string)=>url?.startsWith('https://')?url:undefined


// De dónde salen los datos del pago y cómo se habla de él. La cuenta de una visita y el anticipo de una reserva comparten
// todo lo delicado (consentimientos, tokenización directa a Wompi, resultado incierto, sondeo); solo cambian estas piezas.
export interface PayAdapter {
  // Cambia cuando hay que volver a cargar desde cero (otra sesión, otra reserva). '' = todavía no se puede consultar.
  key: string
  load: () => Promise<PaymentContext>
  create: (data: Record<string, unknown>) => Promise<OnlinePayment>
  read: (id: string) => Promise<OnlinePayment>
  finishTest?: (id: string) => Promise<void>
}
export interface PayTexts {
  heading: string; note: string; sandbox: string; approved: string; unavailable: string; noAmount: string; refresh: string
}
interface Props {
  adapter: PayAdapter; texts: PayTexts; disabled?: boolean
  resultActions?: (payment: OnlinePayment) => ReactNode; formActions?: (busy: boolean) => ReactNode
  onContext?: (context: PaymentContext) => void
}

export function OnlinePayPanel({adapter,texts,disabled=false,resultActions,formActions,onContext}:Props){
 const [context,setContext]=useState<PaymentContext|null>(null),[payment,setPayment]=useState<OnlinePayment|null>(null)
 const [method,setMethod]=useState<OnlineMethod>('BANCOLOMBIA_QR'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [accepted,setAccepted]=useState(false),[personal,setPersonal]=useState(false)
 const [uncertain,setUncertain]=useState(false)
 const lock=useRef(false),form=useRef<HTMLFormElement>(null)
 // El adaptador se lee por ref: sus funciones cierran sobre estado del padre y no deben relanzar la carga en cada render.
 const api=useRef(adapter),notify=useRef(onContext)
 useEffect(()=>{api.current=adapter;notify.current=onContext})
 // `fetchContext` solo cambia estado después de esperar a la red, así el efecto de carga no provoca renders en cascada.
 // `reload` es la versión de los botones: primero enseña que está cargando y luego consulta.
 const fetchContext=useCallback(async()=>{
   try{const c=await api.current.load();setContext(c);notify.current?.(c);setPayment(c.attempt);setUncertain(false);if(c.methods?.length)setMethod(m=>c.methods!.includes(m)?m:c.methods![0]);setError('')}
   catch(e){setError(errorText(e))}finally{setLoading(false)}
 },[])
 const reload=useCallback(async()=>{if(disabled)return;setLoading(true);setError('');await fetchContext()},[disabled,fetchContext])
 useEffect(()=>{if(!disabled)void fetchContext()},[adapter.key,disabled,fetchContext]) // method selection must not reload/reset a submitted payment
 useEffect(()=>{
   if(!payment||!adapter.key||terminal(payment))return
   let active=true;let timer:ReturnType<typeof setTimeout>;const until=Date.now()+5*60_000
   const poll=async()=>{try{const p=await api.current.read(payment.id);if(!active)return;setPayment(p);setError('');if(terminal(p))return}catch(e){if(active)setError(errorText(e))}if(active&&Date.now()<until)timer=setTimeout(poll,4500)}
   timer=setTimeout(poll,4500);return()=>{active=false;clearTimeout(timer)}
 },[payment?.id,adapter.key]) // eslint-disable-line react-hooks/exhaustive-deps -- el sondeo sigue al intento, no a cada cambio de estado
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
   e.preventDefault();if(lock.current||!adapter.key||!context?.available||!context.amount_in_cents||disabled||uncertain)return
   lock.current=true;setBusy(true);setError('');let sent=false
   try{
    const values=new FormData(e.currentTarget)
    const data:Record<string,unknown>={id:uuid(),method,email:values.get('email'),accepted,personal_data_accepted:personal,
      acceptance_token:context.acceptance?.token,accept_personal_auth:context.personal_data?.token,expected_amount_in_cents:context.amount_in_cents}
    if(method==='NEQUI')data.phone_number=values.get('phone')
    if(method==='CARD'){
      data.token=await tokenizeCard(context.environment!,context.public_key!,{number:String(values.get('number')).replace(/\s/g,''),cvc:String(values.get('cvc')),exp_month:String(values.get('month')).padStart(2,'0'),exp_year:String(values.get('year')).slice(-2),card_holder:String(values.get('holder'))})
      data.installments=Number(values.get('installments'))
      data.browser_info={browser_color_depth:String(window.screen.colorDepth),browser_screen_height:String(window.screen.height),browser_screen_width:String(window.screen.width),browser_language:navigator.language,browser_user_agent:navigator.userAgent.slice(0,600),browser_tz:String(new Date().getTimezoneOffset())}
      for(const name of ['number','cvc','month','year','holder']){const input=form.current?.elements.namedItem(name);if(input instanceof HTMLInputElement)input.value=''}
    }
    sent=true;setPayment(await api.current.create(data))
   }catch(e){setError(errorText(e));if(sent)setUncertain(true)}finally{lock.current=false;setBusy(false)}
 }
 const refresh=async()=>{if(!adapter.key||!payment)return;setBusy(true);try{setPayment(await api.current.read(payment.id));setError('')}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 const amount=payment?.amount_in_cents??context?.amount_in_cents??0
 const pending=loading&&!disabled
 const available=context?.available&&!context.other_payment_pending&&!disabled
 return <section className="sm-online-pay sm-narrow">
  <div className="sm-pay-heading"><span>{texts.heading}</span><strong aria-busy={pending&&!context}>{pending&&!context?'…':money(amount/100)}</strong><small>{texts.note}</small></div>
  {context?.environment==='test'&&<p className="sm-pay-sandbox">{texts.sandbox}</p>}
  {error&&<p className="sm-error" role="alert">{error}</p>}
  {payment?<div className="sm-pay-result" aria-live="polite">
    <h2>{payment.status==='APPROVED'?(payment.environment==='test'?'Prueba aprobada':payment.reconciled?texts.approved:'Pago aprobado · Confirmando con el restaurante'):payment.status==='DECLINED'?'Pago rechazado':payment.status==='ERROR'?'El pago no pudo completarse':payment.status==='VOIDED'?'Pago anulado':'Esperando tu pago'}</h2>
    {payment.card_brand==='MASTERCARD'&&<svg width="64" height="40" role="img" aria-label="Mastercard" viewBox="0 0 64 40"><circle cx="24" cy="20" r="18" fill="#eb001b"/><circle cx="42" cy="20" r="18" fill="#f79e1b" fillOpacity=".88"/></svg>}
    {!terminal(payment)&&payment.challenge_html&&<iframe className="sm-pay-challenge" title="Verificación de seguridad de tu banco" srcDoc={payment.challenge_html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/>}
    {payment.needs_review&&<p>El restaurante debe revisar la conciliación. No vuelvas a pagar.</p>}
    {!terminal(payment)&&payment.method==='BANCOLOMBIA_QR'&&(payment.qr_image?<><img className="sm-pay-qr" src={`data:image/svg+xml;base64,${payment.qr_image}`} alt={`QR para pagar ${money(amount/100)}`}/><p>Escanea desde la app de Bancolombia o Nequi.</p></>:<p>Estamos esperando el QR de tu transacción.</p>)}
    {!terminal(payment)&&payment.method==='NEQUI'&&<p>Abre Nequi en el celular indicado y aprueba la solicitud.</p>}
    {!terminal(payment)&&safeLink(payment.redirect_url??undefined)&&<a className="sm-primary" href={payment.redirect_url!} target="_blank" rel="noopener noreferrer">Continuar autorización bancaria ↗</a>}
    {payment.status==='UNKNOWN'&&<p>La respuesta de Wompi está pendiente. Conservamos esta operación para evitar cobrar dos veces.</p>}
    <p className="sm-footnote">Referencia: {payment.reference}</p>
    {(!terminal(payment)||(payment.status==='APPROVED'&&!payment.reconciled&&payment.environment==='prod'))&&<button className="sm-secondary" disabled={busy} onClick={()=>void refresh()}>Consultar estado</button>}
    {['DECLINED','ERROR'].includes(payment.status)&&<button className="sm-primary" onClick={()=>void reload()}>Elegir otro medio de pago</button>}
    {adapter.finishTest&&payment.environment==='test'&&payment.status==='APPROVED'&&<button className="sm-secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await adapter.finishTest!(payment.id);await reload()}catch(e){setError(errorText(e))}finally{setBusy(false)}}}>Finalizar prueba y volver a probar</button>}
    {resultActions?.(payment)}
  </div>:<form ref={form} onSubmit={e=>void submit(e)} className="sm-pay-form">
    {/* Sin pasarela habilitada no se enseñan medios ni botón de pagar: prometerían algo que no se puede hacer. */}
    {(pending||available)&&<div className="sm-pay-method-grid" role="group" aria-label="Medio de pago">{METHODS.map(m=><button key={m.id} type="button" aria-pressed={method===m.id} disabled={busy||!!context?.available&&!context.methods?.includes(m.id)} onClick={()=>setMethod(m.id)}><span className={`sm-pay-method-icon sm-pay-icon-${m.id}`} aria-hidden="true">{m.icon}</span><strong>{m.name}</strong><small>{m.hint}</small></button>)}</div>}
    {pending?<p role="status">Consultando medios de pago…</p>:!available?<p className="sm-note">{context?.other_payment_pending?'Otro comensal está pagando esta mesa. Espera su resultado.':texts.unavailable}</p>:<>
      {context?.amount_in_cents==null?<p className="sm-note">{texts.noAmount}</p>:<fieldset disabled={busy||uncertain}>
        <label className="sm-field"><span>Correo para el pago</span><input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        {method==='NEQUI'&&<label className="sm-field"><span>Celular registrado en Nequi</span><input name="phone" type="tel" inputMode="tel" placeholder="300 123 4567" pattern="3[0-9]{9}" maxLength={10} required/></label>}
        {method==='CARD'&&<div className="sm-pay-card-fields"><label className="sm-field"><span>Nombre del titular</span><input name="holder" autoComplete="cc-name" required minLength={5}/></label><label className="sm-field"><span>Número de tarjeta</span><input name="number" inputMode="numeric" autoComplete="cc-number" pattern="[0-9 ]{13,23}" required/></label><div className="sm-pay-card-row"><label className="sm-field"><span>Mes</span><input name="month" inputMode="numeric" autoComplete="cc-exp-month" placeholder="MM" pattern="(0?[1-9]|1[0-2])" maxLength={2} required/></label><label className="sm-field"><span>Año</span><input name="year" inputMode="numeric" autoComplete="cc-exp-year" placeholder="AA" pattern="[0-9]{2}" maxLength={2} required/></label><label className="sm-field"><span>CVV</span><input name="cvc" type="password" inputMode="numeric" autoComplete="cc-csc" pattern="[0-9]{3,4}" maxLength={4} required/></label></div><label className="sm-field"><span>Cuotas · Débito: una cuota</span><select name="installments" defaultValue="1">{[1,2,3,6,12,24,36].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>}
        <label className="sm-pay-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required/><span>Acepto los <a href={safeLink(context?.acceptance?.url)} target="_blank" rel="noopener noreferrer">términos y condiciones de Wompi</a>.</span></label>
        <label className="sm-pay-consent"><input type="checkbox" checked={personal} onChange={e=>setPersonal(e.target.checked)} required/><span>Autorizo el <a href={safeLink(context?.personal_data?.url)} target="_blank" rel="noopener noreferrer">tratamiento de datos personales</a>.</span></label>
      </fieldset>}
    </>}
    {uncertain?<button type="button" className="sm-secondary" onClick={()=>void reload()}>Consultar si se creó el pago</button>:(pending||available)&&<button className="sm-primary" type="submit" disabled={busy||pending||!available||!context?.methods?.includes(method)||!amount||!accepted||!personal}>{busy?'Procesando…':method==='BANCOLOMBIA_QR'?`Generar QR · ${money(amount/100)}`:`Pagar ${money(amount/100)}`}</button>}
    {!pending&&<button type="button" className="sm-text-button" disabled={busy} onClick={()=>void reload()}>{texts.refresh}</button>}
    {formActions?.(busy)}
  </form>}
 </section>
}
