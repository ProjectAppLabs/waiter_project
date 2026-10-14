'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'

// Un pedido en mesa es de una mesa concreta: si no hay ninguna elegida, se pide aquí en vez de abrir el
// asistente arrastrando la última mesa que alguien tocó. Para llevar y domicilio no llevan mesa: su salida.
export function PickTablePrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('tables.pickTable')
  return (
    <Modal open={open} onClose={onClose} footer={
      <div className="flex flex-col items-center gap-3">
        <Button variant="primary" className="w-full h-12" onClick={onClose}>{t('choose')}</Button>
        <Link href="/salon/nuevo?sinMesa=1" className="text-[15px] font-semibold text-primary">{t('noTable')}</Link>
      </div>
    }>
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <span className="w-20 h-20 rounded-full bg-primary-soft text-primary grid place-items-center"><Icon name="tables" size={36} /></span>
        <p className="mt-2 text-[20px] font-semibold text-ink">{t('title')}</p>
        <p className="text-[14px] text-soft leading-relaxed">{t('body')}</p>
      </div>
    </Modal>
  )
}
