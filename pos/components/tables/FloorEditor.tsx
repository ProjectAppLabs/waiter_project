'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BACKGROUND_OPACITY, CELL, extent, invalidTable, MAX_EXTRA_IMAGES, normalizePlan, planFits, planImageSrc, snap, tableProblems, WALL_COLOR, zoneAt, type FloorDocument, type PlanImage, type PlanRect, type PlanTable } from '@/lib/domain/floorPlan'
import { Icon } from '@/components/kit/Icon'
import { AuroraBackground } from '@/components/kit/Aurora'
import { DecorArt } from '@/components/tables/decor/DecorArt'
import { EditorInspector, type Layer } from '@/components/tables/editor/EditorInspector'
import { EditorPalette } from '@/components/tables/editor/EditorPalette'
import { EditorHint, EditorToolbar } from '@/components/tables/editor/EditorToolbar'
import { TOOLS, type Tool } from '@/components/tables/editor/parts'
import { TableShape } from '@/components/tables/TableShape'
import { savePlan } from '@/lib/services/floorPlan'
import { checkPin } from '@/lib/services/employees'
import { useStableCallback } from '@/lib/hooks/useStableCallback'
import { useAuthStore } from '@/lib/stores/authStore'
import { DECOR_INFO, rotateDecor, type Decor, type DecorAsset } from '@/lib/domain/decor'
import { uuid } from '@/lib/domain/uuid'
import { cn } from '@/lib/utils'

type Selection = { kind: 'tables' | 'walls' | 'zones' | 'images' | 'background' | 'decor'; id: string } | null
// Borrador del editor: igual que el documento, pero con `images` y `decor` siempre como listas para tratarlas como a
// mesas, paredes y zonas. `background` es la primera imagen del piso, que conserva su campo propio por compatibilidad.
type Draft = FloorDocument & { images: PlanImage[]; decor: Decor[] }
type Camera = { x: number; y: number; zoom: number }
type Gesture = { type: 'pan' | 'move' | 'resize' | 'draw'; start: {x: number; y: number}; camera: Camera; original?: PlanRect; selection?: Selection; before: Draft }
const keyOf = (item: {key?: string; id?: string | number | null}) => item.key ?? String(item.id)
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4']
// Paredes: pizarra (la de siempre), casi negro, ladrillo, madera, verde de jardinera y gris claro de vidrio o baranda.
const WALL_COLORS = ['#475569', '#1e293b', '#9a3412', '#a16207', '#15803d', '#94a3b8']
const inputClass = 'w-full rounded-md border border-border bg-surface p-2 text-sm text-ink'
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

// Una mesa del lienzo. Memoizada: cambiar el color de una zona o mover una pared no vuelve a dibujar las mesas, que son
// lo más caro del plano (cada una es un TableShape con sus sillas dentro de un foreignObject).
const EditorTable = memo(function EditorTable({ table, bad, selected, onStart }: { table: PlanTable; bad: boolean; selected: boolean; onStart: (e: React.PointerEvent, key: string) => void }) {
 return <foreignObject x={table.x-24} y={table.y-24} width={table.width+48} height={table.height+48} overflow="visible" pointerEvents="none" data-plan-table={table.key}>
  <TableShape rect={{x:24,y:24,width:table.width,height:table.height}} name={String(table.number)} state="available" selected={selected}
   label={`Mesa ${table.number}, ${table.seats} personas${bad?', ubicación no válida':''}`} pill={{text:`${table.seats} personas`,icon:'user'}}
   onPointerDown={e=>onStart(e,table.key)} className={cn('pointer-events-auto',bad&&'[&>button]:bg-danger [&>button]:ring-2 [&>button]:ring-danger-ink')}/>
 </foreignObject>
})

