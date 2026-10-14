import { useTranslations } from 'next-intl'

// El único sitio donde Waiter dice su nombre del lado del comensal: el sello al pie (sistema de diseño §06).
export function Seal() {
  const t = useTranslations('diner.common')
  return <p className="text-center text-[11px] tracking-[0.12em] uppercase text-ink-3 py-6">{t('seal')}</p>
}
