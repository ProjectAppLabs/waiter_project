'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { CustomerForm } from '@/components/customers/CustomerForm'
import { CustomerPanel } from '@/components/customers/CustomerPanel'
import { Card } from '@/components/kit/Card'
import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { formatCop } from '@/lib/domain/money'
import { customerOrders, identificationTypes, listCustomers, loyaltyCard, saveCustomer, type Customer, type CustomerInput, type CustomerOrder, type IdType, type LoyaltyCard } from '@/lib/services/customers'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'withOrders' | 'invoiced'
const FILTERS: Filter[] = ['all', 'withOrders', 'invoiced']
const EMPTY: CustomerInput = { name: '', phone: '', email: '', vat: '', idTypeId: null, street: '', city: '' }
const pass = (c: Customer, f: Filter) => f === 'all' || (f === 'withOrders' ? c.orders > 0 : c.invoiced > 0)

// Clientes con la estructura de "Order History" del kit: lista con buscador y chips a la izquierda, panel de detalle a la derecha.
export function CustomersView() {
  const t = useTranslations('admin.customers')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [idTypes, setIdTypes] = useState<IdType[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState<{ id: number | null } | null>(null)
  const [detail, setDetail] = useState<{ id: number; orders: CustomerOrder[]; loyalty: LoyaltyCard | null } | null>(null)

  useEffect(() => { void identificationTypes().then(setIdTypes) }, [])
  useEffect(() => { const h = setTimeout(() => { void listCustomers(query).then(setCustomers) }, 250); return () => clearTimeout(h) }, [query])
  useEffect(() => {
    if (selected === null) return
    void Promise.all([customerOrders(selected), loyaltyCard(selected).catch(() => null)]).then(([orders, loyalty]) => setDetail({ id: selected, orders, loyalty }))
  }, [selected])

  const visible = customers.filter((c) => pass(c, filter))
  const current = customers.find((c) => c.id === selected) ?? null
  const editing = form?.id ? customers.find((c) => c.id === form.id) : undefined
  async function onSave(input: CustomerInput) {
    const id = await saveCustomer(form?.id ?? null, input)
    setCustomers(await listCustomers(query))
    setSelected(id)
    setForm({ id })
  }
  return (
    <>
      <PageHeader title={t('title')} actions={<>
        <SearchInput value={query} onChange={setQuery} placeholder={t('search')} className="w-[360px]" />
        <Button variant="primary" onClick={() => setForm({ id: null })}><Icon name="plus" size={18} />{t('new')}</Button>
      </>}>
        {FILTERS.map((f) => <Chip key={f} label={t(`filters.${f}`)} count={customers.filter((c) => pass(c, f)).length} active={filter === f} onClick={() => setFilter(f)} />)}
      </PageHeader>
      {/* Por debajo de 1280 px la lista y la ficha van una sobre otra: lado a lado la lista quedaba apretada y cortaba datos. */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-4 px-5 pb-5 overflow-y-auto xl:overflow-visible">
        <Card className="xl:flex-1 min-w-0 shrink-0 xl:shrink">
          <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
            {visible.length === 0 && <KitEmptyState icon="users" title={t('empty')} body={t('emptyBody')} />}
            {visible.map((c) => (
              <button key={c.id} type="button" onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}
                className={cn('rounded-md border bg-surface text-left overflow-hidden hover:border-primary/60', selected === c.id ? 'border-primary' : 'border-border')}>
                <div className="min-h-10 px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 bg-muted text-[13px]"><span className="font-semibold text-ink">{c.name}</span><span className="text-soft tabular whitespace-nowrap">{c.vat || t('cols.doc') + ': —'}</span></div>
                <div className="px-4 py-3 grid grid-cols-[repeat(3,max-content)] gap-x-6 divide-x divide-border text-[15px] whitespace-nowrap">
                  <div><p className="text-[13px] text-soft">{t('cols.phone')}</p><p className="font-semibold text-ink">{c.phone || '—'}</p></div>
                  <div className="pl-6"><p className="text-[13px] text-soft">{t('cols.orders')}</p><p className="font-semibold text-ink tabular">{c.orders}</p></div>
                  <div className="pl-6"><p className="text-[13px] text-soft">{t('cols.invoiced')}</p><p className="font-semibold text-ink tabular">$&nbsp;{formatCop(c.invoiced)}</p></div>
                </div>
              </button>
            ))}
          </div>
        </Card>
        <CustomerPanel customer={current} loyalty={detail?.id === selected ? detail.loyalty : undefined} history={detail?.id === selected ? detail.orders : []} onEdit={() => setForm({ id: selected })} />
      </div>
      {form && (
        <CustomerForm key={form.id ?? 'new'} initial={editing ? { name: editing.name, phone: editing.phone, email: editing.email, vat: editing.vat, idTypeId: editing.idTypeId, street: editing.street, city: editing.city } : EMPTY}
          isNew={form.id === null} idTypes={idTypes} onSave={onSave} onClose={() => setForm(null)} />
      )}
    </>
  )
}
