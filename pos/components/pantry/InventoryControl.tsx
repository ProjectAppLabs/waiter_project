'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/kit/Modal'
import { INPUT } from '@/components/pantry/WizardFrame'
import { formatQty, unitLabel, type Ingredient } from '@/lib/domain/pantry'
import { uuid } from '@/lib/domain/uuid'
import { getInventory, inventorySettings, moveInventory, type InventoryDetail } from '@/lib/services/restaurantInventory'
const kinds:Record<string,string>={receipt:'Entrada recibida',waste:'Merma',count:'Conteo físico',sale:'Venta POS',stock:'Movimiento de inventario'}
// `mayEditCost` (plan Q): el costo del ingrediente es de toda la organización y lo fija el dueño; el encargado lo ve y
// ajusta mínimo y máximo de su restaurante.
export function InventoryControl({ingredient,mayEdit,mayEditCost=true,onClose,onSaved}:{ingredient:Ingredient;mayEdit:boolean;mayEditCost?:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){
 const [data,setData]=useState<InventoryDetail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [kind,setKind]=useState('receipt'),[qty,setQty]=useState(''),[reason,setReason]=useState('')
 const [cost,setCost]=useState(0),[min,setMin]=useState(0),[max,setMax]=useState(0)
 const key=useRef(uuid())
 const load=(d:InventoryDetail)=>{setData(d);setCost(d.cost);setMin(d.min);setMax(d.max)}
 useEffect(()=>{let alive=true;getInventory(ingredient.id).then(d=>{if(alive)load(d)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[ingredient.id])
 async function submit(settings=false){
  if(!data||busy)return
  setBusy(true);setError('')
  try{
   if(!settings&&(!reason.trim()||qty===''||!Number.isFinite(Number(qty))||Number(qty)<0||(kind!=='count'&&Number(qty)===0)))throw Error('Escribe una cantidad válida y el motivo o referencia.')
   const d=settings?await inventorySettings(ingredient.id,cost,min,max):await moveInventory(ingredient.id,kind,Number(qty),reason,key.current,data.stock)
   load(d);if(!settings){setQty('');setReason('');key.current=uuid()};await onSaved()
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <Modal open title={`Control de inventario · ${ingredient.name}`} onClose={()=>{if(!busy)onClose()}} size="wide"><div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-auto">
  {error&&<p role="alert" className="p-3 bg-danger-soft text-danger-ink rounded">{error}</p>}
  {!data&&!error&&<p>Cargando movimientos…</p>}
  {data&&<>
   <p className="text-lg"><strong>{formatQty(data.stock)} {unitLabel(data.uom)}</strong> en existencias · {formatQty(data.pending)} comprometidos en pedidos</p>
   <button className="self-start text-primary text-sm" disabled={busy} onClick={()=>{setError('');void getInventory(ingredient.id).then(load).catch(e=>setError(e.message))}}>Actualizar existencias</button>
   {mayEdit&&<section className="border border-border rounded-lg p-3 flex flex-col gap-3">
    <h3 className="font-semibold">Registrar movimiento</h3>
    <label>Tipo<select aria-label="Tipo de movimiento" className={INPUT} disabled={busy} value={kind} onChange={e=>{setKind(e.target.value);setQty('');key.current=uuid()}}>{['receipt','waste','count'].map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select></label>
    <label>{kind==='count'?'Cantidad contada':'Cantidad'} ({unitLabel(data.uom)})<input aria-label="Cantidad del movimiento" type="number" min={0} step="any" className={INPUT} disabled={busy} value={qty} onChange={e=>{setQty(e.target.value);key.current=uuid()}}/></label>
    <label>Motivo o referencia<input aria-label="Motivo o referencia" className={INPUT} maxLength={300} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);key.current=uuid()}}/></label>
    <p className="text-sm text-soft">{kind==='receipt'?'Registra mercancía físicamente recibida e indica su documento de compra. Si ya la recibiste en Odoo, no la registres otra vez.':kind==='waste'?'Retira ingredientes dañados, vencidos o desperdiciados.':'Reemplaza las existencias por lo que acabas de contar. Termina antes los pedidos que usan este ingrediente.'}</p>
    <button disabled={busy} className="self-end px-4 py-2 bg-primary text-primary-ink rounded" onClick={()=>void submit()}>{busy?'Guardando…':'Registrar movimiento'}</button>
   </section>}
   {mayEdit&&<details><summary className="cursor-pointer font-semibold">Costo y alertas de reposición</summary><div className="grid grid-cols-3 gap-2 mt-3">{([['Costo por unidad',cost,setCost],['Mínimo',min,setMin],['Máximo',max,setMax]] as const).map(([label,value,set])=><label key={label}>{label}<input className={INPUT} type="number" min={0} step="any" value={value} disabled={label==='Costo por unidad'&&!mayEditCost} onChange={e=>set(Number(e.target.value))}/></label>)}</div>{!mayEditCost&&<p className="mt-2 text-sm text-soft">El costo lo fija el dueño para toda la organización.</p>}<button disabled={busy} className="mt-3 px-4 py-2 border border-border rounded" onClick={()=>void submit(true)}>{mayEditCost?'Guardar costo y alertas':'Guardar alertas'}</button></details>}
   <h3 className="font-semibold">Últimos movimientos</h3>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Motivo / documento</th><th>Registrado por</th></tr></thead><tbody>{data.history.map(m=><tr key={m.id} className="border-t border-border"><td className="py-2">{m.date}</td><td>{kinds[m.kind]??m.kind}</td><td className={m.qty<0?'text-danger-ink':'text-success'}>{m.qty>0?'+':''}{formatQty(m.qty)}</td><td>{m.reason}</td><td>{m.employee}</td></tr>)}</tbody></table>{!data.history.length&&<p>Sin movimientos registrados.</p>}</div>
  </>}
 </div></Modal>
}
