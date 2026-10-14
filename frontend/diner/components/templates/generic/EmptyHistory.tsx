'use client'

import { useTranslations } from 'next-intl'

// Historial vacío (Cuenta 4b-8, igual para las 30): cuadro con «Wt.», «Todavía nada por aquí», el 5 % sigue disponible y «Ver la carta».
export function EmptyHistory({ discountPct, discountUsed, onSeeMenu }: { discountPct: number; discountUsed: boolean; onSeeMenu: () => void }) {
  const t = useTranslations('diner.account')
  return (
    <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center text-t-tinta">
      <span aria-hidden="true" className="w-[84px] h-[84px] rounded-[22px] bg-muted grid place-items-center text-[30px] font-bold text-[#C9C0B2]">Wt.</span>
      <h2 className="t-title text-[20px] leading-tight">{t('history.emptyTitle')}</h2>
      <p className="text-[15px] text-t-tinta-suave">{t('history.emptyBody')}</p>
      {!discountUsed && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('discountLeft', { pct: discountPct })}</p>}
      <button type="button" onClick={onSeeMenu} className="h-tap px-6 rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-medium">{t('history.seeMenu')}</button>
    </section>
  )
}
