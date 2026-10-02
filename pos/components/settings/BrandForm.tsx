'use client'

import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

import { BrandPreview, usesSampleLine } from '@/components/settings/BrandPreview'
import { SaveBar, useSaveState } from '@/components/settings/SettingsForms'
import { loadBrandFonts } from '@/components/settings/googleFonts'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput, describedBy } from '@/components/ui/Field'
import { DEFAULT_COLOR, FONTS, INK_LIGHT, RADII, RADIUS_LABELS, isHex, linkContrast, linkReadable, meetsContrast, theme } from '@/lib/domain/brand'
import { LOGO_TYPES, LogoError, imageDataUrl, resizeImage, validateLogoFile, type LogoFileError } from '@/lib/domain/image'
import { CoreError } from '@/lib/services/core/http'
import { getBrand, getBrandLogo, saveBrand, type BrandInfo, type BrandRadius, type LogoChange } from '@/lib/services/settings'
import { cn } from '@/lib/utils'

const LIMITS = { tagline: 60, greeting: 40, waiterName: 40, welcome: 140 } as const
type TextKey = keyof typeof LIMITS

export function BrandForm({ restaurantName }: { restaurantName: string }) {
  const t = useTranslations('pos.settings.brand')
  const ui = useTranslations('pos.ui')
  const baseId = useId()
  const readoutId = `${baseId}-color`
  const logoErrorId = `${baseId}-logo`
  const [b, setB] = useState<BrandInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [logo, setLogo] = useState<string | null>(null)
  const [change, setChange] = useState<LogoChange | undefined>(undefined)
  const [logoError, setLogoError] = useState<LogoFileError | 'decode' | null>(null)
  // Último color válido: la vista previa no salta a negro mientras se escribe un hex a medias.
  const [lastValid, setLastValid] = useState(DEFAULT_COLOR)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [state, save] = useSaveState()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadBrandFonts() }, [])

  useEffect(() => {
    let alive = true
    void getBrand().then(async (info) => {
      if (!alive) return
      setB(info)
      if (isHex(info.color)) setLastValid(info.color.toUpperCase())
      if (info.hasLogo) { const current = await getBrandLogo(info.companyId); if (alive) setLogo(current) }
    }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed) return <p role="alert" className="text-[15px] text-busy-ink">{ui('error')}</p>
  if (!b) return null
  const patch = (x: Partial<BrandInfo>) => setB((v) => v && { ...v, ...x })
  const setColor = (raw: string) => { const c = raw.trim(); patch({ color: isHex(c) ? c.toUpperCase() : c }); if (isHex(c)) setLastValid(c.toUpperCase()) }
  const hexOk = b.color === '' || isHex(b.color)
  const contrastOk = !isHex(b.color) || meetsContrast(b.color)
  // Como texto sobre el crema («Ver todos», «Llamar al mesero») el color puede quedar tenue: se avisa sin bloquear.
  const linkWarning = isHex(b.color) && contrastOk && !linkReadable(b.color)
  // Vacío ⇒ el comensal verá el color del registro; aquí se enseña el mismo valor por defecto que usa el registro.
  const th = theme(isHex(b.color) ? b.color : b.color === '' ? DEFAULT_COLOR : lastValid, b.font, Number(b.radius))
  const shownLogo = change ? ('remove' in change ? null : change.base64) : logo

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const problem = validateLogoFile(file)
    if (problem) { setLogoError(problem); return }
    try { setChange({ base64: await resizeImage(file) }); setLogoError(null) } catch (err) { setLogoError(err instanceof LogoError ? err.reason : 'decode') }
  }
  const clearFile = () => { if (fileRef.current) fileRef.current.value = '' }
  // Sin logo guardado, quitar solo descarta el que se acaba de subir; con uno guardado, manda el borrado al guardar.
  const removeLogo = () => { setChange(logo ? { remove: true } : undefined); setLogoError(null); clearFile() }
  const explain = (err: unknown): string | null => {
    if (!(err instanceof CoreError)) return null
    return err.status === 403 ? t('accessDenied') : err.message
  }
  const onSave = () => save(async () => {
    setSaveError(null)
    try { await saveBrand(b, change) } catch (err) { setSaveError(explain(err)); throw err }
    const fresh = await getBrand()
    setB((v) => v && { ...v, hasLogo: fresh.hasLogo })
    if (change) { setLogo('remove' in change ? null : change.base64); setChange(undefined); clearFile() }
  })

  // La ayuda y el contador van fuera de la etiqueta (Field los pone como descripción); el contador se anuncia al cambiar.
  const text = (key: TextKey, label: string, extra: { placeholder?: string; hint?: string } = {}) => (
    <TextInput key={key} label={label} value={b[key]} maxLength={LIMITS[key]} placeholder={extra.placeholder} onChange={(e) => patch({ [key]: e.target.value })}
      hint={<span className="flex justify-between gap-3"><span>{extra.hint}</span><span aria-live="polite" className="font-mono tabular shrink-0">{b[key].length}/{LIMITS[key]}</span></span>} />
  )
  const readout = b.color === ''
    ? <p className="text-[13px] text-soft">{t('noColor')}</p>
    : !hexOk
      ? <p role="alert" className="text-[13px] text-busy-ink">{t('invalidHex')}</p>
      : contrastOk
        ? <p className="flex items-center gap-1.5 text-[13px] text-free-ink"><CheckCircleIcon className="h-4 w-4 shrink-0" aria-hidden />{t('contrast', { ratio: th.contraste.toFixed(2), ink: t(th.colorTexto === INK_LIGHT ? 'inkWhite' : 'inkDark') })}</p>
        : <p role="alert" className="flex items-start gap-1.5 text-[13px] text-busy-ink"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('noContrast')}</p>

  return (
    <div className="@container">
      <p className="mb-5 max-w-2xl text-[15px] text-soft">{t('help')}</p>
      <div className="grid gap-8 @[720px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 max-w-md flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end gap-3">
              <Field label={t('color')}>{(id) => <input id={id} type="color" value={(isHex(b.color) ? b.color : lastValid).toLowerCase()} onChange={(e) => setColor(e.target.value)} className="h-tap-min w-tap-min cursor-pointer rounded-[10px] border border-border bg-surface p-1" />}</Field>
              <TextInput label={t('hex')} value={b.color} onChange={(e) => setColor(e.target.value)} placeholder={DEFAULT_COLOR} maxLength={7} spellCheck={false} autoCapitalize="characters"
                aria-invalid={!hexOk || !contrastOk} aria-describedby={readoutId} className="w-40 font-mono uppercase" />
            </div>
            <div id={readoutId} className="flex flex-col gap-1">
              {readout}
              {linkWarning && <p className="flex items-start gap-1.5 text-[13px] text-pending-ink"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('lowLinkContrast', { ratio: linkContrast(b.color).toFixed(1) })}</p>}
            </div>
          </div>
          <Select label={t('font')} value={b.font} onChange={(e) => patch({ font: e.target.value })} style={{ fontFamily: b.font ? `'${b.font}', serif` : undefined }}>
            <option value="">{t('fontDefault')}</option>
            {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: `'${f}', serif` }}>{f}</option>)}
          </Select>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[15px] font-medium">{t('radius')}</legend>
            <div className="flex flex-wrap gap-2">
              {RADII.map((r) => {
                const on = b.radius === String(r)
                return (
                  <button key={r} type="button" aria-pressed={on} onClick={() => patch({ radius: on ? '' : (String(r) as BrandRadius) })} style={{ borderRadius: r }}
                    className={cn('h-tap-min px-4 border text-[15px] flex items-center gap-1.5', on ? 'bg-primary text-primary-ink border-primary font-bold' : 'bg-surface border-border hover:bg-muted')}>
                    {t(RADIUS_LABELS[r])} <span className={cn('font-mono text-[13px]', on ? 'opacity-70' : 'text-soft')}>{r}</span>
                  </button>
                )
              })}
            </div>
            <span className="text-[13px] text-soft">{t('radiusHint')}</span>
          </fieldset>
          {text('tagline', t('tagline'))}
          {text('greeting', t('greeting'), { placeholder: t('greetingPlaceholder') })}
          {text('waiterName', t('waiterName'), { hint: t('waiterHint') })}
          {text('welcome', t('welcome'), { hint: t('welcomeHint') })}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[15px] font-medium">{t('logo')}</legend>
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-40 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-surface px-2 text-center text-[13px] text-soft">
                {shownLogo
                  ? <img src={imageDataUrl(shownLogo)} alt={t('logoAlt')} className="max-h-full max-w-full object-contain" />
                  : t('logoNone')}
              </div>
              <div className="flex flex-col gap-2">
                {/* El input nativo no toma los tokens del POS (24 px, sin foco visible): queda solo para lectores de
                    pantalla y lo dispara un botón de 48 px con el mismo nombre. */}
                <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} aria-label={t('logoFile')} aria-invalid={logoError !== null} aria-describedby={describedBy(logoError && logoErrorId)}
                  onChange={onFile} tabIndex={-1} className="sr-only" />
                <Button size="compact" className="self-start" onClick={() => fileRef.current?.click()}>{t('logoFile')}</Button>
                {shownLogo && <Button size="compact" className="self-start" onClick={removeLogo}>{t('removeLogo')}</Button>}
              </div>
            </div>
            <span className="text-[13px] text-soft">{t('logoHint')}</span>
            {logoError && <p id={logoErrorId} role="alert" className="text-[13px] text-busy-ink">{t(`logoError.${logoError}`)}</p>}
          </fieldset>
          <SaveBar state={state} onSave={onSave} disabled={!hexOk || !contrastOk} error={saveError} />
        </div>
        <aside aria-label={t('preview')} className="flex flex-col gap-2 self-start @[720px]:sticky @[720px]:top-0">
          <span className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-3">{t('preview')}</span>
          <BrandPreview theme={th} name={restaurantName} logo={shownLogo ? imageDataUrl(shownLogo) : null} tagline={b.tagline} greeting={b.greeting} waiterName={b.waiterName} welcome={b.welcome} />
          <p className="text-[13px] text-soft">{t(usesSampleLine(b.waiterName, b.welcome) ? 'previewHintSample' : 'previewHint')}</p>
        </aside>
      </div>
    </div>
  )
}
