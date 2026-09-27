import type { Decor } from '@/lib/domain/decor'

export const CELL = 20
export interface PlanRect { x: number; y: number; width: number; height: number }
export interface PlanTable extends PlanRect { id: number | null; key: string; number: number; seats: number; zone: string }
// `color` es opcional: los planos anteriores no lo traen y se pintan con WALL_COLOR.
export interface Wall extends PlanRect { id: string; color?: string }
export const WALL_COLOR = '#475569'
export interface Zone extends PlanRect { id: string; name: string; color: string }
// Imagen de referencia adicional. Guardada es un adjunto del piso en Odoo (`attachmentId`); recién subida trae `data`
// (base64) hasta que se guarde el plano. La primera imagen del piso sigue viviendo en `background` + `backgroundSize`.
export interface PlanImage extends PlanRect { id: string; attachmentId?: number; data?: string }
export const MAX_EXTRA_IMAGES = 8
export const planImageSrc = (image: PlanImage): string => image.data ? `data:${image.data.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${image.data}` : `/odoo/web/image/${image.attachmentId}`
// `decor`: piezas de la galería (cocina, baños, escaleras…); opcional porque los planos anteriores no la traen.
export interface FloorDocument { decor?: Decor[]; images?: PlanImage[]; background?: string | null; backgroundSize?: { x?: number; y?: number; width: number; height: number } | null; id: number | null; name: string; revision: number; tables: PlanTable[]; walls: Wall[]; zones: Zone[] }
// La imagen de referencia acompaña, no compite: misma opacidad en el editor y en el salón.
export const BACKGROUND_OPACITY = 0.35
// Margen alrededor del contenido al encuadrar: las sillas sobresalen 24 px de cada mesa.
export const PLAN_MARGIN = 48
export const snap = (v: number) => Math.round(v / CELL) * CELL
export const overlaps = (a: PlanRect, b: PlanRect, gap = 16) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
export const invalidTable = (t: PlanTable, plan: FloorDocument) => !Number.isInteger(t.number) || t.number < 1 || t.number > 9999 || !Number.isInteger(t.seats) || t.seats < 1 || t.seats > 100 || t.width < CELL || t.height < CELL || plan.tables.some((o) => o.key !== t.key && (o.number === t.number || overlaps(t, o))) || plan.walls.some((w) => overlaps(t, w))
// Por qué una mesa no se puede guardar, en palabras para quien edita. Vacío = válida. `invalidTable` es su resumen.
export type TableProblem = 'number' | 'seats' | 'size' | 'duplicate' | 'table' | 'wall'
export function tableProblems(t: PlanTable, plan: FloorDocument): TableProblem[] {
 const out: TableProblem[] = []
 if (!Number.isInteger(t.number) || t.number < 1 || t.number > 9999) out.push('number')
 if (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > 100) out.push('seats')
 if (t.width < CELL || t.height < CELL) out.push('size')
 if (plan.tables.some((o) => o.key !== t.key && o.number === t.number)) out.push('duplicate')
 if (plan.tables.some((o) => o.key !== t.key && overlaps(t, o))) out.push('table')
 if (plan.walls.some((w) => overlaps(t, w))) out.push('wall')
 return out
}
export const zoneAt = (t: PlanRect, zones: Zone[]) => zones.find((z) => t.x + t.width / 2 >= z.x && t.x + t.width / 2 <= z.x + z.width && t.y + t.height / 2 >= z.y && t.y + t.height / 2 <= z.y + z.height)?.id ?? ''
export function extent(plan: Pick<FloorDocument, 'tables' | 'walls' | 'zones' | 'backgroundSize' | 'images' | 'decor'>) {
 const all = [...plan.tables, ...plan.walls, ...plan.zones, ...(plan.images ?? []), ...(plan.decor ?? []), ...(plan.backgroundSize ? [{x:0,y:0,...plan.backgroundSize}] : [])]
 const x=Math.min(0,...all.map(r=>r.x)), y=Math.min(0,...all.map(r=>r.y))
 return { x, y, width: Math.max(1200, ...all.map((r) => r.x + r.width + 100-x)), height: Math.max(800, ...all.map((r) => r.y + r.height + 100-y)) }
}

