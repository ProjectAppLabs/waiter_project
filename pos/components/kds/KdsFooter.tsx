'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { AlertThresholdsButton } from '@/components/settings/AlertThresholdsButton'
import { Button } from '@/components/ui/Button'

const LEGEND = [['ok', 'bg-success'], ['warn', 'bg-progress'], ['late', 'bg-danger']] as const

// Pie de la pantalla de cocina: leyenda de tiempos con los tonos del kit, los umbrales de alerta (administrador) y el botón
// de silenciar avisos.
export function KdsFooter({ muted, onToggleMute }: { muted: boolean; onToggleMute: () => void }) {
  const t = useTranslations('kds')
  return (
    <footer className="shrink-0 h-16 px-5 flex items-center gap-6 border-t border-border bg-surface text-[14px] text-soft">
      {LEGEND.map(([key, dot]) => <span key={key} className="flex items-center gap-2"><span aria-hidden className={`w-2.5 h-2.5 rounded-full ${dot}`} />{t(`legend.${key}`)}</span>)}
      <span>{t('legend.suffix')}</span>
      <div className="ml-auto flex items-center gap-3">
        <AlertThresholdsButton />
        <Button size="compact" aria-pressed={muted} onClick={onToggleMute}><Icon name={muted ? 'volumeOff' : 'volume'} size={18} />{muted ? t('unmute') : t('mute')}</Button>
      </div>
    </footer>
  )
}
