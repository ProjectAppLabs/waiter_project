'use client'

import { useTranslations } from 'next-intl'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { useToastStore, type ToastTone } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

const ICON: Record<ToastTone, { name: KitIcon; cls: string }> = {
  success: { name: 'check', cls: 'bg-success text-white' }, danger: { name: 'close', cls: 'bg-danger text-white' }, info: { name: 'bell', cls: 'bg-info text-white' },
}

// Toast del kit (Success Order.png): oscuro, abajo al centro, icono en círculo, título y frase, ✕.
export function Toaster() {
  const t = useTranslations('pos.ui')
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-3 w-[480px] max-w-[92vw]">
      {toasts.map((x) => (
        <div key={x.id} role="status" className="flex items-start gap-3 p-4 rounded-lg bg-[#131316] text-[#F7F7F7] shadow-xl">
          <span className={cn('w-9 h-9 rounded-full grid place-items-center shrink-0', ICON[x.tone].cls)}><Icon name={ICON[x.tone].name} size={18} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold">{x.title}</p>
            {x.body && <p className="text-[13px] text-[#A0A0AB]">{x.body}</p>}
          </div>
          <button type="button" onClick={() => dismiss(x.id)} aria-label={t('close')} className="text-[#A0A0AB] hover:text-white"><Icon name="close" size={18} /></button>
        </div>
      ))}
    </div>
  )
}
