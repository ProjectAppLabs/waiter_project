export type SpicyLevel = 0 | 1 | 2 | 3
export interface DinerSize { nombre: string; precio: number }
export interface DinerAttributes {
  combo?: {producto:number;cantidad:number;nombre?:string}[];
  ingredientes?: string[]; extras?: number[]; acompanamientos?: number[]; nutricion?: {calorias?:number;peso?:number;proteina?:number;grasa?:number;carbohidratos?:number;fibra?:number};
  piezas?: number; picante?: SpicyLevel; etiquetas?: string[]; alergenos?: string[]; abv?: number; ibu?: number; tamanos?: DinerSize[]; soloHoy?: boolean
  // Tarjeta de la carta: minutos enteros de preparación y el precio anterior que se muestra tachado (lista, sin impuestos,
  // como el precio del producto). El cobro siempre usa list_price; el precio anterior es solo informativo.
  tiempoPreparacion?: number; precioAntes?: number
}
export const SPICY_LEVELS: SpicyLevel[] = [0, 1, 2, 3]
export const EMPTY_ATTRIBUTES: DinerAttributes = {}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const list = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : undefined)

export function parseDinerAttributes(raw: string | false | null | undefined): DinerAttributes {
  if (!raw) return {}
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return {} }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const o = parsed as Record<string, unknown>
  const out: DinerAttributes = {}
  if(Array.isArray(o.combo))out.combo=o.combo.filter((i):i is {producto:number;cantidad:number;nombre?:string}=>!!i&&typeof i==='object'&&Number.isInteger(i.producto)&&Number.isInteger(i.cantidad)).slice(0,12)
  const ingredientes=list(o.ingredientes);if(ingredientes?.length)out.ingredientes=ingredientes.slice(0,32)
  if(Array.isArray(o.acompanamientos))out.acompanamientos=[...new Set(o.acompanamientos.filter((id):id is number=>typeof id==='number'&&Number.isInteger(id)&&id>0))].slice(0,19)
  if(Array.isArray(o.extras))out.extras=[...new Set(o.extras.filter((id):id is number=>typeof id==='number'&&Number.isInteger(id)&&id>0))].slice(0,19)
  if(o.nutricion&&typeof o.nutricion==='object')out.nutricion=Object.fromEntries(Object.entries(o.nutricion).filter(([key,value])=>['calorias','peso','proteina','grasa','carbohidratos','fibra'].includes(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100000))
  const piezas = num(o.piezas); if (piezas !== undefined) out.piezas = piezas
  const picante = num(o.picante); if (picante !== undefined && SPICY_LEVELS.includes(picante as SpicyLevel)) out.picante = picante as SpicyLevel
  const etiquetas = list(o.etiquetas); if (etiquetas?.length) out.etiquetas = etiquetas
  const alergenos = list(o.alergenos); if (alergenos?.length) out.alergenos = alergenos
  const abv = num(o.abv); if (abv !== undefined) out.abv = abv
  const ibu = num(o.ibu); if (ibu !== undefined) out.ibu = ibu
  if (Array.isArray(o.tamanos)) {
    const tamanos = o.tamanos.filter((t): t is DinerSize => Boolean(t) && typeof t === 'object' && typeof (t as DinerSize).nombre === 'string' && typeof (t as DinerSize).precio === 'number')
    if (tamanos.length) out.tamanos = tamanos.map((t) => ({ nombre: t.nombre, precio: t.precio }))
  }
  if (o.soloHoy === true) out.soloHoy = true
  const prep = num(o.tiempoPreparacion); if (prep !== undefined && Number.isInteger(prep) && prep > 0 && prep <= 600) out.tiempoPreparacion = prep
  const previous = num(o.precioAntes); if (previous !== undefined && previous > 0) out.precioAntes = previous
  return out
}

export function serializeDinerAttributes(a: DinerAttributes): string | false {
  const clean: DinerAttributes = {}
  if(a.combo?.length)clean.combo=a.combo
  if(a.ingredientes?.length)clean.ingredientes=a.ingredientes.filter(v=>v.trim()).map(v=>v.trim().slice(0,80)).slice(0,32)
  if(a.acompanamientos)clean.acompanamientos=[...new Set(a.acompanamientos.filter(id=>Number.isInteger(id)&&id>0))].slice(0,19)
  if(a.extras?.length)clean.extras=[...new Set(a.extras.filter(id=>Number.isInteger(id)&&id>0))].slice(0,19)
  if(a.nutricion){const values=Object.fromEntries(Object.entries(a.nutricion).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000));if(Object.keys(values).length)clean.nutricion=values}
  if (a.piezas !== undefined && a.piezas > 0) clean.piezas = a.piezas
  if (a.picante !== undefined && a.picante > 0) clean.picante = a.picante
  if (a.etiquetas?.length) clean.etiquetas = a.etiquetas
  if (a.alergenos?.length) clean.alergenos = a.alergenos
  if (a.abv !== undefined && a.abv > 0) clean.abv = a.abv
  if (a.ibu !== undefined && a.ibu > 0) clean.ibu = a.ibu
  const tamanos = (a.tamanos ?? []).filter((t) => t.nombre.trim() !== '').map((t) => ({ nombre: t.nombre.trim(), precio: t.precio }))
  if (tamanos.length) clean.tamanos = tamanos
  if (a.soloHoy) clean.soloHoy = true
  if (a.tiempoPreparacion !== undefined && Number.isInteger(a.tiempoPreparacion) && a.tiempoPreparacion > 0 && a.tiempoPreparacion <= 600) clean.tiempoPreparacion = a.tiempoPreparacion
  if (a.precioAntes !== undefined && a.precioAntes > 0) clean.precioAntes = a.precioAntes
  return Object.keys(clean).length === 0 ? false : JSON.stringify(clean)
}

// "popular, sin gluten" ⇄ ['popular', 'sin gluten'] para los campos de texto del formulario.
export const listToText = (items: string[] | undefined): string => (items ?? []).join(', ')
export const textToList = (text: string): string[] => text.split(',').map((s) => s.trim()).filter(Boolean)
