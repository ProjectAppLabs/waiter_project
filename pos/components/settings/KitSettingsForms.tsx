'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Toggle } from '@/components/kit/Toggle'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { SaveBar, useSaveState } from '@/components/settings/SettingsForms'
import { Select, TextInput } from '@/components/ui/Field'
import { play, setStation, type SoundId, type Station } from '@/lib/audio/sounds'
import { readPrintSettings, writePrintSettings, type PrintSettings } from '@/lib/print/settings'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { shiftLabel } from '@/lib/domain/employees'
import type { PosEmployee } from '@/lib/services/employees'
import { saveCompany, type CompanyInfo, type PaymentMethodInfo, type TaxInfo } from '@/lib/services/settings'

// Secciones de Configuración dibujadas con los componentes del kit (tarjetas, chips, píldoras, toggles).
// Marca y Plantilla del menú tienen su propio componente; umbrales y ROI usan ThresholdsForm.

const DENSITIES = ['compact', 'balanced', 'wide'] as const
const SOUNDS: SoundId[] = ['tap', 'ticket', 'listo', 'demora', 'critico', 'llama', 'cobro', 'error']
const readLocal = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
const writeLocal = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* sin almacenamiento: no pasa nada */ } }
const box = 'rounded-md border border-border p-4 flex flex-col gap-3'
// Vacío estable para el selector: un `[]` nuevo en cada lectura hace que zustand vea un cambio y repinte sin fin.
const NO_CATEGORIES: { station: string | null }[] = []

export function CompanyForm({ initial }: { initial: CompanyInfo }) {
  const t = useTranslations('pos.settings.restaurant')
  const [c, setC] = useState(initial)
  const [state, save] = useSaveState()
  const field = (key: keyof CompanyInfo, label: string) => <TextInput key={key} label={label} value={String(c[key] ?? '')} onChange={(e) => setC((v) => ({ ...v, [key]: e.target.value }))} />
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">{field('name', t('name'))}{field('vat', t('vat'))}{field('phone', t('phone'))}{field('email', t('email'))}{field('street', t('street'))}{field('city', t('city'))}</div>
      <p className="text-sm text-soft">{t('addressHint')}</p>
      {/* La ubicación en el mapa es de cada local (Restaurantes → datos del local), no de la empresa. */}
      <SaveBar state={state} onSave={() => save(() => saveCompany(c))} disabled={!c.name.trim()} />
    </div>
  )
}

export function PaymentMethodsList({ methods }: { methods: PaymentMethodInfo[] }) {
  const t = useTranslations('admin.settings.payments')
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-[14px] text-soft">{t('hint')}</p>
      {methods.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-[15px]">
          <span className="w-10 h-10 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name={m.type === 'cash' ? 'money' : m.type === 'bank' ? 'card' : 'user'} size={20} /></span>
          <span className="font-semibold text-ink">{m.name}</span><span className="ml-auto text-soft">{t(`type.${m.type as 'cash' | 'bank' | 'pay_later'}`)}</span>
        </div>
      ))}
    </div>
  )
}

export function TaxesList({ taxes }: { taxes: TaxInfo[] }) {
  const t = useTranslations('admin.settings.taxes')
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-[14px] text-soft">{t('hint')}</p>
      {taxes.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-[15px]">
          <span className="w-10 h-10 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="percentage" size={20} /></span>
          <span className="font-semibold text-ink">{x.name}</span><span className="ml-auto text-soft tabular">{x.amount}%</span>
        </div>
      ))}
    </div>
  )
}

