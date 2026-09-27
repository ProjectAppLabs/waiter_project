'use client'

/* eslint-disable @next/next/no-img-element -- Miniaturas que sirve experience por id; next/image no aplica a otro origen. */
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { DECORATION_TYPES, addMenuDecoration, decorationUrl, listMenuDecorations, readDecoration, removeMenuDecoration, type MenuDecorationList } from '@/lib/services/menuDecorations'

const kb = (bytes: number) => `${Math.round(bytes / 1000)} KB`

// Configuración › Diseño del menú › Decoraciones: PNG o WebP pequeños que la IA (o una plantilla) coloca sobre los
// componentes del menú con <decoracion id="…"/>. La imagen vive en experience y solo llega al comensal por su id.
export function MenuDecorationsForm() {
  const t = useTranslations('pos.settings.decorations')
  const [data, setData] = useState<MenuDecorationList | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => setData(await listMenuDecorations())
  useEffect(() => {
    let alive = true
    listMenuDecorations().then((d) => { if (alive) setData(d) }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : t('loadError')) })
    return () => { alive = false }
  }, [t])

  async function add() {
    if (!data || !file) return
    setBusy(true); setError(''); setNotice('')
    try {
      const image = await readDecoration(file, data.limites)
      const created = await addMenuDecoration(name.trim(), image)
      setNotice(t('added', { id: created.id }))
      setName(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      const reason = e instanceof Error ? e.message : ''
      setError(reason === 'tipo' ? t('typeError') : reason === 'peso' ? t('sizeError', { kb: kb(data.limites.peso) }) : reason === 'lectura' ? t('readError') : reason || t('addError'))
    } finally { setBusy(false) }
  }
  async function remove(id: string) {
    setBusy(true); setError(''); setNotice('')
    try { await removeMenuDecoration(id); setConfirming(null); setNotice(t('removed', { id })); await load() }
    catch (e) { setError(e instanceof Error ? e.message : t('removeError')) }
    finally { setBusy(false) }
  }

  const full = !!data && data.decoraciones.length >= data.limites.cantidad
  return (
    <section className="mt-6 border border-border rounded-lg p-5 flex flex-col gap-4 max-w-3xl">
      <h3 className="text-lg font-semibold">{t('title')}</h3>
      <p className="text-[15px] leading-relaxed text-soft">{data ? t('intro', { kb: kb(data.limites.peso), side: data.limites.lado, max: data.limites.cantidad }) : t('loading')}</p>
      {error && <p role="alert" className="text-[14px] text-busy-ink">{error}</p>}
      {notice && <p role="status" className="text-[14px] text-soft">{notice}</p>}

      {data && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && file && !full) void add() }}>
          <div className="flex-1 min-w-[12rem]"><TextInput label={t('name')} placeholder={t('namePlaceholder')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-soft">{t('file')}
            <input ref={fileRef} type="file" accept={DECORATION_TYPES.join(',')} aria-label={t('file')} className="block text-[14px] text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button type="submit" variant="primary" disabled={busy || full || !name.trim() || !file}><Icon name="plus" size={18} />{t('add')}</Button>
        </form>
      )}
      {full && <p className="text-[14px] text-soft">{t('full', { max: data!.limites.cantidad })}</p>}

      {data && (
        <section aria-label={t('listTitle')} className="flex flex-col gap-2">
          <h4 className="text-[16px] font-semibold text-ink">{t('listTitle')}</h4>
          {data.decoraciones.length === 0 ? <p className="text-[14px] text-soft">{t('empty')}</p> : (
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.decoraciones.map((d) => (
                <li key={d.id} className="rounded-lg border border-border p-3 flex flex-col gap-2">
                  <img src={decorationUrl(data.experienceUrl, d.archivo)} alt={d.nombre} className="w-full h-24 object-contain bg-muted rounded-md" />
                  <p className="text-[14px] font-semibold text-ink truncate">{d.nombre}</p>
                  <p className="text-[12px] text-soft"><code className="font-mono text-ink">{d.id}</code> · {d.ancho}×{d.alto} · {kb(d.peso)}</p>
                  {confirming === d.id ? (
                    <span className="flex items-center gap-2">
                      <Button size="compact" onClick={() => setConfirming(null)} disabled={busy}>{t('cancel')}</Button>
                      <Button size="compact" className="bg-danger text-primary-ink border-danger" onClick={() => void remove(d.id)} disabled={busy}>{t('confirmRemove')}</Button>
                    </span>
                  ) : <Button size="compact" className="self-start" onClick={() => setConfirming(d.id)} disabled={busy}>{t('remove')}</Button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {data && data.fabrica.length > 0 && (
        <p className="text-[13px] text-soft">{t('factory')} {data.fabrica.map((f) => <code key={f.id} className="font-mono text-ink mr-2">{f.id}</code>)}</p>
      )}
    </section>
  )
}
