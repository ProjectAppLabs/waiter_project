'use client'
import {useId,useRef,useState,type FormEvent} from 'react'
import Link from 'next/link'
import {useSearchParams} from 'next/navigation'
import {http} from '@/lib/services/api'
import {Recorrido} from './Recorrido'
import {useDinerStore} from '@/lib/stores/dinerStore'
import type {AccountSummary} from '@/lib/types'
import {Empty,Icon,Title,useSmartRoute} from './SmartMenu'
export function PasswordField({label,value,onChange,autoComplete}: {label:string;value:string;onChange:(value:string)=>void;autoComplete:string}) {
 const [visible,setVisible]=useState(false)
 const id=useId()
 return <div className="sm-field"><label htmlFor={id}>{label}</label><div className="sm-password-field"><input id={id} type={visible?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} required minLength={autoComplete==='new-password'?10:undefined} maxLength={128} placeholder=" "/><button type="button" aria-label={`${visible?'Ocultar':'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(!visible)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{!visible&&<path d="m3 3 18 18"/>}</svg></button></div></div>
}
export function SmartPassword({login=false}: {login?:boolean}) {
 return login ? <SmartPasswordForm/> : <SmartPasswordVerification/>
}
function SmartPasswordVerification() {
 const {account,preview}=useDinerStore()
 const {go}=useSmartRoute()
 const [busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('')
 const lock=useRef(false)
 const send=async()=>{
  if(lock.current||preview)return
  lock.current=true;setBusy(true);setError('')
  try{await http.post('/api/v1/cuenta/clave/',{});setSent(true)}catch(e){setError(e instanceof Error?e.message:'No pudimos enviar la verificación.')}finally{lock.current=false;setBusy(false)}
 }
 if(!account)return <Empty icon="user" title="Abre tu cuenta primero" action="Entrar a mi cuenta" onAction={()=>go('cuenta/entrar')}/>
 return <><Title title="Verifica tu identidad" back="cuenta"/><section className="sm-auth-form sm-narrow sm-account-edit"><h1>{sent?'Revisa tu correo':'Protege tu cuenta'}</h1><p>{sent?'Abre el enlace que enviamos a tu correo para elegir una nueva contraseña. Vence en 20 minutos y solo puede usarse una vez.':'Antes de crear o cambiar tu contraseña, verifica que tienes acceso al correo de tu cuenta.'}</p><strong className="sm-verification-email">{account.correo}</strong>{error&&<p className="sm-error" role="alert">{error}</p>}{sent?<p role="status">Enlace enviado. Tu contraseña todavía no ha cambiado.</p>:<button className="sm-primary" disabled={busy||!!preview} onClick={()=>void send()}>{busy?'Enviando…':'Enviar enlace de verificación'}<Icon name="arrow"/></button>}</section></>
}
function SmartPasswordForm() {
 const {preview}=useDinerStore()
 const {go,href}=useSmartRoute()
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
 const lock=useRef(false)
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(lock.current||preview)return
  lock.current=true;setSaving(true);setError('')
  try{const {data}=await http.post<AccountSummary>('/api/v1/cuenta/entrar/',{correo:email,clave:password});useDinerStore.setState({account:data.cuenta,accountOrders:data.pedidos});go('cuenta')}
  catch(e){setError(e instanceof Error?e.message:'No pudimos abrir tu cuenta.')}finally{lock.current=false;setSaving(false)}
 }
 return <><Title title="Bienvenido de nuevo" back="cuenta"/><form className="sm-auth-form sm-narrow sm-account-edit" onSubmit={e=>void submit(e)}><h1>Entra a tu cuenta</h1><label className="sm-field"><span>Correo electrónico</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={120}/></label><PasswordField label="Contraseña" value={password} onChange={setPassword} autoComplete="current-password"/>{error&&<p className="sm-error" role="alert">{error}</p>}<button className="sm-primary" disabled={saving||!!preview}>{saving?'Un momento…':'Entrar'}<Icon name="arrow"/></button><Link href={href('cuenta/recuperar')}>Olvidé mi contraseña</Link><p className="sm-note">Usa el correo y la contraseña que elegiste al crear tu cuenta.</p><Link href={href('cuenta/registro')}>Crear una cuenta</Link></form></>
}

export function SmartPasswordReset({request=false}: {request?:boolean}) {
 const search=useSearchParams()
 const {keys,preview}=useDinerStore()
 const {go}=useSmartRoute()
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [confirmation,setConfirmation]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [success,setSuccess]=useState(false)
 const lock=useRef(false)
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(lock.current||preview)return
  if(!request&&(password.length<10||password!==confirmation)){setMessage('Usa al menos 10 caracteres y repite la misma contraseña.');return}
  lock.current=true;setBusy(true);setMessage('')
  try{
   if(request){const {data}=await http.post('/api/v1/cuenta/recuperar/',{correo:email,restaurante:keys?.rest,sede:keys?.venue});setMessage(data.detail)}
   else {await http.post('/api/v1/cuenta/restablecer/',{token:search.get('token'),nueva:password});setPassword('');setConfirmation('');setSuccess(true)}
  }catch(e){setMessage(e instanceof Error?e.message:'No pudimos completar la solicitud')}finally{lock.current=false;setBusy(false)}
 }
 return <><Title title={request?'Recupera tu cuenta':'Nueva contraseña'} back="cuenta/entrar"/>{success?<section className="sm-journey sm-intro"><Recorrido ilustracion="/smart-menu/password.png" titulo="Contraseña restablecida" texto="Ya puedes entrar con tu nueva contraseña." acciones={<button className="sm-primary" onClick={()=>go('cuenta/entrar')}>Entrar a mi cuenta</button>}/></section>:<form className="sm-auth-form sm-narrow sm-account-edit" onSubmit={e=>void submit(e)}><h1>{request?'¿Olvidaste tu contraseña?':'Crea una nueva contraseña'}</h1><p>{request?'Escribe tu correo para solicitar un enlace de recuperación.':'El enlace solo puede utilizarse una vez.'}</p>{request?<label className="sm-field"><span>Correo electrónico</span><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>:<><PasswordField label="Nueva contraseña" value={password} onChange={setPassword} autoComplete="new-password"/><PasswordField label="Confirmar contraseña" value={confirmation} onChange={setConfirmation} autoComplete="new-password"/></>}{message&&<p role="status">{message}</p>}<button className="sm-primary" disabled={busy||!!preview}>{busy?'Un momento…':request?'Enviar enlace':'Guardar contraseña'}</button></form>}</>
}

export function SmartEmailEntry() {
 const {go}=useSmartRoute()
 const [email,setEmail]=useState('')
 return <section className="sm-journey sm-intro"><Title title="Tu correo" back="bienvenida"/><Recorrido titulo="Empecemos por tu correo" texto="Lo usarás para identificar tu cuenta." cuerpo={<form className="sm-auth-form" onSubmit={e=>{e.preventDefault();try{sessionStorage.setItem('smart-menu:signup-email',email.trim())}catch{}go('cuenta/registro')}}><label className="sm-field"><span>Correo electrónico</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={120} autoComplete="email"/></label><button className="sm-primary">Continuar<Icon name="arrow"/></button></form>}/></section>
}
export function SmartVerificationChannel() {
 const {pendingAccount}=useDinerStore()
 const {go}=useSmartRoute()
 const [channel,setChannel]=useState('correo')
 if(!pendingAccount)return <Empty icon="user" title="Crea tu cuenta primero" action="Crear cuenta" onAction={()=>go('cuenta/registro')}/>
 return <section className="sm-journey sm-intro"><Title title="Verifica tu cuenta" back="cuenta/registro"/><Recorrido titulo="¿Cómo prefieres verificarte?" texto="Registro de demostración: no se envían correos ni SMS. Puedes continuar con un código demo de seis dígitos." textoAtributos={{className:'sm-note'}} cuerpo={<div className="sm-help-list">{[['correo','Por correo',pendingAccount.form.correo],['sms','Por SMS',pendingAccount.form.celular||'Sin celular registrado']].map(([value,label,detail])=><button key={value} disabled={value==='sms'&&!pendingAccount.form.celular} aria-pressed={channel===value} onClick={()=>setChannel(value)}><Icon name="user"/><span>{label}<small>{detail}</small></span>{channel===value&&<Icon name="check"/>}</button>)}</div>} acciones={<button className="sm-primary" onClick={()=>go('cuenta/codigo')}>Continuar con código demo</button>}/></section>
}

export function SmartRegisteredAccount() {
 const {account}=useDinerStore()
 const {go}=useSmartRoute()
 if(!account)return <Empty icon="user" title="Crea tu cuenta primero" action="Crear cuenta" onAction={()=>go('cuenta/registro')}/>
 return <section className="sm-journey sm-intro"><Recorrido ilustracion="/smart-menu/stars.png" titulo="¡Tu cuenta está lista!" texto={`Hola, ${account.nombre}. Ya puedes guardar tus favoritos y recordar tus pedidos.`} acciones={<><button className="sm-primary" onClick={()=>go('cuenta')}>Ver mi perfil</button><button className="sm-secondary" onClick={()=>go('cuenta/clave')}>Crear contraseña</button></>}/></section>
}
