'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Cart } from '@/lib/types'

// Barra de pedido fija abajo: nunca se pierde de vista lo que va a pagar. Oscura por norma (nuestra, no del restaurante).
export function OrderBar({ cart, href }: { cart: Cart | null; href: string }) {
  const t = useTranslations('diner.orderBar')
  const count = itemCount(cart)
  if (count === 0) return null
  return (
    <Link href={href} aria-label={t('yourOrder')} className="fixed left-[18px] right-[18px] bottom-[18px] z-40 h-[64px] px-[18px] rounded-[16px] bg-dark text-dark-ink flex items-center justify-between shadow-lg">
      <span className="flex items-center gap-3">
        <span className="min-w-[26px] h-[26px] px-2 rounded-full bg-brand text-brand-ink text-sm font-bold grid place-items-center">{count}</span>
        <span className="flex flex-col leading-tight"><span className="text-[15px]">{t('yourOrder')}</span><span className="font-mono tabular text-[17px]">$ {formatCop(cart?.total ?? 0)}</span></span>
      </span>
      <span className="text-[15px] font-medium">{t('seeOrder')}</span>
    </Link>
  )
}