// Reubica el origen al guardar sin alterar distancias ni asociaciones entre elementos.
export function normalizePlan(plan: FloorDocument): FloorDocument {
 const rects = [...plan.tables,...plan.walls,...plan.zones,...(plan.images??[]),...(plan.decor??[]),...(plan.backgroundSize?[{x:0,y:0,...plan.backgroundSize}]:[])]
 const dx=-Math.min(0,...rects.map(r=>r.x)), dy=-Math.min(0,...rects.map(r=>r.y))
 if (!dx&&!dy) return plan
 const shift=<T extends PlanRect>(r:T):T=>({...r,x:r.x+dx,y:r.y+dy})
 return {...plan,tables:plan.tables.map(shift),walls:plan.walls.map(shift),zones:plan.zones.map(shift),...(plan.images?{images:plan.images.map(shift)}:{}),...(plan.decor?{decor:plan.decor.map(shift)}:{}),
  ...(plan.backgroundSize?{backgroundSize:shift({x:0,y:0,...plan.backgroundSize})}:{})}
}
export function planFits(plan: FloorDocument): boolean {
 const normalized=normalizePlan(plan)
 return [...normalized.tables,...normalized.walls,...normalized.zones,...(normalized.images??[]),...(normalized.decor??[]),...(normalized.backgroundSize?[{x:0,y:0,...normalized.backgroundSize}]:[])].every(r=>
  [r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>=CELL&&r.height>=CELL&&r.x+r.width<=20000&&r.y+r.height<=20000)
}

// Límites reales de lo que hay dibujado (mesas, paredes, zonas e imagen), con margen. A diferencia de `extent`, no
// fuerza un lienzo mínimo: es lo que el salón encuadra para que el plano se vea entero, como en el editor.
export function contentBounds(rects: PlanRect[], margin = PLAN_MARGIN): PlanRect {
 if (!rects.length) return {x:0,y:0,width:0,height:0}
 const x=Math.min(...rects.map(r=>r.x)), y=Math.min(...rects.map(r=>r.y))
 const right=Math.max(...rects.map(r=>r.x+r.width)), bottom=Math.max(...rects.map(r=>r.y+r.height))
 return {x:x-margin,y:y-margin,width:right-x+margin*2,height:bottom-y+margin*2}
}
// Zoom con el que `content` cabe entero en `view`. Nunca amplía más de `max` ni baja de `min`.
export function fitZoom(content:{width:number;height:number}, view:{width:number;height:number}, min=0.2, max=1.25): number {
 if (content.width<=0||content.height<=0||view.width<=0||view.height<=0) return 1
 return Math.max(min,Math.min(max,view.width/content.width,view.height/content.height))
}

// Zoom inicial del salón. Lo normal es que quepa todo, imagen incluida. Pero una imagen de referencia enorme no puede
// encoger las mesas hasta volverlas ilegibles: si encuadrar todo deja el zoom por debajo de `readable`, se encuadra lo
// que se opera (mesas, paredes, zonas) hasta ese tamaño y la imagen sobrante queda a un desplazamiento de distancia.
// 0,45 es el piso: una mesa pequeña (110 px) queda en unos 50 px, el mínimo tocable. Con un umbral más alto, un panel
// angosto (pantalla partida) recortaba el plano aunque cupiera entero a un tamaño todavía cómodo.
export function salonZoom(all:{width:number;height:number}, core:{width:number;height:number}, view:{width:number;height:number}, readable=0.45): number {
 const everything=fitZoom(all,view)
 return everything>=readable ? everything : Math.max(everything,Math.min(readable,fitZoom(core,view)))
}
