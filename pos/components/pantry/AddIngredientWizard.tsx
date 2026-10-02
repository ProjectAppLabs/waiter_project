'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { INPUT, LABEL, PrimaryButton, WizardFrame } from '@/components/pantry/WizardFrame'
import { imageDataUrl, resizeImage, validateLogoFile } from '@/lib/domain/image'
import { PANTRY_CATEGORIES, categoryEmoji, type Ingredient, type PantryCategory } from '@/lib/domain/pantry'
import { Button } from '@/components/ui/Button'
import { onCore } from '@/lib/domain/backend'
import { createIngredient, createSupplier, imageUrl, updateIngredient, type KitUnit, type Supplier } from '@/lib/services/pantry'
import { toast } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

const PHOTO_MAX = { width: 512, height: 512 }
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

// "Add New Ingredients" del kit en dos pasos: datos (nombre, categoría, stock inicial, unidad, foto) y proveedor en
// rejilla con buscador. Al enviar llama a `waiter_create_ingredient` del addon. Con `initial` edita (menú ⋯ → Editar).
export function AddIngredientWizard({ open, onClose, initial = null, units, suppliers, onSaved }: {
  open: boolean; onClose: () => void; initial?: Ingredient | null; units: KitUnit[]; suppliers: Supplier[]; onSaved: () => Promise<void>
}) {
  const t = useTranslations('pantry.ingredientWizard')
  const ta = useTranslations('pantry.actions')
  const tc = useTranslations('pantry.categories')
  const tu = useTranslations('pantry.units')
  const ts = useTranslations('pantry.search')
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<PantryCategory | null>(initial?.category ?? null)
  const [stock, setStock] = useState(initial ? String(initial.qty) : '')
  const [uomId, setUomId] = useState<number | null>(initial ? units.find((u) => u.id === initial.uomId)?.id ?? null : null)
  const [image, setImage] = useState<string | undefined>(undefined)
  const [supplierId, setSupplierId] = useState<number | null>(initial?.supplierId ?? null)
  const [query, setQuery] = useState('')
  const [extra, setExtra] = useState<Supplier[]>([])
  const [newSupplier, setNewSupplier] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  function next() {
    if (!name.trim()) return setError(t('errors.name'))
    if (category === null) return setError(t('errors.category'))
    if (stock !== '' && !(Number(stock) >= 0)) return setError(t('errors.stock'))
    if (uomId === null) return setError(t('errors.unit'))
    setError(null); setStep(1)
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    if (validateLogoFile(f)) return setError(t('errors.photo'))
    setError(null); setImage(await resizeImage(f, PHOTO_MAX))
  }

  async function submit() {
    if (supplierId === null) return setError(t('errors.supplier'))
    setSaving(true); setError(null)
    const input = { name: name.trim(), category: category as PantryCategory, uomId: uomId as number, stock: Number(stock || 0), image, supplierId }
    try {
      if (initial) await updateIngredient(initial, input); else await createIngredient(input)
      toast(initial ? { title: t('editedTitle'), body: t('editedBody') } : { title: t('successTitle'), body: t('successBody') })
      onClose()
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const visible = [...suppliers, ...extra].filter((s) => s.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))
  async function addSupplier() {
    if (!newSupplier.trim()) return
    setCreating(true); setError(null)
    try { const s = await createSupplier(newSupplier.trim()); setExtra((v) => [...v, s]); setSupplierId(s.id); setNewSupplier('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setCreating(false) }
  }
  const preview = image ? imageDataUrl(image) : initial?.hasImage ? imageUrl(initial.id, 256) : null
  const footer = (
    <>
      {step === 0 ? <PrimaryButton onClick={next}>{ta('saveNext')}</PrimaryButton> : <PrimaryButton onClick={submit} disabled={saving}>{ta('saveSubmit')}</PrimaryButton>}
      {error && <p role="alert" className="text-[14px] text-danger-ink">{error}</p>}
    </>
  )
  const search = (
    <label className="h-10 w-[400px] px-3 rounded-md border border-border bg-surface flex items-center gap-2 text-soft">
      <Icon name="search" size={18} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ts('supplier')} aria-label={ts('supplier')} className="flex-1 min-w-0 bg-transparent text-[14px] text-ink placeholder:text-dim outline-none" />
    </label>
  )
  return (
    <WizardFrame open={open} onClose={onClose} title={initial ? t('editTitle') : t('title')} steps={[t('steps.info'), t('steps.supplier')]} current={step}
      paneTitle={step === 0 ? t('infoTitle') : t('supplierTitle')} paneAction={step === 1 ? search : undefined} footer={footer}>
      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2"><span className={LABEL}>{t('name')}</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} className={INPUT} /></label>
          <div className="flex flex-col gap-2" role="group" aria-label={t('category')}>
            <span className={LABEL}>{t('category')}</span>
            <div className="flex flex-wrap gap-4 [&>button]:min-w-[120px] [&>button]:justify-center">
              {PANTRY_CATEGORIES.map((c) => <Chip key={c.key} label={`${categoryEmoji(c.key)} ${tc(c.key)}`} active={c.key === category} onClick={() => setCategory(c.key)} />)}
            </div>
          </div>
          <label className="flex flex-col gap-2"><span className={LABEL}>{initial?'Existencias actuales':t('initialStock')}</span><input disabled={Boolean(initial)} type="number" min={0} step="any" value={stock} onChange={(e) => setStock(e.target.value)} placeholder={t('initialStockPlaceholder')} className={`${INPUT} max-w-[390px]`} /></label>
          {initial&&<p className="text-sm text-soft">Para registrar entradas, mermas o conteos, usa «Existencias y movimientos».</p>}
          <div className="flex flex-col gap-2" role="group" aria-label={t('unit')}>
            <span className={LABEL}>{t('unit')}</span>
            <div className="flex flex-wrap gap-4 [&>button]:min-w-[120px] [&>button]:justify-center">{units.map((u) => <Chip key={u.id} label={tu(u.key)} active={u.id === uomId} onClick={() => setUomId(u.id)} />)}</div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={LABEL}>{t('photo')}</span>
            <input ref={file} type="file" accept="image/png,image/jpeg" className="hidden" aria-label={t('photo')} onChange={(e) => void onFile(e.target.files?.[0])} />
            <button type="button" onClick={() => file.current?.click()} className="h-[132px] rounded-md border border-dashed border-border bg-canvas flex items-center justify-center gap-4 text-center">
              {preview ? <img src={preview} alt="" className="h-24 w-24 rounded-sm object-cover" /> : <span className="w-12 h-12 rounded-full bg-surface border border-border grid place-items-center text-soft"><Icon name="upload" size={22} /></span>}
              <span className="flex flex-col gap-1 text-left">
                <span className="text-[15px] font-semibold text-ink">{preview ? t('photoChange') : t('photoTap')}<span className="font-normal text-soft"> {preview ? '' : t('photoTapBody')}</span></span>
                <span className="text-[13px] text-dim">{t('photoHint')}</span>
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
        {onCore() && (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void addSupplier() }}>
            <input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder={t('newSupplierPlaceholder')} aria-label={t('newSupplier')} className={cn(INPUT, 'max-w-[390px]')} />
            <Button type="submit" disabled={!newSupplier.trim() || creating}>{t('addSupplier')}</Button>
          </form>
        )}
        <div className="grid grid-cols-4 gap-4" role="radiogroup" aria-label={t('supplierTitle')}>
          {visible.length === 0 && <p className="col-span-4 text-[14px] text-soft">{t('noSuppliers')}</p>}
          {visible.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === supplierId} onClick={() => setSupplierId(s.id)}
              className={cn('h-[140px] rounded-md border bg-surface flex flex-col items-center justify-center gap-3 px-3', s.id === supplierId ? 'border-primary' : 'border-border')}>
              <span className="w-16 h-16 rounded-full bg-primary-soft text-primary grid place-items-center text-[20px] font-semibold overflow-hidden">
                {s.hasImage ? <img src={`/odoo/web/image/res.partner/${s.id}/image_128`} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
              </span>
              <span className="text-[15px] font-semibold text-ink text-center leading-tight">{s.name}</span>
            </button>
          ))}
        </div>
        </div>
      )}
    </WizardFrame>
  )
}
