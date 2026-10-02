'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { imageUrl } from '@/lib/services/pantry'

export function IngredientPhoto({ id, hasImage, size }: { id: number; hasImage: boolean; size: 40 | 48 }) {
  const t = useTranslations('pantry.ingredients')
  return (
    <span className={`${size === 48 ? 'w-12 h-12' : 'w-10 h-10'} shrink-0 rounded-sm overflow-hidden bg-muted grid place-items-center text-dim`}>
      {hasImage
        ? <img src={imageUrl(id, 256)} alt="" className="w-full h-full object-cover" />
        : <Icon name="photo" size={size === 48 ? 22 : 18} label={t('noPhoto')} />}
    </span>
  )
}
