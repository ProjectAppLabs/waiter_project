'use client'

import { useTranslations } from 'next-intl'

import { formatCop } from '@/lib/domain/cart'
import { initials } from '@/lib/domain/template'
import type { Account, AccountOrder } from '@/lib/types'

// Mi cuenta (Cuenta 4b-4, igual para las 30): cabecera oscura con avatar de iniciales en el acento, nombre y correo; cifras en mono
// (pedidos, ahorrado); filas (Mis pedidos, Mis datos y privacidad); «Cerrar sesión». Sin cuenta: invitación a crearla.
export function AccountHome({ account, orders, discountPct, discountUsed, onSignup, onLogout, busy }: { account: Account | null; orders: AccountOrder[]; discountPct: number; discountUsed: boolean; onSignup: () => void; onLogout: () => void; busy: boolean }) {
  const t = useTranslations('diner.account')
  const saved = orders.reduce((a, o) => a + Math.max(0, o.descuento), 0)
  if (!account) {
    return (
      <section className="px-[18px] pt-[22px] flex flex-col gap-4 text-t-tinta">
        <h1 className="t-title text-[32px] leading-tight">{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('intro')}</p>
        <button type="button" onClick={onSignup} className="h-tap rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-bold">{t('create', { pct: discountPct })}</button>
        <button type="button" onClick={onSignup} className="h-tap-min text-[14px] font-medium text-t-tinta-suave">{t('haveAccount')}</button>
      </section>
    )
  }
  return (
    <section className="flex flex-col text-t-tinta">
      <header className="bg-dark text-dark-ink px-[18px] pt-[22px] pb-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="w-[50px] h-[50px] rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[18px] font-bold">{initials(account.nombre)}</span>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[18px] font-bold leading-tight truncate">{account.nombre}</h1>
            <span className="text-[14px] text-dark-soft truncate">{account.correo}</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col"><dd className="font-t-mono tabular text-[20px]">{orders.length}</dd><dt className="text-[13px] text-dark-soft">{t('orders')}</dt></div>
          <div className="flex flex-col"><dd className="font-t-mono tabular text-[20px]">$ {formatCop(saved)}</dd><dt className="text-[13px] text-dark-soft">{t('saved')}</dt></div>
        </dl>
      </header>
      <p className={`mx-[18px] mt-4 px-3.5 py-2.5 rounded-t-boton text-[14px] ${discountUsed ? 'bg-muted text-t-tinta-suave' : 'bg-t-acento-suave text-t-tinta'}`}>{discountUsed ? t('discountUsed', { pct: discountPct }) : t('discountLeft', { pct: discountPct })}</p>
      <details className="mx-[18px] mt-3 border-b border-t-borde">
        <summary className="h-tap-min flex items-center justify-between text-[15px] font-medium cursor-pointer"><span>{t('privacy')}</span><span aria-hidden="true" className="text-t-tinta-terciaria">→</span></summary>
        <p className="pb-3 text-[13px] leading-snug text-t-tinta-suave">{t('privacyText')}</p>
      </details>
      <div className="px-[18px] pt-4 flex items-center justify-between">
        <button type="button" disabled={busy} onClick={onLogout} className="h-tap-min text-[15px] font-medium text-busy-ink disabled:opacity-50">{t('logout')}</button>
        <span className="text-[13px] text-t-tinta-terciaria">{t('version')}</span>
      </div>
    </section>
  )
}
