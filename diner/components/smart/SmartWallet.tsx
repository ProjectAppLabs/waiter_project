'use client'
/* eslint-disable @next/next/no-img-element -- Exported wallet illustration. */
import {useRef,useState,type FormEvent} from 'react'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {Icon,Title} from './SmartMenu'
import './smart-tokens.css'
import './smart-wallet.css'
type DemoCard={id:string;brand:'Visa'|'Mastercard';holder:string;last4:string;expiry:string}
export function SmartWallet({embedded=false}: {embedded?:boolean}) {
 const {keys,account,preview}=useDinerStore()
 const storage=`smart-menu:demo-cards:${keys?.rest}:${keys?.venue}:${account?.id||'guest'}`
 const [cards,setCards]=useState<DemoCard[]>(()=>{try{const value=JSON.parse(localStorage.getItem(storage)||'[]');return Array.isArray(value)?value.filter(c=>c&&typeof c.id==='string'&&['Visa','Mastercard'].includes(c.brand)&&typeof c.holder==='string'&&typeof c.last4==='string'&&typeof c.expiry==='string').slice(0,5):[]}catch{return[]}})
 const [selected,setSelected]=useState(0)
 const [brand,setBrand]=useState<'Visa'|'Mastercard'>('Visa')
 const [holder,setHolder]=useState(account?.nombre||'')
 const [number,setNumber]=useState('4242424242424242')
 const [expiry,setExpiry]=useState('12/30')
 const [cvv,setCvv]=useState('123')
 const [error,setError]=useState('')
 const dialog=useRef<HTMLDialogElement>(null)
 const save=(next:DemoCard[])=>{try{if(preview){setError('No se guardan tarjetas en la vista previa.');return false}localStorage.setItem(storage,JSON.stringify(next));setCards(next);setSelected(0);return true}catch{setError('El navegador no permite guardar tarjetas de prueba.');return false}}
 const submit=(event:FormEvent)=>{
  event.preventDefault();setError('')
  const normalized=number.replace(/\s/g,'')
  const expected=brand==='Visa'?'4242424242424242':'5555555555554444'
  if(normalized!==expected || cvv!=='123' || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)){setError(`Usa la tarjeta de prueba ${expected}, CVV 123 y fecha MM/AA.`);return}
  if(cards.length>=5){setError('Puedes guardar hasta cinco tarjetas de prueba.');return}
  if(save([...cards,{id:crypto.getRandomValues(new Uint32Array(2)).join('-'),brand,holder:holder.trim(),last4:normalized.slice(-4),expiry}])){setNumber('');setCvv('');dialog.current?.close()}
 }
 const active=cards[selected]||cards[0]
 return <section className={`sm-wallet${embedded?' sm-wallet-embedded':''}`}>{embedded&&<div className="sm-checkout-method-heading"><span>Método de pago</span><button onClick={()=>{setError('');setNumber(brand==='Visa'?'4242424242424242':'5555555555554444');setCvv('123');dialog.current?.showModal()}}>Añadir tarjeta de prueba</button></div>}{!embedded&&<Title title="Mis tarjetas" back="cuenta"/>}<p className="sm-note">Tarjetas de demostración · No disponibles para cobros.</p>{active?<><div className="sm-bank-card"><strong>{active.brand}</strong><span className="sm-bank-chip">▦</span><p>•••• &nbsp; •••• &nbsp; •••• &nbsp; {active.last4}</p><div><span>{active.holder}</span><span>{active.expiry}</span></div><small>TARJETA DE PRUEBA</small></div><nav className="sm-slide-dots" aria-label="Tarjetas guardadas">{cards.map((card,i)=><button key={card.id} aria-label={`Tarjeta ${i+1} de ${cards.length}`} aria-current={selected===i?'true':undefined} onClick={()=>setSelected(i)}/>)}</nav><div className="sm-wallet-details" hidden={embedded}><p><span>Titular</span><strong>{active.holder}</strong></p><p><span>Vencimiento</span><strong>{active.expiry}</strong></p><button className="sm-secondary" disabled={!!preview||cards[0]?.id===active.id} onClick={()=>save([active,...cards.filter(c=>c.id!==active.id)])}>{cards[0]?.id===active.id?'Tarjeta predeterminada':'Usar como predeterminada'}</button><button className="sm-text-button" onClick={()=>save(cards.filter(c=>c.id!==active.id))}>Eliminar tarjeta</button></div></>:<div className="sm-wallet-empty"><img src="/smart-menu/wallet.png" alt=""/><h2>Aún no tienes tarjetas</h2><p>Añade una tarjeta de prueba para explorar el diseño del pago.</p></div>}{error&&<p className="sm-error" role="alert">{error}</p>}<button hidden={embedded} className="sm-primary" onClick={()=>{setError('');setNumber(brand==='Visa'?'4242424242424242':'5555555555554444');setCvv('123');dialog.current?.showModal()}}><Icon name="plus"/>Añadir tarjeta de prueba</button><dialog className="sm-filter-dialog sm-wallet-dialog" ref={dialog}><button className="sm-icon" aria-label="Cerrar formulario de tarjeta" onClick={()=>dialog.current?.close()}><Icon name="close"/></button><h2>Añadir tarjeta</h2><p>Usa únicamente los datos de prueba indicados.</p><form onSubmit={submit}><div className="sm-segmented">{(['Visa','Mastercard'] as const).map(b=><button type="button" key={b} aria-pressed={brand===b} onClick={()=>{setBrand(b);setNumber(b==='Visa'?'4242424242424242':'5555555555554444')}}>{b}</button>)}</div><label className="sm-field"><span>Número de prueba</span><input inputMode="numeric" autoComplete="off" required maxLength={19} value={number} onChange={e=>setNumber(e.target.value)}/></label><label className="sm-field"><span>Nombre del titular</span><input autoComplete="off" required maxLength={60} value={holder} onChange={e=>setHolder(e.target.value)}/></label><label className="sm-field"><span>Vencimiento MM/AA</span><input autoComplete="off" required value={expiry} maxLength={5} onChange={e=>setExpiry(e.target.value)}/></label><label className="sm-field"><span>CVV de prueba</span><input type="password" autoComplete="off" required value={cvv} maxLength={3} onChange={e=>setCvv(e.target.value)}/></label>{error&&<p className="sm-error" role="alert">{error}</p>}<button className="sm-primary" disabled={!!preview}>Guardar tarjeta de prueba</button></form></dialog></section>
}
