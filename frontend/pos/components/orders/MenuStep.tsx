'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { AddDishModal, type DishDraft } from '@/components/orders/AddDishModal'
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { cartTotals, newLine, type CartLine, type OptionGroup, type TaxRate } from '@/lib/domain/orderWizard'
import type { Category, Product } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  products: Product[]; categories: Category[]; taxes: TaxRate[]
  optionsOf: (templateId: number) => OptionGroup[]; descriptionOf: (templateId: number) => string
  lines: CartLine[]
  onAdd: (line: CartLine) => void
  onUpdate: (uuid: string, patch: Pick<CartLine, 'qty' | 'note' | 'options'>) => void
  onQty: (uuid: string, qty: number) => void
  onReset: () => void
  onContinue: () => void
  emptyLabel?: string
}

// Paso 3 del kit (Menu Empty / Menu Filled.png): lista con buscador y chips a la izquierda, detalle del pedido a la derecha.
export function MenuStep({ products, categories, taxes, optionsOf, descriptionOf, lines, onAdd, onUpdate, onQty, onReset, onContinue, emptyLabel }: Props) {
  const t = useTranslations('orders.create')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [adding, setAdding] = useState<Product | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<number, number> = {}
    products.forEach((p) => p.categoryIds.forEach((id) => { c[id] = (c[id] ?? 0) + 1 }))
    return c
  }, [products])

  const visible = products.filter((p) =>
    (categoryId === null || p.categoryIds.includes(categoryId)) && p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const totals = cartTotals(lines, taxes)
  const editingLine = lines.find((l) => l.uuid === editing) ?? null
  const editingProduct = editingLine ? products.find((p) => p.id === editingLine.productId) ?? null : null

  return (
    <div className="h-full flex gap-4 p-4">
      <section aria-label={t('menuList')} className="flex-1 min-w-0 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
        <header className="h-[76px] px-5 flex items-center gap-4 border-b border-border shrink-0">
          <span className="flex items-center gap-2 text-[18px] font-semibold text-ink shrink-0"><Icon name="catalog" size={20} />{t('menuList')}</span>
          <label className="flex-1 min-w-0 relative">
            <span className="sr-only">{t('searchItem')}</span>
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchItem')}
              className="w-full h-12 pl-11 pr-4 rounded-md border border-border bg-canvas text-[15px] text-ink placeholder:text-dim focus:outline-2 focus:outline-primary" />
          </label>
        </header>

        <div className="px-5 py-3 flex gap-2 overflow-x-auto border-b border-border shrink-0">
          <Chip label={t('all')} count={products.length} active={categoryId === null} onClick={() => setCategoryId(null)} />
          {categories.map((c) => <Chip key={c.id} label={c.name} count={counts[c.id] ?? 0} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />)}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5">
          {visible.length === 0
            ? <p className="text-[15px] text-soft">{t('searchNoResults')}</p>
            : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-4">
                {visible.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border bg-surface overflow-hidden flex flex-col">
                    <div className="relative h-[130px] bg-muted grid place-items-center text-dim">
                      {p.hasImage
                        ? <img src={imageUrl(p.templateId)} alt={t('photo', { name: p.name })} className="absolute inset-0 w-full h-full object-cover" />
                        : <Icon name="photo" size={26} />}
                      <span className={cn('absolute top-2.5 left-2.5 h-7 px-2.5 rounded-sm bg-surface flex items-center gap-1.5 text-[13px] font-semibold text-ink')}>
                        <span className={cn('w-2 h-2 rounded-full', p.soldOut ? 'bg-danger' : 'bg-success')} />
                        {p.soldOut ? t('notAvailable') : t('available')}
                      </span>
                    </div>
                    <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                      <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                      {descriptionOf(p.templateId) && <p className="text-[13px] text-dim line-clamp-2">{descriptionOf(p.templateId)}</p>}
                      <div className="mt-auto pt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[17px] font-semibold text-primary tabular-nums">$ {formatCop(p.price)}</span>
                        <Button variant="secondary" size="compact" className="rounded-md" disabled={p.soldOut} onClick={() => setAdding(p)}>{t('addToCart')}</Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </section>

      <OrderDetailsPanel lines={lines} totals={totals} onReset={onReset} onQty={onQty} onEdit={setEditing}
        onRemove={(uuid) => onQty(uuid, 0)} onContinue={onContinue} emptyLabel={emptyLabel} />

      {adding && (
        <AddDishModal product={adding} description={descriptionOf(adding.templateId)} groups={optionsOf(adding.templateId)}
          onClose={() => setAdding(null)}
          onConfirm={(d: DishDraft) => { onAdd(newLine(adding, d.qty, d.note, d.options)); setAdding(null) }} />
      )}
      {editingLine && editingProduct && (
        <AddDishModal product={editingProduct} description={descriptionOf(editingProduct.templateId)} groups={optionsOf(editingProduct.templateId)}
          initial={{ qty: editingLine.qty, note: editingLine.note, options: editingLine.options }}
          onClose={() => setEditing(null)}
          onConfirm={(d: DishDraft) => { onUpdate(editingLine.uuid, d); setEditing(null) }} />
      )}
    </div>
  )
}
