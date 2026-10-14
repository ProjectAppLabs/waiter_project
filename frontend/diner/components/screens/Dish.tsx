'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { pathFor } from '@/lib/domain/route'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

// Plato (sistema de diseño §06): foto 4:3, nombre en la serif del restaurante, nota, cantidad y una sola acción en el color del restaurante.
export function Dish({ entry, rest, venue, token, id }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const t = useTranslations('diner')
  const { add, busy } = useDinerStore()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [added, setAdded] = useState(false)
  const menuPath = pathFor(rest, venue, token, 'carta')
  const dish = id === null ? undefined : entry.carta.categorias.flatMap((c) => c.productos).find((d) => String(d.id) === id)
  const secondary = 'rounded-rest bg-surface border border-border inline-flex items-center justify-center font-medium'
  if (!dish) {
    return (
      <section className="px-[18px] pt-[22px] flex flex-col items-start gap-4">
        <p className="text-base text-soft">{t('dish.notFound')}</p>
        <Link href={menuPath} className={`h-tap-min px-[18px] text-base ${secondary}`}>{t('common.back')}</Link>
      </section>
    )
  }
  // El total del botón va en mono: se parte el copy alrededor de la cifra para no duplicar el texto en es.json.
  const amount = formatCop(dish.precio * qty)
  const [before, after] = t('dish.addFor', { amount }).split(amount)
  // Tocar cantidad o nota después de agregar vuelve a ofrecer "Agregar": el mismo plato puede ir otra vez con otra nota.
  const changeQty = (next: number) => { setQty(next); setAdded(false) }
  const changeNote = (next: string) => { setNote(next); setAdded(false) }
  // Candado local: el busy global del store lo suelta el refresco del carrito con el POST aún en vuelo, y un segundo toque duplicaría la línea.
  const submit = async () => {
    setSubmitting(true)
    try {
      await add(dish.id, qty, note.trim())
      // El store guarda el error (la página lo pinta); solo se confirma si el plato entró.
      if (!useDinerStore.getState().error) setAdded(true)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="flex flex-col gap-4 pt-3">
      <Link href={menuPath} className="mx-[18px] self-start inline-flex items-center h-tap-min text-[15px] font-medium">← {t('common.back')}</Link>
      <div className="mx-[18px] aspect-[4/3] rounded-rest bg-muted overflow-hidden grid place-items-center text-[11px] tracking-[0.08em] uppercase text-ink-3">
        {dish.foto ? <img src={dish.foto} alt={dish.nombre} className="w-full h-full object-cover" /> : t('home.photo')}
      </div>
      {/* Límite legal: bajo una foto generada con IA va la misma nota que en la carta; sin foto no hay nada que aclarar. */}
      {dish.foto && dish.fotoOrigen === 'ia' && <p className="mx-[18px] text-[13px] text-soft">{t('menu.referenceImages')}</p>}
      <section className="px-[18px] flex flex-col gap-2">
        <h1 className="font-display text-[28px] leading-tight">{dish.nombre}</h1>
        {dish.descripcion && <p className="text-base text-soft">{dish.descripcion}</p>}
        <span className="font-mono tabular text-lg">{formatCop(dish.precio)}</span>
      </section>
      <section className="px-[18px] flex flex-col gap-3">
        <div role="group" aria-label={t('dish.qty')} className="flex items-center justify-between">
          <span className="text-[15px] font-medium">{t('dish.qty')}</span>
          <div className="inline-flex items-center rounded-rest bg-surface border border-border overflow-hidden">
            <button type="button" aria-label={t('dish.fewer')} disabled={qty <= 1} onClick={() => changeQty(Math.max(1, qty - 1))} className="w-tap-min h-tap-min grid place-items-center text-xl disabled:text-ink-3">−</button>
            <span aria-live="polite" className="font-mono tabular min-w-[40px] text-center text-lg">{qty}</span>
            <button type="button" aria-label={t('dish.more')} onClick={() => changeQty(qty + 1)} className="w-tap-min h-tap-min grid place-items-center text-xl">+</button>
          </div>
        </div>
        {/* Etiqueta visible siempre (§04 "Campos"): el placeholder solo da ejemplos y desaparece al escribir. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-medium">{t('dish.note')}</span>
          <textarea placeholder={t('dish.noteHint')} value={note} onChange={(e) => changeNote(e.target.value)} rows={3} maxLength={200} className="w-full rounded-rest bg-surface border border-border px-4 py-3 text-base placeholder:text-ink-3" />
        </label>
        {/* Tras agregar no se navega solo (el comensal conserva el control y la barra de pedido ya es el feedback); la acción pasa a ser volver. */}
        {added
          ? <Link href={menuPath} className={`h-tap text-lg ${secondary}`}>{t('dish.backToMenu')}</Link>
          : (
            <button type="button" disabled={dish.agotado || submitting || busy} aria-busy={submitting} onClick={() => void submit()} className="h-tap-money rounded-rest bg-brand text-brand-ink text-lg font-medium disabled:opacity-60">
              {dish.agotado ? t('common.soldOut') : submitting ? t('dish.adding') : <>{before}<span className="font-mono tabular">{amount}</span>{after}</>}
            </button>
          )}
        <p role="status" className={`min-h-6 text-center text-[15px] font-medium text-free-ink rounded-rest ${added ? 'bg-free-soft' : ''}`}>{added ? t('dish.added') : null}</p>
      </section>
    </div>
  )
}