// Equipo del restaurante; las invitaciones y los roles se administran en la consola del dueño.
export function UsersForm({ employees = [] }: { employees?: PosEmployee[] }) {
  const t = useTranslations('admin.settings.users')
  const roles = useTranslations('pos.nav.roles')
  return <section aria-label={t('list')} className={box}>
    <div><h3 className="text-lg font-semibold text-ink">{t('list')}</h3><p className="mt-1 text-sm text-soft">{t('listHint')}</p></div>
    {employees.map((x) => <div key={x.id} className="flex items-center gap-3 rounded-md bg-muted p-3 text-[15px]">
      <span className="w-10 h-10 rounded-md bg-surface border border-border text-ink grid place-items-center"><Icon name="user" size={20} /></span>
      <div className="min-w-0"><p className="font-semibold text-ink truncate">{x.name}</p><p className="text-[13px] text-soft truncate">{shiftLabel(x.shift, t('noShift'))}</p></div>
      <span className="ml-auto"><StatusPill tone="neutral">{x.role ? roles(x.role) : t('accountRole')}</StatusPill></span>
    </div>)}
  </section>
}

export function DisplayForm() {
  const t = useTranslations('admin.settings.display')
  const [density, setDensity] = useState(() => readLocal('waiter.density', 'wide'))
  const [station, setSt] = useState<Station>(() => readLocal('waiter.station', 'tablet') as Station)
  useEffect(() => { document.documentElement.dataset.density = density; writeLocal('waiter.density', density) }, [density])
  useEffect(() => { setStation(station); writeLocal('waiter.station', station) }, [station])
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Select label={t('density')} value={density} onChange={(e) => setDensity(e.target.value)}>{DENSITIES.map((d) => <option key={d} value={d}>{t(d)}</option>)}</Select>
        <Select label={t('station')} value={station} onChange={(e) => setSt(e.target.value as Station)}><option value="kds">{t('kds')}</option><option value="tablet">{t('tablet')}</option><option value="caja">{t('caja')}</option></Select>
      </div>
      <div className={box}>
        <p className="text-[15px] font-semibold text-ink">{t('sounds')}</p>
        <div className="flex flex-wrap gap-2">{SOUNDS.map((id) => <Chip key={id} label={`${t('test')}: ${id}`} icon="volume" onClick={() => play(id)} />)}</div>
      </div>
      <PrintSettingsBox />
      <p className="text-[13px] text-soft">{t('localHint')}</p>
    </div>
  )
}

// Plan U3: la impresora de este equipo. Las estaciones salen de las categorías de la carta.
function PrintSettingsBox() {
  const t = useTranslations('admin.settings.display.print')
  const [settings, setSettings] = useState<PrintSettings>(() => readPrintSettings())
  const categories = useCatalogStore((s) => s.catalog?.categories ?? NO_CATEGORIES)
  const stations = [...new Set(categories.map((c) => c.station).filter((s): s is string => !!s))]
  const update = (patch: Partial<PrintSettings>) => setSettings((current) => { const next = { ...current, ...patch }; writePrintSettings(next); return next })
  const toggleStation = (station: string) => update({ stations: settings.stations.includes(station) ? settings.stations.filter((s) => s !== station) : [...settings.stations, station] })
  return (
    <section aria-label={t('title')} className={box}>
      <p className="text-[15px] font-semibold text-ink">{t('title')}</p>
      <p className="text-[13px] text-soft">{t('hint')}</p>
      <div className="grid grid-cols-2 gap-4">
        <Select label={t('paper')} value={settings.paper} onChange={(e) => update({ paper: e.target.value === '58' ? '58' : '80' })}>
          <option value="80">{t('paper80')}</option><option value="58">{t('paper58')}</option>
        </Select>
        <Select label={t('copies')} value={String(settings.receiptCopies)} onChange={(e) => update({ receiptCopies: Number(e.target.value) })}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div className="flex items-center gap-3 text-[15px] text-ink"><Toggle checked={settings.autoComanda} onChange={(v) => update({ autoComanda: v })} label={t('auto')} /><span>{t('auto')}</span></div>
      {settings.autoComanda && stations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-soft">{t('stations')}</p>
          <div className="flex flex-wrap gap-2">{stations.map((s) => <Chip key={s} label={s} active={settings.stations.includes(s)} onClick={() => toggleStation(s)} />)}</div>
          <p className="text-[13px] text-dim">{settings.stations.length === 0 ? t('allStations') : t('someStations')}</p>
        </div>
      )}
    </section>
  )
}
