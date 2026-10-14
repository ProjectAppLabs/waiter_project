'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const KEY = 'h-16 rounded-md text-[30px] font-medium text-ink hover:bg-muted active:bg-border disabled:opacity-40'

// Teclado del kit (Select Employee.png): 3×3, 0 al centro y borrar a la derecha.
export function NumericKeypad({ onDigit, onBackspace, disabled = false }: { onDigit: (d: string) => void; onBackspace: () => void; disabled?: boolean }) {
  const t = useTranslations('pos.kit.keypad')
  return (
    <div className="grid grid-cols-3 gap-2 w-[300px]">
      {KEYS.map((k) => <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className={KEY}>{k}</button>)}
      <span />
      <button type="button" disabled={disabled} onClick={() => onDigit('0')} className={KEY}>0</button>
      <button type="button" disabled={disabled} onClick={onBackspace} aria-label={t('backspace')} className={cn(KEY, 'grid place-items-center')}><Icon name="backspace" size={28} /></button>
    </div>
  )
}
