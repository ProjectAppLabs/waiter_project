'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { INPUT, LABEL, PrimaryButton, WizardFrame } from '@/components/pantry/WizardFrame'
import type { Ingredient } from '@/lib/domain/pantry'
import type { AdminCategory } from '@/lib/services/catalogAdmin'
import { createDish, type KitUnit } from '@/lib/services/pantry'
import { toast } from '@/lib/stores/toastStore'

interface Line { ingredientId: number | null; qty: string; uomId: number | null }
const emptyLine = (): Line => ({ ingredientId: null, qty: '', uomId: null })

export function AddDishWizard({ open, onClose, categories, ingredients, units, onSaved }: {
  open: boolean; onClose: () => void; categories: AdminCategory[]; ingredients: Ingredient[]; units: KitUnit[]; onSaved: () => Promise<void>
}) {
  const t = useTranslations('pantry.dishWizard')
  const ta = useTranslations('pantry.actions')
  const tu = useTranslations('pantry.units')
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => { setStep(0); setName(''); setCategoryId(null); setDescription(''); setPrice(''); setLines([emptyLine()]); setError(null) }
  const close = () => { reset(); onClose() }

  function next() {
    if (!name.trim()) return setError(t('errors.name'))
    if (categoryId === null) return setError(t('errors.category'))
    if (!(Number(price) > 0)) return setError(t('errors.price'))
    setError(null); setStep(1)
  }
  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const pickIngredient = (i: number, ingredientId: number | null) => {
    const ing = ingredients.find((x) => x.id === ingredientId)
    patch(i, { ingredientId, uomId: units.find((u) => u.id === ing?.uomId)?.id ?? null })
  }

  async function submit() {
    const filled = lines.filter((l) => l.ingredientId !== null || l.qty !== '')
    if (filled.some((l) => l.ingredientId === null || !(Number(l.qty) > 0) || l.uomId === null)) return setError(t('errors.lines'))
    setSaving(true); setError(null)
    try {
      await createDish({ name: name.trim(), categoryIds: categoryId === null ? [] : [categoryId], description: description.trim(), price: Number(price),
        recipe: filled.map((l) => ({ ingredientId: l.ingredientId as number, qty: Number(l.qty), uomId: l.uomId as number })) })
      toast({ title: t('successTitle'), body: t('successBody') })
      close()
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const footer = (
    <>
      {step === 0 ? <PrimaryButton onClick={next}>{ta('saveNext')}</PrimaryButton> : <PrimaryButton onClick={submit} disabled={saving}>{ta('saveSubmit')}</PrimaryButton>}
      {error && <p role="alert" className="text-[14px] text-danger-ink">{error}</p>}
    </>
  )
  return (
    <WizardFrame open={open} onClose={close} title={t('title')} steps={[t('steps.info'), t('steps.ingredients')]} current={step} paneTitle={step === 0 ? t('infoTitle') : t('ingredientsTitle')} footer={footer}>
      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2"><span className={LABEL}>{t('name')}</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} className={INPUT} /></label>
          <div className="flex flex-col gap-2" role="group" aria-label={t('category')}>
            <span className={LABEL}>{t('category')}</span>
            <div className="flex flex-wrap gap-4 [&>button]:min-w-[120px] [&>button]:justify-center">{categories.map((c) => <Chip key={c.id} label={c.name} active={c.id === categoryId} onClick={() => setCategoryId(c.id)} />)}</div>
          </div>
          <label className="flex flex-col gap-2"><span className={LABEL}>{t('description')}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} className={`${INPUT} h-36 py-3 resize-none`} /></label>
          <label className="flex flex-col gap-2"><span className={LABEL}>{t('price')}</span>
            <span className={`${INPUT} flex items-center gap-2`}><span className="text-soft">$</span><input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} aria-label={t('price')} className="flex-1 min-w-0 bg-transparent outline-none" /></span>
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_80px_200px] gap-2.5 text-[15px] font-semibold text-ink"><span>{t('ingredientName')}</span><span>{t('quantity')}</span><span>{t('unit')}</span></div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_200px] gap-2.5" role="group" aria-label={t('row', { n: i + 1 })}>
              <select value={l.ingredientId ?? ''} onChange={(e) => pickIngredient(i, e.target.value ? Number(e.target.value) : null)} aria-label={t('ingredientName')} className={INPUT}>
                <option value="">{t('selectIngredient')}</option>{ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input type="number" min={0} step="any" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} aria-label={t('quantity')} className={INPUT} />
              <select value={l.uomId ?? ''} onChange={(e) => patch(i, { uomId: e.target.value ? Number(e.target.value) : null })} aria-label={t('unit')} className={INPUT}>
                <option value="">{t('selectUnit')}</option>{units.map((u) => <option key={u.id} value={u.id}>{tu(u.key)}</option>)}
              </select>
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="self-start h-10 px-3.5 rounded-md border border-primary text-primary text-[15px] font-semibold flex items-center gap-1.5">
            <Icon name="plus" size={18} />{ta('addIngredientRow')}
          </button>
        </div>
      )}
    </WizardFrame>
  )
}
