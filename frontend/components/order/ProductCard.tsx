'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'

import { Money } from '@/components/ui/Money'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const t = useTranslations('pos.order')
  return (
    <button type="button" onClick={() => onAdd(product)} disabled={product.soldOut} aria-disabled={product.soldOut}
      className={cn('h-[214px] rounded-[14px] bg-surface overflow-hidden flex flex-col text-left active:ring-4 active:ring-brand-50',
        product.favorite ? 'border-2 border-brand-500 ring-4 ring-brand-50' : 'border border-border', product.soldOut && 'opacity-55')}>
      <div className="relative flex-1 bg-muted grid place-items-center text-xs tracking-[0.08em] uppercase text-ink-3 overflow-hidden">
        {product.hasImage ? <img src={imageUrl(product.templateId)} alt="" className="absolute inset-0 w-full h-full object-cover" /> : t('photo')}
        {product.favorite && !product.soldOut && <span className="absolute top-2.5 left-2.5 h-7 px-2.5 rounded-sm bg-brand-500 text-white text-[13px] font-bold grid place-items-center normal-case tracking-normal">{t('favorite')}</span>}
        {product.soldOut && <span className="absolute top-2.5 left-2.5 h-7 px-2.5 rounded-sm bg-busy text-white text-[13px] font-bold grid place-items-center normal-case tracking-normal">{t('soldOut')}</span>}
      </div>
      <div className="px-3.5 py-3 flex flex-col gap-1.5">
        <span className="text-[17px] font-bold leading-tight">{product.name}</span>
        <Money amount={product.price} className="text-[17px]" />
      </div>
    </button>
  )
}
