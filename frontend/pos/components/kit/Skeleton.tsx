'use client'

import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Esqueletos de carga del kit: en vez de una pantalla en blanco, un «Cargando…» suelto o —peor— un «no hay nada» que
// todavía no es verdad, la vista muestra la forma de lo que va a llegar. El brillo que los recorre dice que algo está
// pasando; con «reducir movimiento» quedan quietos. Cómo usarlos y cómo componer uno nuevo: /kit → «Esqueletos».

// El bloque base. Decorativo: el aviso para lectores de pantalla lo da `LoadingRegion`, una sola vez.
// `style` para medidas que dependen de un dato (la altura de cada barra de un gráfico).
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cn('skeleton block rounded-md', className)} style={style} />
}

// Envuelve un esqueleto y anuncia la carga una vez («Cargando…» o lo que diga `label`).
export function LoadingRegion({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  const t = useTranslations('pos.ui')
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label ?? t('loading')}</span>
      {children}
    </div>
  )
}

// Líneas de texto: la última más corta, como un párrafo real.
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />)}
    </span>
  )
}

// Tarjetas en rejilla (pedidos, platos, comandas).
export function CardGridSkeleton({ count = 6, columns = 'grid-cols-3', label, className }: { count?: number; columns?: string; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('grid gap-4', columns, className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-md" /><SkeletonText lines={2} className="flex-1" /></div>
          <SkeletonText lines={3} />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </LoadingRegion>
  )
}

// Filas de una lista (historial, avisos).
export function ListSkeleton({ rows = 6, label, className }: { rows?: number; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-md shrink-0" />
          <SkeletonText lines={2} className="flex-1" />
          <Skeleton className="w-16 h-4 shrink-0" />
        </div>
      ))}
    </LoadingRegion>
  )
}

// El valor grande de una tarjeta de indicador.
export function KpiValueSkeleton() {
  return <Skeleton className="h-7 w-28" />
}

// Una pantalla genérica mientras se abre (app/(pos)/loading.tsx): título, fila de filtros y contenido.
export function PageSkeleton() {
  return (
    <LoadingRegion className="flex-1 min-h-0 p-5 flex flex-col gap-5">
      <div className="flex items-center gap-4"><Skeleton className="h-12 w-44" /><Skeleton className="h-12 w-72 ml-auto" /></div>
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-28 rounded-full" />)}</div>
      <div className="grid grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
    </LoadingRegion>
  )
}
