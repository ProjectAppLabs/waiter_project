'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/kit/Modal'
import { INPUT } from '@/components/pantry/WizardFrame'
import { formatQty, unitLabel, type Ingredient } from '@/lib/domain/pantry'
import type { KitUnit } from '@/lib/services/pantry'
import { getRecipe, updateRecipe, type RecipeDetail, type RecipeEntry } from '@/lib/services/restaurantInventory'

export function RecipeEditor({dish,ingredients,units,mayEdit,onClose,onSaved}:{dish:{id:number;name:string};ingredients:Ingredient[];units:KitUnit[];mayEdit:boolean;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [detail,setDetail]=useState<RecipeDetail|null>(null),[lines,setLines]=useState<RecipeEntry[]>([]),[yieldQty,setYield]=useState(1)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false)
 useEffect(()=>{let alive=true;getRecipe(dish.id).then(d=>{if(alive){setDetail(d);setLines(d.lines);setYield(d.yield)}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[dish.id])
 const patch=(i:number,values:Partial<RecipeEntry>)=>setLines(ls=>ls.map((l,j)=>i===j?{...l,...values}:l))
 async function save(){
  if(!detail||busy)return
  if(!(yieldQty>0)||!Number.isFinite(yieldQty)||lines.some(l=>!l.ingredientId||!l.uomId||!(l.qty>0)||!Number.isFinite(l.qty))){setError('Revisa las porciones y las cantidades de cada ingrediente.');return}
  setBusy(true);setError('')
  try{const d=await updateRecipe(dish.id,lines,yieldQty,detail.bom_id);setDetail(d);setEditing(false);await onSaved()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <Modal open title={`Receta · ${dish.name}`} onClose={()=>{if(!busy)onClose()}} size="wide">
  <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-auto">
   {error&&<p role="alert" className="p-3 bg-danger-soft text-danger-ink rounded">{error}</p>}
   {!detail&&!error&&<p>Cargando receta…</p>}
   {detail&&!editing&&<>
    <div className="grid grid-cols-2 gap-3"><div className="p-3 rounded bg-primary-soft"><p>Alcanza para</p><strong className="text-2xl">{detail.ingredients.length?`${detail.servings} platos`:'Sin receta'}</strong></div><div className="p-3 rounded bg-muted"><p>Costo de ingredientes por plato</p><strong>${formatQty(detail.cost)}</strong></div></div>
    <p className="text-sm text-soft">Descuenta los ingredientes comprometidos en pedidos pendientes. Las cantidades de distintos platos no se suman: pueden compartir ingredientes.</p>
    {detail.limiting.length>0&&<p className="text-sm">Limita la preparación: <strong>{detail.limiting.join(', ')}</strong>.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Ingrediente</th><th>Por plato</th><th>Existencias</th><th>Pedidos pendientes</th><th>Libres</th></tr></thead><tbody>{detail.ingredients.map(i=><tr key={i.id} className="border-t border-border"><td className="p-2">{i.name}</td><td>{formatQty(i.qty)} {unitLabel(i.uom)}</td><td>{formatQty(i.stock)}</td><td>{formatQty(i.pending)}</td><td>{formatQty(i.free)}</td></tr>)}</tbody></table></div>
    {mayEdit&&<button className="px-4 py-2 rounded bg-primary text-primary-ink self-start" onClick={()=>setEditing(true)}>{detail.lines.length?'Editar receta':'Crear receta'}</button>}
   </>}
   {detail&&editing&&<>
    <label>Esta receta produce<input className={INPUT} aria-label="Porciones de la receta" type="number" min={0.01} step="any" value={yieldQty} onChange={e=>setYield(Number(e.target.value))}/><span className="text-sm text-soft">platos. Introduce las cantidades para toda esa preparación, incluyendo la merma habitual de limpieza.</span></label>
    {lines.map((l,i)=><div key={i} className="grid grid-cols-[1fr_90px_100px_36px] gap-2">
     <select aria-label={`Ingrediente ${i+1}`} className={INPUT} value={l.ingredientId||''} onChange={e=>{const ingredient=ingredients.find(x=>x.id===Number(e.target.value));patch(i,{ingredientId:ingredient?.id??0,uomId:ingredient?.uomId??0})}}><option value="">Ingrediente</option>{ingredients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
     <input aria-label={`Cantidad ${i+1}`} className={INPUT} type="number" min={0.0001} step="any" value={l.qty} onChange={e=>patch(i,{qty:Number(e.target.value)})}/>
     <select aria-label={`Unidad ${i+1}`} className={INPUT} value={l.uomId||''} onChange={e=>patch(i,{uomId:Number(e.target.value)})}><option value="">Unidad</option>{Array.from(new Map([...units.map(u=>({id:u.id,name:u.uomName})),...ingredients.map(x=>({id:x.uomId,name:x.uomName}))].map(u=>[u.id,u])).values()).map(u=><option key={u.id} value={u.id}>{unitLabel(u.name)}</option>)}</select>
     <button aria-label={`Quitar ingrediente ${i+1}`} className="text-danger-ink" onClick={()=>setLines(ls=>ls.filter((_,j)=>j!==i))}>×</button>
    </div>)}
    <button className="text-primary self-start" onClick={()=>setLines(ls=>[...ls,{ingredientId:0,qty:1,uomId:0}])}>+ Agregar ingrediente</button>
    {!lines.length&&<p className="text-sm text-soft">Sin ingredientes, el plato quedará sin receta y no tendrá cálculo de disponibilidad.</p>}
    <div className="flex justify-end gap-2"><button disabled={busy} className="px-4 py-2 border border-border rounded" onClick={()=>{setLines(detail.lines);setYield(detail.yield);setEditing(false);setError('')}}>Cancelar edición</button><button disabled={busy} className="px-4 py-2 rounded bg-primary text-primary-ink" onClick={()=>void save()}>{busy?'Guardando…':'Guardar receta'}</button></div>
   </>}
  </div>
 </Modal>
}