export function FloorEditor({ initial, configId, background, onCancel, onSaved }: { initial: FloorDocument; configId: number; background?: string | null; onCancel: () => void; onSaved: (plan: FloorDocument) => Promise<void> }) {
 const [plan, setPlan] = useState<Draft>(()=>({...initial,images:initial.images??[],decor:initial.decor??[],...(background&&!initial.backgroundSize?{backgroundSize:{x:0,y:0,width:1200,height:800}}:{})}))
 const [camera, setCamera] = useState<Camera>({ x: 50, y: 50, zoom: 0.8 })
 const [selection, setSelection] = useState<Selection>(null)
 const [tool, setTool] = useState<Tool>('select')
 const [sourceRect, setSourceRect] = useState<PlanRect | null>(null)
 const [drawing, setDrawing] = useState<PlanRect | null>(null)
 const [undo, setUndo] = useState<Draft[]>([])
 const [redo, setRedo] = useState<Draft[]>([])
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [needsPin, setNeedsPin] = useState(false)
 const [pin, setPin] = useState('')
 const [panel, setPanel] = useState(false)
 const [panning, setPanning] = useState(false)
 const svg = useRef<SVGSVGElement>(null)
 const gesture = useRef<Gesture | null>(null)
 const pointers = useRef(new Map<number, {x: number; y: number}>())
 const pinch = useRef<{distance: number; center: {x: number; y: number}; camera: Camera} | null>(null)
 const backgroundSize = {x:0,y:0,...(plan.backgroundSize ?? {width:1200,height:800})}
 const current = selection?.kind === 'background' ? backgroundSize : selection ? plan[selection.kind].find((item) => keyOf(item) === selection.id) : null
 const currentTable = selection?.kind === 'tables' ? plan.tables.find(t=>t.key===selection.id) : undefined
 const currentZone = selection?.kind === 'zones' ? plan.zones.find(z => z.id === selection.id) : undefined
 const currentWall = selection?.kind === 'walls' ? plan.walls.find(w => w.id === selection.id) : undefined
 const currentDecor = selection?.kind === 'decor' ? plan.decor.find(d => d.id === selection.id) : undefined
 // La validez depende solo de mesas y paredes: se calcula una vez por cambio de esas listas, no en cada render ni por
 // cada sitio que la consulta (lienzo, capas y cabecera).
 const invalid = useMemo(() => plan.tables.filter((table) => invalidTable(table, plan)), [plan.tables, plan.walls]) // eslint-disable-line react-hooks/exhaustive-deps
 const invalidKeys = useMemo(() => new Set(invalid.map((t) => t.key)), [invalid])
 const shownBackground = plan.background === undefined ? background : plan.background ? `data:${plan.background.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${plan.background}` : null
 const fits = planFits(plan)
 const valid = fits && plan.name.trim() !== '' && invalid.length === 0 && plan.zones.every((z) => z.name.trim())
 const world = (x: number, y: number) => { const r = svg.current!.getBoundingClientRect(); return { x: (x - r.left - camera.x) / camera.zoom, y: (y - r.top - camera.y) / camera.zoom } }
 // `tag` identifica una edición continua (arrastrar el selector de color, el deslizador de tamaño, escribir un nombre).
 // Los cambios seguidos con la misma etiqueta en menos de un segundo son un solo paso del historial: un Deshacer los revierte.
 const lastEdit = useRef<{ tag: string; at: number } | null>(null)
 function commit(next: Draft, tag?: string) {
  if (busy) return
  const now = Date.now(), merge = tag !== undefined && lastEdit.current?.tag === tag && now - lastEdit.current.at < 1000
  lastEdit.current = tag === undefined ? null : { tag, at: now }
  if (!merge) { setUndo((h) => [...h.slice(-49), plan]); setRedo([]) }
  setPlan(next); setError('')
 }
 function patch(values: Record<string, unknown>) {
  if (!selection) return
  const tag = `${selection.kind}:${selection.id}:${Object.keys(values).join()}`
  if (selection.kind === 'background') { commit({...plan,backgroundSize:{...backgroundSize,...values}},tag);return }
  commit({ ...plan, [selection.kind]: plan[selection.kind].map((item) => keyOf(item) === selection.id ? { ...item, ...values } : item) }, tag)
 }
 // Encuadra todo el plano dejando libre la franja de la barra flotante (arriba) y la de la pista y el zoom (abajo).
 function fit() {
  const r = svg.current?.getBoundingClientRect(); if (!r || r.width <= 0) return
  const top = 84, bottom = 96, side = 30
  const size = extent(plan); const zoom = Math.min(1.5, (r.width - side*2) / size.width, (r.height - top - bottom) / size.height)
  const fittedZoom=Math.max(0.02,zoom)
  setCamera({ x: side-size.x*fittedZoom + Math.max(0,(r.width-side*2-size.width*fittedZoom)/2), y: top-size.y*fittedZoom, zoom: fittedZoom })
 }
 // Al abrir, el plano se ve entero: mismo encuadre que el salón y que «Ver todo».
 const fitOnOpen = useRef(fit)
 useEffect(() => { fitOnOpen.current() }, [])
 useEffect(() => {
  const el = svg.current; if (!el) return
  const wheel = (e: WheelEvent) => {
   e.preventDefault()
   const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
   setCamera((c) => { const zoom = Math.max(0.15, Math.min(2.5, c.zoom * Math.exp(-e.deltaY * 0.001))); return { x: x - (x - c.x) * zoom / c.zoom, y: y - (y - c.y) * zoom / c.zoom, zoom } })
  }
  el.addEventListener('wheel', wheel, {passive: false})
  return () => el.removeEventListener('wheel', wheel)
 }, [])
 function start(e: React.PointerEvent, chosen: Selection = null, resize = false) {
  if (busy || e.button > 1) return
  e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId)
  // Rueda pulsada: siempre mueve el plano, con cualquier herramienta y aunque empiece encima de una mesa o pared.
  if (e.button === 1) { gesture.current = {type:'pan', start:{x:e.clientX,y:e.clientY},camera,before:plan}; setPanning(true); return }
  pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY})
  if (pointers.current.size === 2) {
   if (gesture.current) setPlan(gesture.current.before)
   gesture.current = null; setDrawing(null); setSourceRect(null)
   const [a,b] = [...pointers.current.values()]
   pinch.current = {distance: Math.hypot(a.x-b.x,a.y-b.y), center: {x:(a.x+b.x)/2,y:(a.y+b.y)/2}, camera}
   return
  }
  const point = world(e.clientX, e.clientY)
  if (chosen && tool === 'select') {
   const item = chosen.kind === 'background' ? backgroundSize : plan[chosen.kind].find((v) => keyOf(v) === chosen.id)
   if (!item) return
   setSelection(chosen); setSourceRect(item)
   gesture.current = {type: resize ? 'resize' : 'move', start: point, camera, original: item, selection: chosen, before: plan}
  } else if (tool === 'wall' || tool === 'zone') {
   gesture.current = {type:'draw',start:{x:snap(point.x),y:snap(point.y)},camera,before:plan}
   setDrawing({x:snap(point.x),y:snap(point.y),width:CELL,height:CELL})
  } else {
   setSelection(null)
   gesture.current = {type:'pan', start:{x:e.clientX,y:e.clientY},camera,before:plan}; setPanning(true)
  }
 }
 // Manejador estable para las mesas memoizadas: siempre llama a la versión de `start` del último render.
 const startRef = useRef(start)
 useEffect(() => { startRef.current = start })
 const startTable = useCallback((e: React.PointerEvent, key: string) => startRef.current(e, {kind:'tables',id:key}), [])
 function move(e: React.PointerEvent) {
  if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
  if (pinch.current && pointers.current.size === 2) {
   const [a,b] = [...pointers.current.values()], p = pinch.current, r = svg.current!.getBoundingClientRect()
   const zoom = Math.max(0.15,Math.min(2.5,p.camera.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(p.distance,1)))
   setCamera({zoom,x:(a.x+b.x)/2-r.left-(p.center.x-r.left-p.camera.x)*zoom/p.camera.zoom,y:(a.y+b.y)/2-r.top-(p.center.y-r.top-p.camera.y)*zoom/p.camera.zoom}); return
  }
  const g = gesture.current; if (!g) return
  if (g.type === 'pan') { setCamera({...g.camera,x:g.camera.x+e.clientX-g.start.x,y:g.camera.y+e.clientY-g.start.y}); return }
  const point = world(e.clientX,e.clientY)
  if (g.type === 'draw') {
   const x=snap(point.x),y=snap(point.y)
   setDrawing({x:Math.min(x,g.start.x),y:Math.min(y,g.start.y),width:Math.max(CELL,Math.abs(x-g.start.x)),height:Math.max(CELL,Math.abs(y-g.start.y))}); return
  }
  if (!g.original || !g.selection) return
  const rect = g.type === 'resize'
   ? {...g.original,width:Math.max(CELL,snap(g.original.width+point.x-g.start.x)),height:Math.max(CELL,snap(g.original.height+point.y-g.start.y))}
   : {...g.original,x:snap(g.original.x+point.x-g.start.x),y:snap(g.original.y+point.y-g.start.y)}
  const chosen = g.selection
  // Una imagen cambia de tamaño sin deformarse: manda el lado que más creció.
  if ((chosen.kind === 'background' || chosen.kind === 'images') && g.type === 'resize') {const scale=Math.max(rect.width/g.original.width,rect.height/g.original.height);rect.width=g.original.width*scale;rect.height=g.original.height*scale}
  if (chosen.kind === 'background') {
   setPlan(p=>({...p,backgroundSize:rect}))
  } else {
   const kind = chosen.kind
   setPlan(p=>({...p,[kind]:p[kind].map(v=>keyOf(v)===chosen.id?{...v,...rect,...(kind==='tables'?{zone:zoneAt(rect,p.zones)}:{})}:v)}))
  }
 }
 function end(e: React.PointerEvent, cancelled = false) {
  pointers.current.delete(e.pointerId); setSourceRect(null); setPanning(false)
  if (pinch.current) { if (pointers.current.size < 2) pinch.current=null; return }
  const g=gesture.current; gesture.current=null
  if (!g) return
  if (cancelled) { setPlan(g.before); setDrawing(null); return }
  if (g.type === 'draw' && drawing) {
   const id=uuid(), kind=tool==='wall'?'walls':'zones'
   if (kind === 'zones') {
    const zones = [...plan.zones, {...drawing,id,name:`Zona ${plan.zones.length+1}`,color:COLORS[plan.zones.length%COLORS.length]}]
    commit({...plan,zones,tables:plan.tables.map(t=>({...t,zone:t.zone||zoneAt(t,zones)}))})
   } else commit({...plan,walls:[...plan.walls,{...drawing,id,...(plan.walls.at(-1)?.color?{color:plan.walls.at(-1)!.color}:{})}]})
   setSelection({kind,id}); setTool('select'); setDrawing(null)
  } else if (g.type === 'move' || g.type === 'resize') { setUndo((h)=>[...h.slice(-49),g.before]);setRedo([]) }
 }
 function addTable(width:number,height:number,seats:number) {
  const r=svg.current!.getBoundingClientRect(), center=world(r.left+r.width/2,r.top+r.height/2)
  const key=uuid(), rect={x:snap(center.x-width/2),y:snap(center.y-height/2),width,height}
  commit({...plan,tables:[...plan.tables,{...rect,key,id:null,number:Math.max(0,...plan.tables.map(t=>t.number))+1,seats,zone:zoneAt(rect,plan.zones)}]})
  setSelection({kind:'tables',id:key});setTool('select')
 }
 // Una pieza de la galería cae en el centro de lo que se está mirando, con su tamaño por defecto, lista para acomodarla.
 function addDecor(asset: DecorAsset) {
  const {width,height}=DECOR_INFO[asset], r=svg.current!.getBoundingClientRect(), center=world(r.left+r.width/2,r.top+r.height/2), id=uuid()
  commit({...plan,decor:[...plan.decor,{id,asset,rotation:0,x:snap(center.x-width/2),y:snap(center.y-height/2),width,height}]})
  setSelection({kind:'decor',id});setTool('select')
 }
 function remove() {
  if (!selection) return
  if (selection.kind === 'background') {commit({...plan,background:null,backgroundSize:null});setSelection(null);return}
  const next={...plan,[selection.kind]:plan[selection.kind].filter((v)=>keyOf(v)!==selection.id)}
  if (selection.kind==='zones') next.tables=next.tables.map((t)=>t.zone===selection.id?{...t,zone:''}:t)
  commit(next);setSelection(null)
 }
 async function save() {
  if (!valid || busy) return
  setBusy(true);setError('')
  try {
   if (needsPin) {
    const auth = useAuthStore.getState()
    if (!auth.employee) throw new Error('Inicia sesión como administrador para guardar el plano.')
    const result = await checkPin(auth.employee.id, pin)
    setPin('')
    if (!result.ok) throw new Error(result.reason === 'locked' ? 'PIN bloqueado temporalmente. Inténtalo más tarde.' : 'El PIN no coincide. Revisa e intenta de nuevo.')
    await auth.startShift(result.employee, result.attendanceId, result.token)
    setNeedsPin(false)
   }
   const result=await savePlan(configId,normalizePlan(plan));await onSaved(result)
  }
  catch(e) {
   const message = e instanceof Error ? e.message : String(e)
   if (message.includes('Valida el PIN de un administrador')) {
    setNeedsPin(true)
    setError('Tu validación anterior venció. Confirma tu PIN aquí; los cambios del plano se conservan.')
   } else setError(message)
  }
  finally {setBusy(false)}
 }

 function undoStep() { if (!undo.length || busy) return; lastEdit.current = null; setRedo(h=>[...h,plan]); setPlan(undo[undo.length-1]); setUndo(h=>h.slice(0,-1)) }
 function redoStep() { if (!redo.length || busy) return; lastEdit.current = null; setUndo(h=>[...h,plan]); setPlan(redo[redo.length-1]); setRedo(h=>h.slice(0,-1)) }
 function rotate() {
  if (currentDecor) { patch(rotateDecor(currentDecor)); return }
  if (current && selection && selection.kind !== 'background' && selection.kind !== 'images') patch({width:current.height,height:current.width})
 }
 // Mueve lo seleccionado una celda (o cinco con Mayús). Una mesa cambia de zona si cruza el borde, igual que al arrastrar.
 function nudge(dx: number, dy: number) {
  if (!current || !selection) return
  const rect = {...current, x: current.x + dx, y: current.y + dy}
  patch({x: rect.x, y: rect.y, ...(selection.kind === 'tables' ? {zone: zoneAt(rect, plan.zones)} : {})})
 }
 // Copia lo seleccionado a un lado. Una mesa toma el siguiente número libre; la copia queda seleccionada para moverla.
 function duplicate() {
  if (!current || !selection || selection.kind === 'background' || selection.kind === 'images') return
  const id = uuid()
  if (selection.kind === 'tables' && currentTable) {
   const rect = {x: snap(currentTable.x + currentTable.width + 40), y: currentTable.y, width: currentTable.width, height: currentTable.height}
   commit({...plan, tables: [...plan.tables, {...currentTable, ...rect, id: null, key: id, number: Math.max(0, ...plan.tables.map(t=>t.number)) + 1, zone: zoneAt(rect, plan.zones)}]})
  } else if (selection.kind === 'zones' && currentZone) {
   commit({...plan, zones: [...plan.zones, {...currentZone, id, name: `${currentZone.name} copia`.slice(0, 80), x: currentZone.x + 40, y: currentZone.y + 40}]})
  } else if (selection.kind === 'decor' && currentDecor) {
   commit({...plan, decor: [...plan.decor, {...currentDecor, id, x: currentDecor.x + 40, y: currentDecor.y + 40}]})
  } else {
   commit({...plan, walls: [...plan.walls, {...current, id, x: current.x + 40, y: current.y + 40}]})
  }
  setSelection({kind: selection.kind, id}); setTool('select')
 }
 // La primera imagen del piso va al campo de siempre. Las siguientes son imágenes adicionales: se miden para
 // conservar su proporción real y caen en el centro de lo que se está mirando, seleccionadas para acomodarlas.
 function loadImage(file: File) {
  if (!['image/png','image/jpeg'].includes(file.type) || file.size > 10*1024*1024) { setError('Usa una imagen PNG o JPG de hasta 10 MB.'); return }
  if (shownBackground && plan.images.length >= MAX_EXTRA_IMAGES) { setError(`Puedes tener hasta ${MAX_EXTRA_IMAGES+1} imágenes por piso. Quita una para agregar otra.`); return }
  const reader = new FileReader()
  reader.onload = () => {
   const url = String(reader.result), data = url.split(',')[1]
   if (!shownBackground) { commit({...plan, background: data, backgroundSize: {width:1200,height:800}}); return }
   const place = (naturalWidth: number, naturalHeight: number) => {
    const width = Math.max(CELL, snap(Math.min(800, naturalWidth || 600))), height = Math.max(CELL, snap(width * ((naturalHeight || 400) / (naturalWidth || 600))))
    const r = svg.current!.getBoundingClientRect(), center = world(r.left + r.width/2, r.top + r.height/2), id = uuid()
    commit({...plan, images: [...plan.images, {id, data, x: snap(center.x - width/2), y: snap(center.y - height/2), width, height}]})
    setSelection({kind:'images',id}); setTool('select')
   }
   const probe = new Image(); probe.onload = () => place(probe.naturalWidth, probe.naturalHeight); probe.onerror = () => place(600, 400); probe.src = url
  }
  reader.readAsDataURL(file)
 }
 // Atajos de teclado. No actúan mientras se escribe en un campo. El listener se registra una vez y llama, a través de
 // un ref que se actualiza tras cada render, a la versión de la función que ve el estado más reciente.
 const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
 const handleKey = (e: KeyboardEvent) => {
  if (busy || typing(e.target)) return
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase()
  if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redoStep(); else undoStep(); return }
  if (mod && key === 'y') { e.preventDefault(); redoStep(); return }
  if (mod && key === 'd') { e.preventDefault(); duplicate(); return }
  if (mod || e.altKey) return
  const picked = TOOLS.find(t => t.shortcut.toLowerCase() === key)
  if (picked) { setTool(picked.key); return }
  if (key === 'escape') { setSelection(null); setTool('select'); return }
  if (!selection) return
  if (key === 'delete' || key === 'backspace') { e.preventDefault(); remove(); return }
  if (key === 'r') { rotate(); return }
  const step = CELL * (e.shiftKey ? 5 : 1)
  const arrows: Record<string, [number, number]> = {arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step]}
  if (arrows[key]) { e.preventDefault(); nudge(...arrows[key]) }
 }
 useEffect(() => { onKey.current = handleKey })
 useEffect(() => {
  const handler = (e: KeyboardEvent) => onKey.current(e)
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
 }, [])
 const layers: Layer[] = [
  ...plan.tables.map(t=>({kind:'tables' as const,id:t.key,label:`Mesa ${t.number}`,invalid:invalidKeys.has(t.key)})),
  ...plan.walls.map((w,i)=>({kind:'walls' as const,id:w.id,label:`Pared ${i+1}`})),
  ...plan.zones.map(z=>({kind:'zones' as const,id:z.id,label:`Zona ${z.name}`})),
  ...plan.decor.map(d=>({kind:'decor' as const,id:d.id,label:DECOR_INFO[d.asset].label})),
  ...(shownBackground?[{kind:'background' as const,id:'background',label:'Imagen de referencia'}]:[]),
  ...plan.images.map((image,i)=>({kind:'images' as const,id:image.id,label:`Imagen ${i+2}`})),
 ]
 // Identidad fija para los paneles memoizados: así un cambio que no les toca (el color de una zona) no los redibuja.
 const onName = useStableCallback((name: string) => commit({...plan,name},'name'))
 const onAddTable = useStableCallback(addTable)
 const onAddDecor = useStableCallback(addDecor)
 const onImageFile = useStableCallback(loadImage)
 const onImageScale = useStableCallback((percent: number) => { const scale=percent/100; commit({...plan,backgroundSize:{...backgroundSize,width:1200*scale,height:800*scale}},'background:scale') })
 const onImageRemove = useStableCallback(() => { commit({...plan,background:null,backgroundSize:null}); if(selection?.kind==='background') setSelection(null) })
 const onImageSelect = useStableCallback(() => { setSelection({kind:'background',id:'background'}); setTool('select') })
 const onUndo = useStableCallback(undoStep), onRedo = useStableCallback(redoStep)
 const onLayers = useStableCallback(() => setPanel(v=>!v))
 const onSelectLayer = useStableCallback((layer: Layer) => { setSelection({kind:layer.kind,id:layer.id}); setTool('select') })
 const activeTool = TOOLS.find(t => t.key === tool)!
 const hint = tool === 'select' && selection ? 'Arrastra para mover. La esquina blanca cambia el tamaño. Las propiedades están a la derecha.' : activeTool.hint
 const counts = `${plan.tables.length} ${plan.tables.length === 1 ? 'mesa' : 'mesas'} · ${plan.walls.length} ${plan.walls.length === 1 ? 'pared' : 'paredes'} · ${plan.zones.length} ${plan.zones.length === 1 ? 'zona' : 'zonas'}${plan.decor.length ? ` · ${plan.decor.length} ${plan.decor.length === 1 ? 'pieza' : 'piezas'}` : ''}`
 const blocker = !fits ? 'El plano es demasiado grande' : invalid.length ? `${invalid.length} ${invalid.length === 1 ? 'mesa por corregir' : 'mesas por corregir'}` : !plan.name.trim() ? 'Falta el nombre del piso' : plan.zones.some(z => !z.name.trim()) ? 'Hay una zona sin nombre' : ''
 // Vive dentro del armazón del POS (barra superior y, con la caja cerrada, la franja de administración): ocupa lo que
 // queda debajo, no una pantalla entera. Con h-screen la página entera se desplazaba y el editor se iba hacia arriba.
 // Cada columna se desplaza por su cuenta dentro de ese alto.
 return <main className="pos-ambient flex-1 min-h-0 flex flex-col overflow-hidden text-ink" aria-label="Editor del restaurante">
  <AuroraBackground />
  <header className="shrink-0 h-[68px] flex items-center gap-3 px-4 border-b border-border bg-surface">
   <span className="w-10 h-10 shrink-0 grid place-items-center rounded-md bg-primary-soft text-primary"><Icon name="edit" size={20}/></span>
   <div className="min-w-0 flex-1"><h1 className="text-[16px] font-semibold leading-tight">Editar plano del restaurante</h1><p className="truncate text-[13px] text-dim">Nada cambia en el salón hasta que guardes.</p></div>
   {blocker && <button type="button" onClick={()=>{if(invalid[0]){setSelection({kind:'tables',id:invalid[0].key});setTool('select')}}} className="hidden md:flex h-10 px-3 items-center gap-2 rounded-md bg-danger-soft text-[13px] font-semibold text-danger-ink"><Icon name="alert" size={16}/>{blocker}</button>}
   <button type="button" className="h-11 px-4 flex items-center gap-2 border border-border rounded-md text-[15px] font-semibold hover:bg-muted" onClick={onCancel} disabled={busy}><Icon name="close" size={18}/>Cancelar</button>
   <button type="button" className="h-11 px-5 flex items-center gap-2 bg-primary text-primary-ink rounded-md text-[15px] font-semibold disabled:opacity-40" disabled={!valid||busy||(needsPin&&pin.length!==6)} onClick={()=>void save()}><Icon name={busy?'loader':'check'} size={18} className={busy?'animate-spin':undefined}/>{busy?'Guardando…':'Guardar'}</button>
  </header>
  {error && <p role="alert" className="px-4 py-2 flex items-center gap-2 bg-danger-soft text-[14px] text-danger-ink"><Icon name="alert" size={16}/>{error}</p>}
  {needsPin && <form className="flex items-end gap-3 px-4 py-3 border-b border-border bg-surface" onSubmit={e=>{e.preventDefault();if(pin.length===6) void save()}}>
   <label className="text-sm flex flex-col gap-1">PIN del administrador<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} className={inputClass} disabled={busy}/></label>
   <button type="submit" disabled={busy||pin.length!==6} className="h-10 px-4 rounded-md bg-primary text-primary-ink font-semibold disabled:opacity-40">Validar y guardar</button>
  </form>}
  <div className="relative flex flex-1 min-h-0">
   <EditorPalette name={plan.name} onName={onName} onAddTable={onAddTable} onAddDecor={onAddDecor} busy={busy}
    hasImage={Boolean(shownBackground)} imageCount={(shownBackground?1:0)+plan.images.length} canAddImage={!shownBackground||plan.images.length<MAX_EXTRA_IMAGES} imagePercent={Math.round(backgroundSize.width/12)} onImageFile={onImageFile}
    onImageScale={onImageScale} onImageRemove={onImageRemove} onImageSelect={onImageSelect}/>
   <div className="relative flex-1 min-w-0">
    <EditorToolbar tool={tool} onTool={setTool} canUndo={undo.length>0} canRedo={redo.length>0} onUndo={onUndo} onRedo={onRedo} busy={busy} onLayers={onLayers}/>
    <svg ref={svg} aria-label="Cuadrícula del restaurante" data-camera-x={camera.x} data-camera-y={camera.y} data-camera-zoom={camera.zoom} className={cn('w-full h-full touch-none select-none',panning?'cursor-grabbing':tool==='pan'||tool==='select'?'cursor-grab':'cursor-crosshair')} onPointerDown={e=>start(e)} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)}>
     <defs><pattern id="floor-editor-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse" patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}><path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#93c5fd" strokeOpacity={0.55} strokeWidth="1"/></pattern></defs>
     <rect width="100%" height="100%" fill="#eff6ff" pointerEvents="none"/>
     <rect width="100%" height="100%" fill="url(#floor-editor-grid)" pointerEvents="none"/>
     <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
      {shownBackground&&<image x={backgroundSize.x} y={backgroundSize.y} href={shownBackground} width={backgroundSize.width} height={backgroundSize.height} preserveAspectRatio="xMinYMin meet" opacity={BACKGROUND_OPACITY} pointerEvents="none"/>}
      {plan.images.map(image=><image key={image.id} x={image.x} y={image.y} href={planImageSrc(image)} width={image.width} height={image.height} preserveAspectRatio="xMinYMin meet" opacity={BACKGROUND_OPACITY} pointerEvents="none"/>)}
      {plan.zones.map(z=><g key={z.id} onPointerDown={e=>start(e,{kind:'zones',id:z.id})} role="button" aria-label={`Zona ${z.name}`} className={tool==='select'&&!panning?'cursor-move':undefined}><rect {...{x:z.x,y:z.y,width:z.width,height:z.height}} fill={z.color} fillOpacity={0.12} stroke={z.color} strokeWidth={2} strokeDasharray="8 4"/><text x={z.x+12} y={z.y+25} fill={z.color} fontSize={18} fontWeight="600">{z.name}</text></g>)}
      {plan.decor.map(d=><g key={d.id} transform={`translate(${d.x} ${d.y})`} role="button" aria-label={DECOR_INFO[d.asset].label} className={tool==='select'&&!panning?'cursor-move':undefined} onPointerDown={e=>start(e,{kind:'decor',id:d.id})}><DecorArt item={d}/></g>)}
      {plan.walls.map(w=><rect key={w.id} {...{x:w.x,y:w.y,width:w.width,height:w.height}} fill={w.color??WALL_COLOR} stroke="#0f172a" strokeOpacity={0.45} strokeWidth={2} role="button" aria-label="Pared" className={tool==='select'&&!panning?'cursor-move':undefined} onPointerDown={e=>start(e,{kind:'walls',id:w.id})}/>)}
      {sourceRect&&<rect {...{x:sourceRect.x,y:sourceRect.y,width:sourceRect.width,height:sourceRect.height}} fill="#94a3b8" fillOpacity={0.2} stroke="#64748b" strokeDasharray="6 4" pointerEvents="none"/>}
      {plan.tables.map(t=><EditorTable key={t.key} table={t} bad={invalidKeys.has(t.key)} selected={selection?.kind==='tables'&&selection.id===t.key} onStart={startTable}/>)}
      {drawing&&<rect {...drawing} fill={tool==='wall'?'#475569':'#3b82f6'} opacity={0.4} stroke="#2563eb" strokeWidth={2} pointerEvents="none"/>}
      {current&&selection&&tool==='select'&&<rect x={current.x} y={current.y} width={current.width} height={current.height} fill="transparent" stroke="#2563eb" strokeWidth={2} strokeDasharray="8 4" role="button" aria-label="Mover elemento seleccionado" pointerEvents={selection.kind==='tables'?'none':'all'} className="cursor-move" onPointerDown={e=>start(e,selection)}/>}
      {current&&selection&&tool==='select'&&<rect x={current.x+current.width-10} y={current.y+current.height-10} width={20} height={20} fill="white" stroke="#0f172a" strokeWidth={3} role="button" aria-label="Cambiar tamaño" className="cursor-nwse-resize" onPointerDown={e=>start(e,selection,true)}/>}
     </g>
    </svg>
    <EditorHint text={hint} selected={Boolean(selection)&&tool==='select'} counts={counts}/>
    <div role="group" aria-label="Zoom del plano" className={cn('absolute bottom-4 z-10 flex items-center rounded-md border border-border bg-surface shadow-lg text-[14px] text-ink',panel||selection?'right-[316px] xl:right-4':'right-4')}>
     <button type="button" aria-label="Alejar" onClick={()=>setCamera(c=>({...c,zoom:Math.max(0.15,c.zoom/1.2)}))} className="w-11 h-11 grid place-items-center rounded-l-md hover:bg-muted"><Icon name="minus" size={18}/></button>
     <span className="w-14 text-center tabular font-semibold">{Math.round(camera.zoom*100)}%</span>
     <button type="button" aria-label="Acercar" onClick={()=>setCamera(c=>({...c,zoom:Math.min(2.5,c.zoom*1.2)}))} className="w-11 h-11 grid place-items-center hover:bg-muted"><Icon name="plus" size={18}/></button>
     <button type="button" className="h-11 px-3 flex items-center gap-2 border-l border-border rounded-r-md font-semibold hover:bg-muted" onClick={fit}><Icon name="expand" size={18}/>Ver todo</button>
    </div>
   </div>
   <EditorInspector plan={plan} selection={selection} current={current} table={currentTable} zone={currentZone} wall={currentWall} decor={currentDecor} wallColors={WALL_COLORS} problems={currentTable?tableProblems(currentTable,plan):[]}
    zoneColors={COLORS} layers={layers} busy={busy} onPatch={patch} onRotate={rotate} onDuplicate={duplicate} onRemove={remove}
    onSelectLayer={onSelectLayer}
    open={panel||Boolean(selection)} onClose={()=>{setPanel(false);setSelection(null)}}/>
  </div>
 </main>
}
