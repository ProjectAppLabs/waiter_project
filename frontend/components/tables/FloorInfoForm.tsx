'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import type { FloorType } from '@/lib/domain/tablesKit'
import { toast } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

export interface FloorInfo { number: string; type: FloorType; background: string | null | undefined; preview: string | null }
const MAX_BYTES = 10 * 1024 * 1024
const ANALYZE_MS = 1_500

// Paso "Información" del kit (Add New Table/Table Info - 1..3.png): número, tipo Interior/Exterior y plano opcional.
// "Analizando tu plano" es decorativo, como en el kit: 1,5 s y se muestra la imagen tal cual se subió.
export function FloorInfoForm({ value, onChange, edit = false }: { value: FloorInfo; onChange: (v: FloorInfo) => void; edit?: boolean }) {
  const t = useTranslations('tables.wizard')
  const [analyzing, setAnalyzing] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!analyzing) return
    const id = setTimeout(() => setAnalyzing(false), ANALYZE_MS)
    return () => clearTimeout(id)
  }, [analyzing])

  function pick(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_BYTES) { toast({ title: t('tooBig'), tone: 'danger' }); return }
    const reader = new FileReader()
    reader.onload = () => { const url = String(reader.result); onChange({ ...value, background: url.split(',')[1] ?? '', preview: url }); setAnalyzing(true) }
    reader.readAsDataURL(f)
  }

  if (analyzing) {
    return (
      <div role="status" className="flex-1 min-h-[360px] grid place-items-center">
        <div className="flex flex-col items-center gap-2 text-success-ink"><Icon name="loader" size={22} className="animate-spin" /><span className="text-[15px] font-semibold">{t('analyzing')}</span></div>
      </div>
    )
  }
  return (
    <div className="p-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[14px] text-ink">
        <span>{t('number')}</span>
        <input value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder={t('numberPlaceholder')} inputMode="numeric"
          className="h-11 px-3.5 rounded-sm border border-border bg-surface text-[15px] text-ink focus:outline-2 focus:outline-primary" />
      </label>
      <div className="flex flex-col gap-1.5 text-[14px] text-ink">
        <span id="floor-type-label">{t('type')}</span>
        <div role="radiogroup" aria-labelledby="floor-type-label" className="inline-flex self-start p-1 rounded-md bg-muted">
          {(['indoor', 'outdoor'] as FloorType[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={value.type === k} onClick={() => onChange({ ...value, type: k })}
              className={cn('h-9 px-3.5 rounded-sm text-[15px] font-semibold', value.type === k ? 'bg-surface border border-border text-ink' : 'text-dim')}>{t(k)}</button>
          ))}
        </div>
      </div>
      {!edit && (
        <div className="flex flex-col gap-1.5 text-[14px] text-ink">
          <span>{t('upload')} <span className="text-dim">{t('optional')}</span></span>
          <input ref={file} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={t('upload')} onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => file.current?.click()} className="w-60 h-40 rounded-md border border-dashed border-border bg-surface grid place-items-center overflow-hidden">
              {value.preview ? <img src={value.preview} alt="" className="w-full h-full object-contain" /> : (
                <span className="flex flex-col items-center gap-3 text-[15px] text-dim"><Icon name="photoPlus" size={28} /><span><strong className="text-primary font-semibold">{t('tapHere')}</strong> {t('toUpload')}</span></span>
              )}
            </button>
            {value.preview && <button type="button" onClick={() => onChange({ ...value, background: null, preview: null })} className="h-9 px-3 rounded-sm border border-border text-[13px] text-soft">{t('removeImage')}</button>}
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-dim"><Icon name="info" size={14} />{t('formats')}</span>
        </div>
      )}
    </div>
  )
}
