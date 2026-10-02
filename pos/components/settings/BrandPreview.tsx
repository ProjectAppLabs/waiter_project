'use client'

import { useTranslations } from 'next-intl'

import { greetingFor, type Theme } from '@/lib/domain/brand'

// Réplica de la portada del comensal (diner Home, BrandHeader, DishCard y OrderBar): lo que el restaurante puede
// cambiar (logo, nombre, color, fuente, textos, redondeo) se pinta desde el tema; estructura, tamaños y pesos son de
// Waiter y van fijos igual que allá (font-medium, foto de 88 px, logo de 32 px). Lo vacío se rellena con el ejemplo.
export interface BrandPreviewProps { theme: Theme; name: string; logo: string | null; tagline: string; greeting: string; waiterName: string; welcome: string }

// Regla del comensal: la línea del mesero solo existe si hay bienvenida; con nombre es «Soy X, tu mesero. …» y sin
// nombre la bienvenida sola. Sin ninguna de las dos, el ejemplo del diseño para que la portada no quede coja.
export const usesSampleLine = (waiterName: string, welcome: string): boolean => !waiterName.trim() && !welcome.trim()

export function BrandPreview({ theme, name, logo, tagline, greeting, waiterName, welcome }: BrandPreviewProps) {
  const t = useTranslations('pos.settings.brand.sample')
  const serif = { fontFamily: `'${theme.fuente}', serif` }
  const dishes = [[t('dish'), t('dishDesc'), '38.900'], [t('dish2'), t('dish2Desc'), '32.900']]
  const line = usesSampleLine(waiterName, welcome)
    ? t('line', { name: t('waiter'), welcome: t('welcome') })
    : !welcome.trim() ? null : waiterName.trim() ? t('line', { name: waiterName.trim(), welcome: welcome.trim() }) : welcome.trim()
  return (
    <div aria-hidden className="overflow-hidden rounded-[22px] border border-border bg-muted/40 text-ink" style={{ fontFamily: "'Ubuntu', system-ui, sans-serif" }}>
      <div className="flex items-start justify-between gap-3 px-[18px] pt-[18px]">
        <div className="flex min-w-0 flex-col leading-[1.1]">
          {logo
            ? <img src={logo} alt="" className="h-8 w-auto self-start object-contain" />
            : <span className="truncate text-[25px]" style={serif}>{name || t('restaurant')}</span>}
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-ink-3">{tagline || t('tagline')}</span>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-[14px] font-medium">{t('table')}</span>
      </div>
      <div className="px-[18px] pb-[18px] pt-[22px]">
        {/* Saludo vacío ⇒ por hora, como greetingFor del comensal. */}
        <div className="text-[32px] leading-[1.1]" style={serif}>{greetingFor(new Date().getHours(), greeting)}</div>
        {line && <div className="mt-1.5 text-[16px] leading-[1.45] text-soft">{line}</div>}
        {/* "Ver la carta" es blanco con borde (DS §06); el color de acción va en "Ver todos", "Llamar al mesero", los "＋" y la barra de pedido. */}
        <div className="mt-4 flex h-14 items-center justify-between border border-border bg-surface px-[18px] text-[16px] font-medium" style={{ borderRadius: theme.radio }}>
          <span>{t('cta')}</span><span className="text-ink-3">→</span>
        </div>
        {/* Texto en el color tal cual sobre el crema: es lo que ve el comensal, por eso se avisa si contrasta poco. */}
        <div className="mt-1 flex h-12 items-center justify-center text-[15px] font-medium" style={{ color: theme.color }}>{t('callWaiter')}</div>
      </div>
      <div className="px-[18px] pb-[18px]">
        <div className="mb-3 flex items-baseline justify-between"><span className="text-[18px] font-medium">{t('recommended')}</span><span className="text-[14px] font-medium" style={{ color: theme.color }}>{t('all')}</span></div>
        <div className="grid grid-cols-2 gap-3">
          {dishes.map(([dish, desc, price]) => (
            <div key={dish} className="overflow-hidden border border-border bg-surface" style={{ borderRadius: theme.radio }}>
              <div className="grid h-[88px] place-items-center bg-muted text-[11px] uppercase tracking-[0.08em] text-ink-3">{t('photo')}</div>
              <div className="px-3 pb-3 pt-2.5">
                <div className="text-[15px] font-medium leading-[1.25]">{dish}</div>
                <div className="mt-0.5 text-[13px] leading-[1.35] text-soft">{desc}</div>
                <div className="mt-2.5 flex items-center justify-between"><span className="font-mono text-[15px]">{price}</span><span className="grid h-[34px] w-[34px] place-items-center rounded-full text-[17px]" style={{ background: theme.color, color: theme.colorTexto }}>＋</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-3.5 mb-3.5 flex items-center justify-between rounded-[16px] bg-[#1A1815] px-[18px] py-3.5 text-[#F5F1EA]">
        <div className="flex items-center gap-3">
          <span className="grid h-[26px] min-w-[26px] place-items-center rounded-full text-[14px] font-bold" style={{ background: theme.color, color: theme.colorTexto }}>2</span>
          <div className="flex flex-col leading-[1.2]"><span className="text-[15px]">{t('order')}</span><span className="font-mono text-[17px]">{t('total')}</span></div>
        </div>
        <span className="text-[15px] font-medium">{t('seeOrder')}</span>
      </div>
    </div>
  )
}
