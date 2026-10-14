'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { pathFor } from '@/lib/domain/route'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Bill as BillSummary, Entry } from '@/lib/types'

type Mode = 'all' | 'mine' | 'split'
const MODES: Mode[] = ['all', 'mine', 'split']
const MAX_PARTS = 8
const clampParts = (n: number) => Math.min(MAX_PARTS, Math.max(1, n))

// La cuenta (Plan F, tarea 5): todo / lo mío / dividir sobre lo confirmado. Abrirla avisa al salón a través de experience (POST …/cuenta/).
export function Bill({ entry, rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const t = useTranslations('diner.bill')
  const tc = useTranslations('diner.common')
  const td = useTranslations('diner.dish')
  const router = useRouter()
  const { order, error, busy, askBill } = useDinerStore()
  const [bill, setBill] = useState<BillSummary | null>(null)
  const [mode, setMode] = useState<Mode>('all')
  const [parts, setParts] = useState(1)
  // En domicilio no hay salón que avisar: `ok` llega en falso siempre y no es un fallo.
  const atTable = entry.contexto.mesa !== null

  // Se pide al montar (y al reintentar) y se muestra solo la respuesta fresca: nunca la cuenta de una visita anterior.
  const load = useCallback(() => askBill().then((fresh) => { if (fresh) { setBill(fresh); setParts(clampParts(fresh.partes)) } }), [askBill])
  const [attempted, setAttempted] = useState(false)
  useEffect(() => { void Promise.resolve(load()).finally(() => setAttempted(true)) }, [load])

  const back = () => router.push(order ? pathFor(rest, venue, token, 'estado', order.id) : pathFor(rest, venue, token, 'pedido'))
  const backLink = <button type="button" onClick={back} className="h-tap-min rounded-rest text-[15px] font-medium text-brand">{t('back')}</button>
  const retryButton = <button type="button" disabled={busy} onClick={() => void load()} className="h-tap-min rounded-rest bg-surface border border-border text-[15px] font-medium disabled:opacity-50">{tc('retry')}</button>

  // Sin cuenta y con error (sin red, sesión caída): se dice y se deja reintentar, nunca "Cargando…" sin salida.
  if (!bill) {
    const failed = attempted && !busy && error !== null
    return (
      <div className="px-[18px] pt-[22px] flex flex-col gap-3">
        <p className="text-base text-soft">{failed ? tc('offline') : tc('loading')}</p>
        {failed && retryButton}
        {backLink}
      </div>
    )
  }
  if (bill.total === 0) return <div className="px-[18px] pt-[22px] flex flex-col gap-3"><p className="text-base text-soft">{t('nothing')}</p>{backLink}</div>

  // La cifra por parte es la del servidor para su número de comensales; otro reparto se calcula con el mismo redondeo.
  const perPart = parts === bill.partes ? bill.porParte : Math.round(bill.total / parts)
  const amount = mode === 'all' ? bill.total : mode === 'mine' ? bill.mio : perPart
  // La cifra por parte va en mono: se parte el copy alrededor de ella (como en Plato) para no duplicar el texto en es.json.
  const perPartText = formatCop(perPart)
  const partsLine = t('parts', { n: parts, amount: perPartText })
  const cut = partsLine.lastIndexOf(perPartText)
  const [partsBefore, partsAfter] = [partsLine.slice(0, cut), partsLine.slice(cut + perPartText.length)]
  const stepper = 'w-tap-min h-tap-min rounded-full border border-border bg-surface text-xl leading-none disabled:opacity-40'
  // Segmentado del sistema de diseño: el activo va en blanco con peso 600 y sombra; el color del restaurante se reserva para pagar.
  const modeClass = (m: Mode) => `h-tap-min rounded-rest text-[15px] ${mode === m ? 'bg-surface text-ink font-semibold shadow-sm' : 'text-soft font-medium'}`
  return (
    <div className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4">
      <h1 className="font-display text-[32px] leading-tight">{t('title')}</h1>
      <div role="group" aria-label={t('title')} className="grid grid-cols-3 gap-1 p-1 rounded-rest bg-muted">
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={modeClass(m)}>{t(m)}</button>
        ))}
      </div>
      <section className="rounded-rest bg-surface border border-border p-[18px] flex flex-col gap-3">
        <span className="text-[13px] tracking-[0.08em] uppercase text-soft">{t(mode)}</span>
        <span className="font-mono tabular text-[34px] leading-none">$ {formatCop(amount)}</span>
        <span className="text-[13px] text-soft">{t('taxesIncluded')}</span>
        {mode === 'split' && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[15px] text-soft">{partsBefore}<span className="font-mono tabular text-ink">$ {perPartText}</span>{partsAfter}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={td('fewer')} disabled={parts <= 1} onClick={() => setParts((p) => clampParts(p - 1))} className={stepper}>−</button>
              <span className="font-mono tabular text-lg min-w-[2ch] text-center">{parts}</span>
              <button type="button" aria-label={td('more')} disabled={parts >= MAX_PARTS} onClick={() => setParts((p) => clampParts(p + 1))} className={stepper}>＋</button>
            </div>
          </div>
        )}
      </section>
      {bill.ok && <p role="status" className="px-3.5 py-2.5 rounded-rest bg-free-soft text-free-ink text-[15px]">{t('requested')}</p>}
      {/* En mesa, `ok` en falso significa que el salón NO fue avisado (POS caído): se dice y se deja volver a intentar. */}
      {atTable && !bill.ok && (
        <div className="flex flex-col gap-2.5">
          <p role="alert" className="px-3.5 py-2.5 rounded-rest bg-pending-soft text-pending-ink text-[15px]">{t('notNotified')}</p>
          {retryButton}
        </div>
      )}
      {/* Placeholder de la pasarela (decisión pendiente): ya tiene el tamaño de una acción que cobra (64px) para que el layout no cambie al llegar. */}
      <button type="button" disabled className="h-tap-money rounded-rest bg-brand text-brand-ink text-lg font-medium disabled:opacity-50">{t('payPhoneSoon')}</button>
      {backLink}
    </div>
  )
}
