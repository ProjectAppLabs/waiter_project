'use client'
import {useEffect,useState} from 'react'
import {Button} from '@/components/ui/Button'
import {Select,TextInput,Toggle} from '@/components/ui/Field'
import {Segmented} from '@/components/ui/Segmented'
import {MenuBannersForm} from './MenuBannersForm'
import {benefitsSettings,type BenefitAction,type BenefitActionKey,type BenefitReward,type BenefitsSettings,type Coupon,type PointsSettings} from '@/lib/services/benefits'

const empty:Coupon={name:'',code:'',percent:10,minimum:0,start:'',end:'',active:true}
type Tab='coupons'|'points'|'actions'|'banners'

// Plan N: qué hace el comensal para ganar cada premio y cuántas veces lo gana.
export const ACTIONS:Record<BenefitActionKey,{title:string;hint:string}>={
 cuenta:{title:'Crear y verificar su cuenta',hint:'Al verificar su cuenta en el menú. Una vez por cuenta.'},
 opinion:{title:'Dejar su opinión de un pedido',hint:'Al calificar un pedido que ya se envió a cocina. Una vez por pedido.'},
 novedades:{title:'Suscribirse a las novedades',hint:'Al activar «Novedades y promociones» en su cuenta. Una vez por cuenta.'},
 pago_en_linea:{title:'Pagar su pedido en línea',hint:'Al aprobarse su primer pago en línea desde el menú. Una vez por cuenta.'},
}
const REWARDS:{value:BenefitReward;label:string}[]=[{value:'descuento',label:'Descuento en su próxima compra'},{value:'cupon',label:'Activarle un cupón'},{value:'puntos',label:'Sumarle puntos'}]

// «Promociones»: cupones, puntos de fidelización, acciones del menú que dan un premio (un cupón, puntos o un descuento) y
// los banners que anuncian una promoción en la carta.
export function BenefitsForm({configId}:{configId:number}) {
 const [data,setData]=useState<BenefitsSettings|null>(null),[tab,setTab]=useState<Tab>('coupons')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
 useEffect(()=>{let active=true;benefitsSettings(configId).then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[configId])
 const save=async(args:{coupon?:Coupon;loyalty?:PointsSettings;action?:BenefitAction},message:string)=>{
  setBusy(true);setError('');setSaved('')
  try{setData(await benefitsSettings(configId,args.coupon,args.loyalty,args.action));setSaved(message);return true}
  catch(e){setError(e instanceof Error?e.message:'No se pudo guardar');return false}
  finally{setBusy(false)}
 }
 return <div className="flex flex-col gap-5 max-w-3xl">
  <Segmented label="Tipo de promoción" value={tab} onChange={t=>{setTab(t);setSaved('')}} options={[{value:'coupons',label:'Cupones'},{value:'points',label:'Puntos'},{value:'actions',label:'Acciones'},{value:'banners',label:'Banners'}]}/>
  {error&&<p role="alert" className="text-danger">{error}</p>}{saved&&<p role="status">{saved}</p>}
  {data&&tab==='coupons'&&<CouponsTab coupons={data.coupons} busy={busy} save={coupon=>save({coupon},'Cupón guardado.')}/>}
  {data&&tab==='points'&&<PointsTab initial={data.loyalty} busy={busy} save={loyalty=>save({loyalty},'Puntos guardados.')}/>}
  {/* Los banners publican una promoción en la carta y la enlazan a un plato, un combo o una categoría. */}
  {tab==='banners'&&<MenuBannersForm configId={configId}/>}
  {data&&tab==='actions'&&<ActionsTab data={data} busy={busy} save={action=>save({action},`«${ACTIONS[action.action].title}» guardada.`)}/>}
 </div>
}

function CouponsTab({coupons,busy,save}:{coupons:Coupon[];busy:boolean;save:(c:Coupon)=>Promise<boolean>}) {
 const [draft,setDraft]=useState<Coupon>(empty)
 return <section className="rounded-md border border-border p-5 flex flex-col gap-4"><h3 className="font-semibold">Cupones de descuento</h3>
  <p className="text-sm text-soft">Códigos reutilizables sobre el consumo de quien los aplica. Reemplazan cualquier descuento por acción; no se suman a él. Una acción también puede activarle un cupón a quien la cumpla.</p>
  {coupons.map(c=><button key={c.id} className="flex justify-between border border-border rounded-md p-3 text-left" onClick={()=>setDraft(c)}><span>{c.code} · {c.name}</span><span>{c.percent}% · {c.active?'Activo':'Inactivo'} · Editar</span></button>)}
  <form onSubmit={e=>{e.preventDefault();void save(draft).then(ok=>{if(ok)setDraft(empty)})}} className="flex flex-col gap-4"><h4>{draft.id?'Editar cupón':'Crear cupón'}</h4>
   <div className="grid grid-cols-2 gap-4">
    <TextInput required label="Nombre" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/>
    <TextInput required label="Código" maxLength={32} minLength={3} pattern="[A-Za-z0-9_\-]{3,32}" value={draft.code} onChange={e=>setDraft({...draft,code:e.target.value.toUpperCase()})}/>
    <TextInput label="Descuento (%)" required type="number" min="0.01" max="100" step="0.01" value={draft.percent} onChange={e=>setDraft({...draft,percent:Number(e.target.value)})}/>
    <TextInput label="Compra mínima (con impuestos)" type="number" min="0" step="0.01" required value={draft.minimum} onChange={e=>setDraft({...draft,minimum:Number(e.target.value)})}/>
    <TextInput label="Desde (opcional)" type="date" value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/>
    <TextInput label="Hasta (opcional)" type="date" value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/>
   </div>
   <label className="flex gap-2"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Cupón activo</label>
   <div className="flex gap-3"><Button type="submit" disabled={busy}>Guardar cupón</Button>{draft.id&&<Button type="button" variant="secondary" onClick={()=>setDraft(empty)}>Cancelar edición</Button>}</div>
  </form>
 </section>
}

function PointsTab({initial,busy,save}:{initial:PointsSettings|null;busy:boolean;save:(p:PointsSettings)=>Promise<boolean>}) {
 const [points,setPoints]=useState(initial)
 return <section className="rounded-md border border-border p-5 flex flex-col gap-4"><h3 className="font-semibold">Puntos de fidelización</h3>
  {points?<form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();void save(points)}}><p>{points.name}</p>
   <p className="text-sm text-soft">Se acreditan cuando el POS cobra el pedido. Las devoluciones descuentan los puntos correspondientes. Una acción también puede sumarle puntos a quien la cumpla.</p>
   <TextInput label="Consumo para ganar 1 punto" type="number" required min="0.01" step="0.01" value={points.spendPerPoint} onChange={e=>setPoints({...points,spendPerPoint:Number(e.target.value)})}/>
   <TextInput label="Valor de descuento por punto" type="number" required min="0.01" step="0.01" value={points.valuePerPoint} onChange={e=>setPoints({...points,valuePerPoint:Number(e.target.value)})}/>
   <TextInput label="Puntos mínimos para canjear" type="number" required min="1" step="1" value={points.minimumPoints} onChange={e=>setPoints({...points,minimumPoints:Number(e.target.value)})}/>
   <Button type="submit" disabled={busy}>Guardar puntos</Button>
  </form>:<p>No hay un programa de puntos activo para este POS.</p>}
 </section>
}

