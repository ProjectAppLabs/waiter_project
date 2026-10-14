import { useTranslations } from 'next-intl'

import { LEVEL_BARS, type StockLevel } from '@/lib/domain/pantry'
import { cn } from '@/lib/utils'

const TEXT: Record<StockLevel, string> = { high: 'text-success-ink', medium: 'text-progress-ink', low: 'text-danger-ink', empty: 'text-dim' }
const BAR: Record<StockLevel, string> = { high: 'bg-success', medium: 'bg-progress', low: 'bg-danger', empty: 'bg-dim' }

// Nivel de stock del kit: barritas apiladas y la palabra en su color (Alto verde, Medio naranja, Bajo rojo).
// Sin nivel (plato sin receta) el kit no pinta nada: se muestra "—" para no inventar un valor.
export function LevelBadge({ level }: { level: StockLevel | null }) {
  const t = useTranslations('pantry.levels')
  if (level === null) return <span className="text-[13px] font-semibold text-dim">{t('none')}</span>
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-semibold', TEXT[level])} data-level={level}>
      <span className="flex flex-col-reverse gap-px" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className={cn('w-1 h-1 rounded-[1px]', i < LEVEL_BARS[level] ? BAR[level] : 'bg-border')} />)}
      </span>
      {t(level)}
    </span>
  )
}
