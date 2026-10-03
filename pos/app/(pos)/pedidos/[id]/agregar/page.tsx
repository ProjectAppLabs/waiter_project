'use client'

import { useParams, useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { formatOrderDate } from '@/components/orders/format'
import { MenuProductCard } from '@/components/orders/MenuProductCard'
import { RoundCart } from '@/components/orders/RoundCart'
import { cartTotals, type TaxRate } from '@/lib/domain/orderState'
import { useKitOrders } from '@/lib/hooks/useKitOrders'
import { addRound, listTaxes } from '@/lib/services/ordersKit'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import { toast } from '@/lib/stores/toastStore'

// "Pop Up Add New Order" del kit (8 – Add New Order): catálogo con buscador y categorías a la izquierda, "Nueva ronda" a la derecha.
// El carrito es el borrador del orderStore; al enviar, las líneas se agregan al pedido abierto y se dispara un curso nuevo.
export default function AgregarRondaPage() {
  const t = useTranslations('orders')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const orderId = Number(params.id)
  const returnTo = usePathname().startsWith('/salon') ? '/salon' : '/pedidos'
  const session = useAuthStore((s) => s.session)
  const catalog = useCatalogStore((s) => s.catalog)
  const { draft, start, add, changeQty, note, remove, discard } = useOrderStore()
  const { orders, loaded } = useKitOrders()
  const order = orders.find((o) => o.id === orderId) ?? null
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [taxes, setTaxes] = useState<TaxRate[]>([])
  const [busy, setBusy] = useState(false)
  const startedFor = useRef<number | null>(null)

  // Un carrito nuevo por pedido: el borrador del salón (si lo había) no se mezcla con la ronda.
  useEffect(() => {
    if (!session || !order || startedFor.current === order.id) return
    startedFor.current = order.id
    start(session.id, order.tableId ?? 0, 1)
  }, [session, order, start])
  useEffect(() => () => discard(), [discard])
  useEffect(() => {
    if (!catalog) return
    const ids = [...new Set(catalog.products.flatMap((p) => p.taxIds))]
    listTaxes(ids).then(setTaxes).catch(() => setTaxes([]))
  }, [catalog])

  const products = useMemo(() => (catalog?.products ?? []).filter((p) => p.categoryIds.length > 0 && p.name.toLowerCase().includes(query.trim().toLowerCase())), [catalog, query])
  const categories = useMemo(() => (catalog?.categories ?? []).map((c) => ({ ...c, items: products.filter((p) => p.categoryIds.includes(c.id)) })).filter((c) => c.items.length > 0), [catalog, products])
  const shown = categoryId === null ? categories : categories.filter((c) => c.id === categoryId)
  const lines = useMemo(() => draft?.lines ?? [], [draft])
  const totals = useMemo(() => cartTotals(lines, taxes), [lines, taxes])
  const productOf = useCallback((id: number) => catalog?.products.find((p) => p.id === id), [catalog])
  const inCart = (productId: number) => lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0)
  const close = () => router.push(returnTo)

  async function send() {
    if (!order || lines.length === 0) return
    setBusy(true)
    try {
      await addRound(order.id, lines, { number: order.number, tableId: order.tableId })
      toast({ title: t('addRound.sent', { number: order.number }), body: t('addRound.sentBody') })
      discard()
      router.push(returnTo)
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), tone: 'danger' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 grid place-items-center bg-overlay/60">
        <div role="dialog" aria-modal="true" aria-label={t('addRound.title')} className="w-[1174px] h-[754px] max-w-[98vw] max-h-[96vh] bg-surface rounded-xl shadow-xl flex flex-col overflow-hidden">
          <header className="h-[72px] px-4 flex items-center gap-3 border-b border-border shrink-0">
            {order?.tableNumber != null && <span className="w-10 h-10 rounded-md bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold">{order.tableNumber}</span>}
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-ink">{order ? `${order.number} / ${order.customer || t('card.noCustomer')}` : ''}</span>
              <span className="text-[13px] text-soft">{order ? formatOrderDate(order.startedAt) : ''}</span>
            </div>
            <button type="button" onClick={close} aria-label={t('addRound.close')} className="ml-auto w-10 h-10 rounded-full bg-ink text-surface grid place-items-center"><Icon name="close" size={20} /></button>
          </header>
          {loaded && !order
            ? <KitEmptyState icon="orders" title={t('addRound.notFound')} />
            : <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_380px] gap-3 p-3 bg-canvas">
              <section aria-label={t('addRound.title')} className="rounded-lg border border-border bg-surface flex flex-col min-h-0 min-w-0">
                <div className="px-4 h-16 flex items-center gap-4 shrink-0">
                  <span className="inline-flex items-center gap-2 text-[17px] font-semibold text-ink"><Icon name="inventory" size={20} />{t('addRound.title')}</span>
                  <label className="ml-auto w-[320px] h-11 px-3 rounded-md border border-border bg-surface flex items-center gap-2 text-dim">
                    <Icon name="search" size={20} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('addRound.search')} aria-label={t('addRound.search')} className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-ink placeholder:text-dim" />
                  </label>
                </div>
                <div className="px-4 pb-3 flex gap-2 overflow-x-auto shrink-0">
                  <Chip label={t('addRound.all')} count={products.length} active={categoryId === null} onClick={() => setCategoryId(null)} />
                  {categories.map((c) => <Chip key={c.id} label={c.name} count={c.items.length} active={c.id === categoryId} onClick={() => setCategoryId(c.id)} />)}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-4 border-t border-border pt-3">
                  {shown.map((c) => (
                    <div key={c.id} className="flex flex-col gap-3">
                      <div className="flex items-center gap-3"><span className="h-9 px-3 rounded-md bg-muted text-[14px] font-semibold text-ink inline-flex items-center">{c.name}</span><span className="flex-1 border-t border-dashed border-border" /></div>
                      <div className="grid grid-cols-3 gap-3">
                        {c.items.map((p) => <MenuProductCard key={p.id} product={p} inCart={inCart(p.id)} onAdd={() => add(p)} disabled={!draft} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <RoundCart lines={lines} totals={totals} busy={busy} productOf={productOf} onQty={changeQty} onRemove={remove} onReset={() => lines.forEach((l) => remove(l.uuid))}
                onNote={(uuid) => { const v = window.prompt(t('addRound.notePrompt'), lines.find((l) => l.uuid === uuid)?.note ?? ''); if (v !== null) note(uuid, v) }} onSend={() => void send()} />
            </div>}
        </div>
      </div>
    </>
  )
}
