import type { PlanRect } from '@/lib/domain/floorPlan'

// Piezas de decoración del plano: cocina, salón, baños y estructura. No son mesas: no se venden ni se ocupan, solo
// dibujan el espacio para que el mesero se ubique. Se guardan en el plano del piso (restaurant.floor.waiter_plan.decor)
// junto a paredes y zonas; Odoo valida `asset` contra la misma lista (projectapp_ops/models/floor_plan.py, DECOR_ASSETS).
export const DECOR_ASSETS = [
  'stove', 'range', 'fridge', 'sink', 'counter', 'island',
  'bar', 'stool', 'register', 'sofa', 'plant',
  'toilet', 'washbasin',
  'door', 'window', 'stairs', 'spiral', 'column',
] as const
export type DecorAsset = (typeof DECOR_ASSETS)[number]
export type DecorRotation = 0 | 90 | 180 | 270
// `width` y `height` son la caja que ocupa en el plano ya girada: con 90 o 270 grados el dibujo va de lado dentro de ella.
export interface Decor extends PlanRect { id: string; asset: DecorAsset; rotation: DecorRotation }

export type DecorCategory = 'kitchen' | 'hall' | 'bath' | 'structure'
export const DECOR_CATEGORIES: { key: DecorCategory; label: string }[] = [
  { key: 'kitchen', label: 'Cocina' }, { key: 'hall', label: 'Salón y bar' }, { key: 'bath', label: 'Baños' }, { key: 'structure', label: 'Estructura' },
]

// Tamaños en píxeles del plano (una celda = 20). Una mesa de 4 mide 120: la estufa y la nevera guardan esa escala.
export const DECOR_INFO: Record<DecorAsset, { label: string; category: DecorCategory; width: number; height: number }> = {
  stove: { label: 'Estufa', category: 'kitchen', width: 120, height: 80 },
  range: { label: 'Fogón industrial', category: 'kitchen', width: 180, height: 80 },
  fridge: { label: 'Nevera', category: 'kitchen', width: 80, height: 80 },
  sink: { label: 'Lavaplatos doble', category: 'kitchen', width: 140, height: 60 },
  counter: { label: 'Mesón', category: 'kitchen', width: 200, height: 60 },
  island: { label: 'Isla de trabajo', category: 'kitchen', width: 160, height: 100 },
  bar: { label: 'Barra', category: 'hall', width: 260, height: 60 },
  stool: { label: 'Taburete', category: 'hall', width: 40, height: 40 },
  register: { label: 'Caja', category: 'hall', width: 100, height: 120 },
  sofa: { label: 'Sofá', category: 'hall', width: 200, height: 80 },
  plant: { label: 'Planta', category: 'hall', width: 60, height: 60 },
  toilet: { label: 'Sanitario', category: 'bath', width: 60, height: 80 },
  washbasin: { label: 'Lavamanos', category: 'bath', width: 80, height: 60 },
  door: { label: 'Puerta', category: 'structure', width: 80, height: 80 },
  window: { label: 'Ventana', category: 'structure', width: 120, height: 20 },
  stairs: { label: 'Escalera', category: 'structure', width: 100, height: 200 },
  spiral: { label: 'Escalera de caracol', category: 'structure', width: 140, height: 140 },
  column: { label: 'Columna', category: 'structure', width: 40, height: 40 },
}

export const isDecorAsset = (value: unknown): value is DecorAsset => typeof value === 'string' && (DECOR_ASSETS as readonly string[]).includes(value)

// Gira 90 grados en el sentido del reloj: la caja intercambia ancho y largo y el dibujo la acompaña.
export const rotateDecor = (item: Decor): Pick<Decor, 'width' | 'height' | 'rotation'> =>
  ({ width: item.height, height: item.width, rotation: ((item.rotation + 90) % 360) as DecorRotation })

// Medidas del dibujo antes de girarlo: con 90 o 270 grados, el ancho del dibujo es el largo de la caja.
export const artSize = (item: Pick<Decor, 'width' | 'height' | 'rotation'>) =>
  item.rotation % 180 ? { width: item.height, height: item.width } : { width: item.width, height: item.height }

// Transformación que lleva el dibujo (0..ancho, 0..largo sin girar) a su caja en el plano.
export function artTransform(item: Pick<Decor, 'width' | 'height' | 'rotation'>): string | undefined {
  if (item.rotation === 90) return `translate(${item.width} 0) rotate(90)`
  if (item.rotation === 180) return `translate(${item.width} ${item.height}) rotate(180)`
  if (item.rotation === 270) return `translate(0 ${item.height}) rotate(270)`
  return undefined
}
