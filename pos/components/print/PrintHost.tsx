'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import type { Comanda } from '@/lib/domain/comanda'
import { readPrintSettings } from '@/lib/print/settings'
import { usePrintStore } from '@/lib/stores/printStore'

const time = (at: string) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }

// Plan U3: una hoja de comanda para el rodillo térmico. Letra grande y en negrilla lo que cocina lee de lejos: la
// cantidad, el plato y la nota.
export function ComandaSheet({ comanda }: { comanda: Comanda }) {
  const t = useTranslations('kds.print')
  const place = comanda.place.kind === 'table' ? t('table', { n: comanda.place.number }) : t(comanda.place.kind)
  return (
    <section className="comanda-sheet" aria-label={t('sheet', { number: comanda.number })}>
      <p className="comanda-station">{comanda.station ?? t('kitchen')}</p>
      <p className="comanda-head"><strong>{comanda.number}</strong> · {place}</p>
      <p className="comanda-meta">{time(comanda.at)}{comanda.waiter ? ` · ${comanda.waiter}` : ''}</p>
      {comanda.offline && <p className="comanda-flag">{t('offline')}</p>}
      {comanda.note && <p className="comanda-note">{comanda.note}</p>}
      <ul>
        {comanda.lines.map((l, i) => (
          <li key={i}>
            <p className="comanda-dish"><strong>{l.qty}×</strong> {l.name}</p>
            {l.options.map((o) => <p key={o} className="comanda-option">+ {o}</p>)}
            {l.note && <p className="comanda-note">{l.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

// Pinta las hojas pendientes fuera de la vista y abre la impresión. El ancho del papel es de este equipo.
export function PrintHost() {
  const sheets = usePrintStore((s) => s.sheets)
  const done = usePrintStore((s) => s.done)
  useEffect(() => {
    const paper = readPrintSettings().paper
    document.documentElement.dataset.paper = paper
    // @page no acepta variables de CSS: el tamaño del rodillo va en su propia regla.
    let page = document.getElementById('paper-page') as HTMLStyleElement | null
    if (!page) { page = document.createElement('style'); page.id = 'paper-page'; document.head.appendChild(page) }
    page.textContent = `@page { size: ${paper}mm auto; margin: 0; }`
    if (!sheets) return
    document.body.dataset.print = 'comanda'
    const finish = () => { delete document.body.dataset.print; done() }
    window.addEventListener('afterprint', finish, { once: true })
    // Un cuadro después de pintar las hojas, para que el diálogo las vea.
    const frame = requestAnimationFrame(() => { try { window.print() } catch { finish() } })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', finish) }
  }, [sheets, done])
  if (!sheets) return null
  return <div className="comanda-print" aria-hidden>{sheets.map((c, i) => <ComandaSheet key={i} comanda={c} />)}</div>
}
