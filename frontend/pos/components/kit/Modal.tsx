'use client'

import { useTranslations } from 'next-intl'
import { useEffect, type ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

const SIZE = { center: 'w-[480px] max-w-[96vw] max-h-[90dvh]', medium: 'w-[760px] max-w-[96vw] max-h-[88vh]', wide: 'w-[1046px] h-[640px] max-w-[96vw] max-h-[92vh]', full: 'w-[1174px] h-[754px] max-w-[98vw] max-h-[96vh]' }

// Modales del kit: centrado (confirmaciones), mediano (formularios de una sola decisión), ancho (Setting, Table Detail) y pantalla casi completa (wizards).
export function Modal({ open, onClose, title, size = 'center', children, footer }: { open: boolean; onClose: () => void; title?: string; size?: keyof typeof SIZE; children: ReactNode; footer?: ReactNode }) {
  const t = useTranslations('pos.ui')
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={cn('bg-surface rounded-xl shadow-xl flex flex-col overflow-hidden', SIZE[size])}>
        {(title || size !== 'center') && (
          <header className="flex items-center justify-between px-6 h-[72px] border-b border-border shrink-0">
            <span className="text-[20px] font-semibold text-ink">{title}</span>
            <button type="button" onClick={onClose} aria-label={t('close')} className="w-10 h-10 rounded-full bg-ink text-surface grid place-items-center"><Icon name="close" size={20} /></button>
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-border shrink-0">{footer}</footer>}
      </div>
    </div>
  )
}
