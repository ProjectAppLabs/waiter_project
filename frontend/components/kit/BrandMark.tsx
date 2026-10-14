'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

// Marca de Waiter: el nombre y, debajo, de quién es el producto. Es lo mismo en la barra superior del POS,
// en la pantalla de cocina y en el acceso, así que vive en un solo sitio.
export function BrandMark({ href, size = 'sm', tone = 'default', className }: { href?: string; size?: 'sm' | 'lg'; tone?: 'default' | 'inverse'; className?: string }) {
  const t = useTranslations('pos')
  const big = size === 'lg'
  const inverse = tone === 'inverse'
  const body = (
    <span className={cn('flex flex-col justify-center leading-none', className)}>
      <span className={cn('font-semibold tracking-[-0.02em]', inverse ? 'text-white' : 'text-ink', big ? 'text-[28px]' : 'text-[19px]')}>{t('brand')}</span>
      <span className={cn('tracking-[0.01em]', inverse ? 'text-white/70' : 'text-dim', big ? 'text-[12px] mt-1.5' : 'text-[10px] mt-1')}>{t('brandBy')}</span>
    </span>
  )
  if (!href) return <span aria-label={t('brand')}>{body}</span>
  return <Link href={href} aria-label={t('brand')} className="shrink-0">{body}</Link>
}