function ActionsTab({data,busy,save}:{data:BenefitsSettings;busy:boolean;save:(a:BenefitAction)=>Promise<boolean>}) {
 return <section className="flex flex-col gap-4">
  <p className="text-sm text-soft">Lo que el comensal hace en el menú y le da un premio. Solo se gana con una cuenta verificada. Un descuento por compra: si escribe un cupón, reemplaza al descuento de la acción; los puntos siempre se suman.</p>
  {data.actions.map(a=><ActionRow key={a.action} initial={a} coupons={data.coupons.filter(c=>c.active)} hasPoints={!!data.loyalty} busy={busy} save={save}/>)}
 </section>
}

function ActionRow({initial,coupons,hasPoints,busy,save}:{initial:BenefitAction;coupons:Coupon[];hasPoints:boolean;busy:boolean;save:(a:BenefitAction)=>Promise<boolean>}) {
 const [draft,setDraft]=useState(initial)
 const {title,hint}=ACTIONS[draft.action]
 // Un premio que no se puede entregar no se deja guardar activo: sin cupones activos o sin programa de puntos.
 const problem=draft.active&&(draft.reward==='cupon'&&!coupons.some(c=>c.id===draft.couponId)?'Elige un cupón activo de la pestaña Cupones.':draft.reward==='puntos'&&!hasPoints?'Este POS no tiene programa de puntos.':'')
 return <form aria-label={title} className="rounded-md border border-border p-5 flex flex-col gap-4" onSubmit={e=>{e.preventDefault();if(!problem)void save(draft)}}>
  <div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-soft">{hint}</p></div>
   <Toggle label={`Premiar: ${title}`} checked={draft.active} onChange={active=>setDraft({...draft,active})} onLabel="Activa" offLabel="Inactiva"/></div>
  <div className="grid grid-cols-2 gap-4">
   <Select label="Premio" value={draft.reward} onChange={e=>setDraft({...draft,reward:e.target.value as BenefitReward})}>
    {REWARDS.map(r=><option key={r.value} value={r.value} disabled={r.value==='puntos'&&!hasPoints}>{r.label}</option>)}
   </Select>
   {draft.reward==='descuento'&&<TextInput label="Descuento (%)" type="number" required min="0.01" max="100" step="0.01" value={draft.percent} onChange={e=>setDraft({...draft,percent:Number(e.target.value)})} hint="Una vez, sobre lo que pida esa persona."/>}
   {draft.reward==='cupon'&&<Select label="Cupón" value={draft.couponId??''} onChange={e=>setDraft({...draft,couponId:e.target.value?Number(e.target.value):null})}>
    <option value="">Elige un cupón</option>{coupons.map(c=><option key={c.id} value={c.id}>{c.code} · {c.percent}%</option>)}
   </Select>}
   {draft.reward==='puntos'&&<TextInput label="Puntos" type="number" required min="1" step="1" value={draft.points} onChange={e=>setDraft({...draft,points:Math.round(Number(e.target.value))})}/>}
  </div>
  {problem&&<p role="alert" className="text-sm text-danger">{problem}</p>}
  <div><Button type="submit" disabled={busy||!!problem}>Guardar acción</Button></div>
 </form>
}
