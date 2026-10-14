'use client'

import { LoadingRegion, Skeleton } from '@/components/kit/Skeleton'

// Esqueleto del salón: la barra del piso y el plano con mesas repartidas (cuadradas y redondas, de dos tamaños), para
// que se lea «aquí va el plano» y no una caja genérica.
const TABLES: { x: number; y: number; w: number; h: number; round?: boolean }[] = [
  { x: 8, y: 12, w: 11, h: 16 }, { x: 26, y: 12, w: 11, h: 16 }, { x: 44, y: 10, w: 9, h: 13, round: true },
  { x: 8, y: 42, w: 11, h: 16 }, { x: 26, y: 42, w: 18, h: 16 }, { x: 56, y: 40, w: 9, h: 13, round: true },
  { x: 8, y: 72, w: 11, h: 16 }, { x: 30, y: 72, w: 11, h: 16 }, { x: 72, y: 20, w: 16, h: 26 },
]
export function FloorSkeleton() {
  return (
    <LoadingRegion className="flex-1 min-h-0 flex flex-col">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border bg-surface">
        <Skeleton className="h-10 w-20" /><Skeleton className="h-10 w-36" /><Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-72 ml-auto" />
      </div>
      <div className="relative flex-1 min-h-0 m-6">
        {TABLES.map((t, i) => (
          <Skeleton key={i} className={t.round ? 'absolute rounded-full' : 'absolute rounded-lg'} style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }} />
        ))}
      </div>
    </LoadingRegion>
  )
}
