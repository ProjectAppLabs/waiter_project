'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { CategoryPanel } from '@/components/catalog/CategoryPanel'
import { ProductForm } from '@/components/catalog/ProductForm'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { formatCop } from '@/lib/domain/money'
import { setCatalogPhotos, listCategories, listProducts, listTaxes, saveCategory, saveProduct, type AdminCategory, type AdminProduct, type ProductInput, type Tax } from '@/lib/services/catalogAdmin'

export type MenuAdminRequest = { kind: 'product'; id: number } | { kind: 'categories' } | { kind: 'offMenu' }

// La ficha comercial de un plato (precio, foto, categoría, impuestos, mostrarlo u ocultarlo, tiempo de preparación,
// precio anterior…) y las categorías de la carta. Vivía en Administración → Catálogo, que repetía la lista de platos de
// Inventario; ahora todo lo de un plato se hace desde aquí: su receta y existencias, y también cómo se vende.
// `offMenu` lista lo que Inventario no muestra —platos ocultos de la carta o sin categoría— para poder devolverlos.
export function MenuAdmin({ request, onClose, onChanged }: { request: MenuAdminRequest; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations('pantry.menuAdmin')
  const [data, setData] = useState<{ products: AdminProduct[]; categories: AdminCategory[]; taxes: Tax[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null) // plato abierto desde la lista de fuera de carta
  const load = useCallback(() => Promise.all([listProducts(), listCategories(), listTaxes()]).then(([products, categories, taxes]) => setData({ products, categories, taxes })), [])
  useEffect(() => {
    let alive = true
    Promise.all([listProducts(), listCategories(), listTaxes()]).then(([products, categories, taxes]) => { if (alive) setData({ products, categories, taxes }) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (!data) return <Modal open onClose={onClose} title={t('title')} size="center"><p role={failed ? 'alert' : undefined} className="p-8 text-center text-dim">{failed ? t('loadFailed') : t('loading')}</p></Modal>

  const productId = request.kind === 'product' ? request.id : picked
  const editing = productId !== null ? data.products.find((p) => p.id === productId) : undefined
  if (editing) {
    const initial: ProductInput = { name: editing.name, price: editing.price, categoryIds: editing.categoryIds, taxIds: editing.taxIds, available: editing.available, storable: editing.storable,
      favorite: editing.favorite, description: editing.description, dinerAttributes: editing.dinerAttributes }
    return <ProductForm key={editing.id} initial={initial} hasImage={editing.hasImage} templateId={editing.id} isNew={false} categories={data.categories} taxes={data.taxes}
      extraProducts={data.products.filter((p) => p.available && p.variantId && p.id !== editing.id).map((p) => ({ id: p.variantId!, name: p.name }))}
      onSave={async (input) => { await saveProduct(editing.id, input); if (input.gallery) await setCatalogPhotos(editing.id, input.gallery); await load(); onChanged() }}
      onClose={() => (request.kind === 'offMenu' ? setPicked(null) : onClose())} />
  }
  if (request.kind === 'product') return <Modal open onClose={onClose} title={t('title')} size="center"><p role="alert" className="p-8 text-center text-soft">{t('notFound')}</p></Modal>

  if (request.kind === 'categories') {
    return <CategoryPanel categories={data.categories} productCount={(id) => data.products.filter((p) => p.categoryIds.includes(id)).length}
      onSave={async (id, c) => { await saveCategory(id, c); await load(); onChanged() }} onClose={onClose} />
  }

  const offMenu = data.products.filter((p) => !p.available || p.categoryIds.length === 0)
  return (
    <Modal open onClose={onClose} title={t('offMenuTitle')} size="medium">
      <div className="p-6 flex flex-col gap-3">
        <p className="text-[14px] text-soft">{t('offMenuIntro')}</p>
        {offMenu.length === 0 ? <p className="text-[15px] text-dim">{t('offMenuEmpty')}</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {offMenu.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setPicked(p.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-ink truncate">{p.name}</span>
                    <span className="block text-[13px] text-soft">{[!p.available && t('hidden'), p.categoryIds.length === 0 && t('noCategory')].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-[15px] text-ink tabular">$ {formatCop(p.price)}</span>
                  <Icon name="chevronRight" size={18} className="text-dim" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// Cuántos productos hay fuera de la carta, para rotular el botón sin abrir el modal.
export async function countOffMenu(): Promise<number> {
  return (await listProducts()).filter((p) => !p.available || p.categoryIds.length === 0).length
}
