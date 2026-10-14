import { Icon, type KitIcon } from '@/components/kit/Icon'
import { KpiValueSkeleton, Skeleton } from '@/components/kit/Skeleton'
import { cn } from '@/lib/utils'

// Tarjeta KPI del kit (Dashboard / Filled.png): etiqueta, icono azul en recuadro y valor grande.
// `change` es la variación frente al periodo anterior (0.12 = +12 %); `hint` dice contra qué se compara.
// `loading`: el valor aún no llega; se muestra su esqueleto en vez de «…» o un cero que no es cierto.
export function KpiTile({ label, value, icon, change, hint, loading = false }: { label: string; value: string; icon: KitIcon; change?: number | null; hint?: string; loading?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col justify-between gap-3 overflow-hidden relative isolate">
      {/* El halo azul del kit vive detrás del texto: sin la capa propia taparía la cifra cuando la etiqueta ocupa dos líneas. */}
      <span aria-hidden="true" className="absolute -left-3 -bottom-6 -z-10 w-24 h-12 rounded-full bg-primary-soft/70" />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold text-soft leading-tight">{label}</span>
        <span className="w-10 h-10 shrink-0 rounded-md border border-border bg-surface grid place-items-center text-primary"><Icon name={icon} size={20} /></span>
      </div>
      {loading ? <KpiValueSkeleton /> : <span className="text-[28px] leading-none font-semibold text-ink tabular">{value}</span>}
      {loading && hint ? <Skeleton className="h-3.5 w-3/4" /> : hint && (
        <span className="flex items-center gap-1.5 text-[13px] text-soft">
          {change != null && Math.abs(change) >= 0.005 && (
            <span className={cn('flex items-center font-semibold tabular', change > 0 ? 'text-success-ink' : 'text-danger-ink')}>
              <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={14} />{Math.round(Math.abs(change) * 100)} %
            </span>
          )}
          {hint}
        </span>
      )}
    </div>
  )
}
