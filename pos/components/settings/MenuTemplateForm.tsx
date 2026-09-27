'use client'

/* eslint-disable @next/next/no-img-element -- Photos already come resized from the restaurant API; logos can be local upload previews. */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SaveBar, useSaveState } from '@/components/settings/SettingsForms'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { contrast, inkFor, isHex } from '@/lib/domain/brand'
import {
  imageDataUrl,
  LOGO_TYPES,
  resizeImage,
  validateLogoFile,
} from '@/lib/domain/image'
import {
  getBrand,
  getBrandLogo,
  saveBrandGreeting,
  saveBrandLogo,
  type BrandInfo,
  type LogoChange,
} from '@/lib/services/settings'
import {
  designSystemUrl,
  gateway,
  listTemplates,
  previewUrl,
  type ColorToken,
  type MenuSettings,
  type MenuSettingsContext,
  type MenuDraft,
  type TemplateSpec,
} from '@/lib/services/menuTemplates'
import { loadTemplateFonts } from './googleFonts'

const COLORS: { key: ColorToken; label: string }[] = [
  { key: 'acento', label: 'Botones y color principal' },
  { key: 'tintaTerciaria', label: 'Categorías y destacados' },
  { key: 'fondo', label: 'Fondo del menú' },
  { key: 'superficie', label: 'Tarjetas' },
  { key: 'tinta', label: 'Texto' },
]
const FONTS = [
  'Mulish',
  'DM Sans',
  'Nunito Sans',
  'Lato',
  'Instrument Serif',
  'Playfair Display',
  'Fraunces',
  'DM Serif Display',
  'Lora',
  'Cormorant Garamond',
]
export function MenuTemplateForm() {
  const [ctx, setCtx] = useState<MenuSettingsContext | null>(null)
  const [spec, setSpec] = useState<TemplateSpec | null>(null)
  const [brand, setBrand] = useState<BrandInfo | null>(null)
  const [palette, setPalette] = useState<MenuSettings['paleta']>({})
  const [font, setFont] = useState('DM Sans')
  const [logo, setLogo] = useState<string | null>(null)
  const [logoChange, setLogoChange] = useState<LogoChange | undefined>()
  const [greeting, setGreeting] = useState('')
  const [preview, setPreview] = useState<MenuDraft | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [state, save] = useSaveState()
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([gateway('get'), getBrand()])
      .then(async ([c, b]) => {
        const [catalog, image] = await Promise.all([
          listTemplates(c.restaurante, c.sede),
          b.hasLogo ? getBrandLogo(b.companyId) : Promise.resolve(null),
        ])
        if (!alive) return
        const s = catalog.plantillas.find((p) => p.codigo === 'S1')
        if (!s)
          throw new Error(
            'Actualiza el servicio del menú para cargar Smart Menu.',
          )
        setCtx(c)
        setBrand(b)
        setGreeting(b.greeting ?? '')
        setSpec(s)
        setLogo(image)
        setPalette(c.ajustes.plantilla === 'S1' ? c.ajustes.paleta : {})
        setFont(
          c.ajustes.plantilla === 'S1'
            ? c.ajustes.tipografia.display || s.tokens.displayFont
            : s.tokens.displayFont,
        )
        loadTemplateFonts(FONTS)
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e))
          setFailed(true)
        }
      })
    return () => {
      alive = false
    }
  }, [])
  const serialized = JSON.stringify({
    plantilla: 'S1',
    paleta: palette,
    tipografia: { display: font },
  })
  useEffect(() => {
    if (!ctx) return
    let alive = true
    const timer = setTimeout(() => {
      setPreviewBusy(true)
      setPreviewError(null)
      setPreview(null)
      void gateway('preview', JSON.parse(serialized) as MenuSettings)
        .then(draft => { if (alive) setPreview(draft) })
        .catch((e: unknown) => { if (alive) setPreviewError(e instanceof Error ? e.message : String(e)) })
        .finally(() => { if (alive) setPreviewBusy(false) })
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
  }, [ctx, serialized, previewVersion])
  if (failed) return <p role="alert">No pudimos cargar el menú. {error}</p>
  if (!ctx || !spec || !brand)
    return <p className="text-soft">Cargando tu menú…</p>
  const effective = (key: ColorToken) =>
    isHex(palette[key] ?? '') ? palette[key]! : spec.tokens[key]
  const valid = Object.values(palette).every((value) => isHex(value ?? ''))
  const readable =
    contrast(effective('tinta'), effective('fondo')) >= 4.5 &&
    contrast(effective('tinta'), effective('superficie')) >= 4.5
  const shownLogo = logoChange
    ? 'remove' in logoChange
      ? null
      : logoChange.base64
    : logo
  const src = preview
    ? previewUrl(ctx.dinerUrl, ctx.restaurante, ctx.sede, preview.borrador)
    : null
  const onSave = () =>
    save(async () => {
      setError(null)
      try {
        if (logoChange) {
          await saveBrandLogo(logoChange)
          setLogo('remove' in logoChange ? null : logoChange.base64)
          setLogoChange(undefined)
          setBrand({ ...brand, hasLogo: !('remove' in logoChange) })
        }
        if (greeting.trim() !== (brand.greeting ?? '')) {
          await saveBrandGreeting(greeting)
          setBrand({ ...brand, greeting: greeting.trim() })
        }
        await gateway('set', JSON.parse(serialized) as MenuSettings)
        setPreviewVersion((v) => v + 1)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        throw e
      }
    })
  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <span className="text-[12px] font-bold uppercase tracking-widest text-primary">
          Smart Menu
        </span>
        <h2 className="mt-2 text-2xl font-bold">
          Tu restaurante, tu identidad
        </h2>
        <p className="mt-2 text-[15px] text-soft">
          Un solo diseño para el menú, los favoritos, los pedidos y el perfil.
            Cambia colores, tipografía y logo; el tema se aplica
          en todas las pantallas.
        </p>
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex max-w-xl flex-col gap-6">
          <section className="rounded-[20px] border border-border bg-surface p-5">
            <h3 className="mb-4 text-lg font-bold">Saludo del menú</h3>
            <TextInput
              label="Saludo"
              hint="Opcional. Vacío, el menú alterna frases cálidas según la hora («Buenas noches», «¿Qué se te antoja hoy?»…). Si escribes uno, se usa siempre, seguido del nombre del comensal cuando tiene cuenta."
              placeholder="Hola"
              maxLength={40}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
            />
            <p className="mt-3 text-sm text-soft">
              Así se ve: <strong>{greeting.trim() || 'Buenas noches'}, Camila</strong> · {ctx.restaurante} · {ctx.sede}
            </p>
          </section>
          <section className="rounded-[20px] border border-border bg-surface p-5">
            <h3 className="mb-4 text-lg font-bold">Logo del restaurante</h3>
            <div className="mb-4 grid h-24 place-items-center rounded-xl bg-muted">
              {shownLogo ? (
                <img
                  src={imageDataUrl(shownLogo)}
                  alt="Logo del restaurante"
                  className="max-h-20 max-w-48 object-contain"
                />
              ) : (
                <span className="text-soft">
                  Se mostrará el nombre del restaurante
                </span>
              )}
            </div>
            <input
              ref={fileRef}
              aria-label="Subir logo del restaurante"
              type="file"
              accept={LOGO_TYPES.join(',')}
              className="w-full text-sm"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const problem = validateLogoFile(file)
                if (problem) {
                  setLogoError('Usa una imagen PNG o JPG de hasta 1 MB.')
                  return
                }
                try {
                  setLogoChange({ base64: await resizeImage(file) })
                  setLogoError(null)
                } catch {
                  setLogoError('No pudimos leer la imagen.')
                }
              }}
            />
            <p className="mt-2 text-xs text-soft">
              PNG o JPG. El logo se adapta sin deformarse. La vista previa del
              menú lo mostrará al guardar.
            </p>
            {shownLogo && (
              <Button
                size="compact"
                className="mt-3"
                onClick={() => {
                  setLogoChange({ remove: true })
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                Quitar logo
              </Button>
            )}
            {logoError && (
              <p role="alert" className="mt-2 text-busy-ink">
                {logoError}
              </p>
            )}
          </section>
          <section className="flex flex-col gap-5 rounded-[20px] border border-border bg-surface p-5">
            <h3 className="text-lg font-bold">Colores de tu marca</h3>
            {COLORS.map(({ key, label }) => (
              <div key={key} className="flex flex-wrap items-end gap-3">
                <Field label={label}>
                  {(id) => (
                    <input
                      id={id}
                      type="color"
                      value={effective(key)}
                      onChange={(e) =>
                        setPalette({
                          ...palette,
                          [key]: e.target.value.toUpperCase(),
                        })
                      }
                      className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
                    />
                  )}
                </Field>
                <TextInput
                  label={`${label} · HEX`}
                  value={palette[key] ?? spec.tokens[key]}
                  onChange={(e) =>
                    setPalette({
                      ...palette,
                      [key]: e.target.value.toUpperCase(),
                    })
                  }
                  maxLength={7}
                  className="w-32 font-mono"
                />
              </div>
            ))}
            {!valid && (
              <p role="alert" className="text-busy-ink">
                Usa colores en formato #RRGGBB.
              </p>
            )}
            {!readable && (
              <p role="alert" className="text-busy-ink">
                El texto debe contrastar con el fondo y las tarjetas. Ajusta
                esos colores para que se lea bien.
              </p>
            )}
            <p className="text-xs text-soft">
              El color del texto sobre los botones se calcula automáticamente
              para mantener la lectura (
              {contrast(
                effective('acento'),
                inkFor(effective('acento')),
              ).toFixed(1)}
              :1).
            </p>
            <Button
              size="compact"
              onClick={() => {
                setPalette({})
                setFont('DM Sans')
              }}
            >
              Restaurar colores y tipografía del diseño
            </Button>
          </section>
          <section className="rounded-[20px] border border-border bg-surface p-5">
            <Select
              label="Tipografía del menú"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                  {f === 'DM Sans' ? ' · original del diseño' : ''}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-soft">
              Se aplica a todo el menú, incluidos títulos, botones y perfil.
            </p>
          </section>
          <SaveBar
            state={state}
            onSave={onSave}
            disabled={!valid || !readable || !!logoError}
            error={error}
          />
        </div>
        <aside className="self-start xl:sticky xl:top-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Vista previa</h3>
            <a
              href={`${ctx.dinerUrl}/${ctx.restaurante}/${ctx.sede}/`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary"
            >
              Abrir menú ↗
            </a>
          </div>
          {src && (
            <iframe
              key={`${src}-${previewVersion}`}
              src={src}
              title="Vista previa del menú"
              width={390}
              height={780}
              className="max-w-full rounded-[26px] border border-border bg-surface"
            />
          )}
          {previewBusy && <p role="status">Preparando vista previa…</p>}
          {previewError && <p role="alert">No pudimos preparar la vista previa. {previewError}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {src && <a href={src} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary">Abrir borrador ↗</a>}
            <a href={designSystemUrl(ctx.dinerUrl, ctx.restaurante, ctx.sede, preview?.borrador)} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary">Sistema de diseño ↗</a>
            <Button size="compact" disabled={previewBusy} onClick={() => setPreviewVersion(v => v + 1)}>Actualizar vista previa</Button>
          </div>
          <p className="mt-3 text-xs text-soft">
            Explora el diseño antes de guardar. Los cambios de color y fuente
            solo aparecen en el borrador hasta que los guardes. El enlace caduca a los 30 minutos.
          </p>
        </aside>
      </div>
    </div>
  )
}
