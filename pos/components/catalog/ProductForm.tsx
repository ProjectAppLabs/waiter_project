'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { SPICY_LEVELS, listToText, textToList, type DinerAttributes, type SpicyLevel } from '@/lib/domain/dinerAttributes'
import type { AdminCategory, ProductInput, Tax } from '@/lib/services/catalogAdmin'
import { GALLERY_MAX, PHOTO_MAX_BYTES, PHOTO_TYPES, catalogPhotoUrl, listCatalogPhotos, type GalleryItem } from '@/lib/services/catalogAdmin'
import { cn } from '@/lib/utils'

type Step = 'info' | 'image' | 'attributes'
const STEPS: Step[] = ['info', 'image', 'attributes']
const CONTROL = 'h-tap-min px-3.5 rounded-[10px] border border-border bg-surface text-base text-ink focus:outline-2 focus:outline-brand-500'

interface ProductFormProps { extraProducts?: {id:number;name:string}[]; initial: ProductInput; hasImage?: boolean; templateId?: number | null; isNew: boolean; categories: AdminCategory[]; taxes: Tax[]; onSave: (p: ProductInput) => Promise<void>; onClose: () => void }

// Formulario de producto con la estructura del wizard "Add New Dish" del kit: pasos a la izquierda, panel con cabecera a la
// derecha y el botón al pie. Los atributos del comensal (diner_attributes) se editan en el tercer paso.
export function ProductForm({ extraProducts = [], initial, hasImage = false, templateId = null, isNew, categories, taxes, onSave, onClose }: ProductFormProps) {
  const t = useTranslations('admin.catalog.form')
  const ui = useTranslations('admin.common')
  const [step, setStep] = useState<Step>('info')
  const [p, setP] = useState<ProductInput>({ ...initial, dinerAttributes: initial.dinerAttributes ?? {} })
  const [saveError,setSaveError] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const patch = (x: Partial<ProductInput>) => setP((c) => ({ ...c, ...x }))
  // Plan M · Galería: fotos existentes (id) y nuevas (base64) en el orden final; solo se envía si cambia.
  type Slot = { key: string; id?: number; image?: string }
  const [gallery, setGallery] = useState<Slot[]>([])
  const [photoError, setPhotoError] = useState('')
  useEffect(() => {
    if (!templateId) return
    let alive = true
    listCatalogPhotos(templateId).then((rows) => { if (alive) setGallery(rows.map((r) => ({ key: `id-${r.id}`, id: r.id }))) }).catch(() => undefined)
    return () => { alive = false }
  }, [templateId])
  const setSlots = (next: Slot[]) => { setGallery(next); patch({ gallery: next.map((g): GalleryItem => (g.id ? { id: g.id } : { image: g.image! })) }) }
  const readPhoto = (file: File, done: (b64: string) => void) => {
    if (!PHOTO_TYPES.includes(file.type)) { setPhotoError(t('photoType')); return }
    if (file.size > PHOTO_MAX_BYTES) { setPhotoError(t('photoSize')); return }
    setPhotoError('')
    const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(file)
  }
  const move = (i: number, by: number) => { const next = [...gallery]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); setSlots(next) }
  const attrs = p.dinerAttributes
  const patchAttr = (x: Partial<DinerAttributes>) => patch({ dinerAttributes: { ...attrs, ...x } })
  const toggleCategory = (id: number) => patch({ categoryIds: p.categoryIds.includes(id) ? p.categoryIds.filter((c) => c !== id) : [...p.categoryIds, id] })
  const numOrUndefined = (v: string) => (v === '' ? undefined : Number(v))
  async function save() {
    setState('saving');setSaveError('')
    try { await onSave(p); setState('saved') } catch(e) { setSaveError(e instanceof Error?e.message:'No se pudo guardar el producto.');setState('error') }
  }
  const toggleRow = (label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border"><div><p className="text-[15px] font-medium text-ink">{label}</p><p className="text-[13px] text-soft">{hint}</p></div><Toggle checked={checked} onChange={onChange} label={label} /></div>
  )
  const sizes = attrs.tamanos ?? []
  const setSize = (i: number, s: Partial<{ nombre: string; precio: number }>) => patchAttr({ tamanos: sizes.map((x, j) => (j === i ? { ...x, ...s } : x)) })

  return (
    <Modal open onClose={onClose} title={isNew ? t('newTitle') : t('title')} size="full">
      <div className="h-full flex">
        <aside className="w-[220px] shrink-0 p-4 flex flex-col gap-1">
          {templateId&&<a className="px-3 py-3 text-primary font-semibold text-sm" href={`/inventario?plato=${templateId}`}>Receta e inventario →</a>}
          {STEPS.map((s, i) => (
            <button key={s} type="button" role="tab" aria-selected={step === s} onClick={() => setStep(s)}
              className={cn('flex items-center gap-3 h-11 px-3 rounded-md text-[15px] font-semibold text-left', step === s ? 'bg-surface border border-border text-ink' : 'text-soft hover:bg-muted')}>
              <span className={cn('w-6 h-6 rounded-full grid place-items-center text-[13px]', step === s ? 'bg-primary text-primary-ink' : 'bg-muted text-soft')}>{i + 1}</span>{t(`steps.${s}`)}
            </button>
          ))}
        </aside>
        <section className="flex-1 min-w-0 m-4 ml-0 rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
          <header className="h-14 px-5 flex items-center justify-between border-b border-border shrink-0">
            <h3 className="text-[16px] font-semibold text-ink">{t(step === 'info' ? 'infoTitle' : step === 'image' ? 'imageTitle' : 'attributesTitle')}</h3>
            {!isNew && <span className="text-[13px] text-soft truncate">{initial.name}</span>}
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">{saveError&&<p role="alert" className="text-danger">{saveError}</p>}
            {step === 'info' && (
              <>
                <TextInput label={t('name')} placeholder={t('namePlaceholder')} value={p.name} onChange={(e) => patch({ name: e.target.value })} />
                <fieldset className="flex flex-col gap-1.5"><legend className="text-[15px] font-medium mb-1.5">{t('categories')}</legend>
                  <div className="flex flex-wrap gap-2">{categories.map((c) => <Chip key={c.id} label={c.name} active={p.categoryIds.includes(c.id)} onClick={() => toggleCategory(c.id)} />)}</div>
                </fieldset>
                <Field label={t('description')}>{(id) => <textarea id={id} rows={3} placeholder={t('descriptionPlaceholder')} value={p.description} onChange={(e) => patch({ description: e.target.value })} className={cn(CONTROL, 'h-auto py-3 resize-none')} />}</Field>
                <div className="grid grid-cols-2 gap-4">
                  <TextInput label={t('price')} type="number" inputMode="numeric" min={0} value={p.price} onChange={(e) => patch({ price: Number(e.target.value) })} className="tabular" />
                  <Select label={t('tax')} value={p.taxIds[0] ?? ''} onChange={(e) => patch({ taxIds: e.target.value ? [Number(e.target.value)] : [] })}>
                    <option value="">{t('noTax')}</option>{taxes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </div>
                {toggleRow('Es un combo', 'Producto con precio propio. Puedes ubicarlo en Combos o en cualquier categoría.', !!attrs.combo?.length, v=>patch({storable:v?false:p.storable,dinerAttributes:{...attrs,combo:v?[{producto:0,cantidad:1},{producto:0,cantidad:1}]:undefined}}))}
                {!!attrs.combo?.length&&<fieldset className="border border-border rounded-lg p-4 flex flex-col gap-3"><legend>Productos incluidos</legend><p className="text-sm text-soft">El precio de arriba es el total del combo. Selecciona al menos dos platos; sus recetas se usan para descontar inventario.</p>{attrs.combo.map((item,index)=><div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2 items-end"><Select label={`Producto ${index+1}`} value={item.producto||''} onChange={e=>patchAttr({combo:attrs.combo!.map((x,i)=>i===index?{...x,producto:Number(e.target.value)}:x)})}><option value="">Selecciona un plato</option>{extraProducts.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select><TextInput label="Cantidad" type="number" min={1} max={20} step={1} value={item.cantidad} onChange={e=>patchAttr({combo:attrs.combo!.map((x,i)=>i===index?{...x,cantidad:Number(e.target.value)}:x)})}/><Button variant="secondary" onClick={()=>patchAttr({combo:attrs.combo!.filter((_,i)=>i!==index)})}>Quitar</Button></div>)}<Button variant="secondary" disabled={attrs.combo.length>=12} onClick={()=>patchAttr({combo:[...attrs.combo!,{producto:0,cantidad:1}]})}>Añadir producto al combo</Button></fieldset>}
                {toggleRow(t('available'), t('availableHint'), p.available, (v) => patch({ available: v }))}
                {toggleRow(t('favorite'), t('favoriteHint'), p.favorite, (v) => patch({ favorite: v }))}
                {!attrs.combo?.length&&toggleRow(t('storable'), t('storableHint'), p.storable, (v) => patch({ storable: v }))}
              </>
            )}
            {step === 'image' && (
              <div className="flex items-start gap-6">
                <div className="w-[320px] aspect-[4/3] rounded-lg bg-muted overflow-hidden grid place-items-center text-dim">
                  {p.image
                    // eslint-disable-next-line @next/next/no-img-element -- base64 recién elegido; next/image no aplica a data URLs.
                    ? <img src={`data:image/*;base64,${p.image}`} alt="" className="w-full h-full object-cover" />
                    : hasImage && templateId
                      // eslint-disable-next-line @next/next/no-img-element -- foto servida por Odoo a través del proxy same-origin.
                      ? <img src={`/odoo/web/image/product.template/${templateId}/image_512`} alt="" className="w-full h-full object-cover" />
                      : <span className="flex flex-col items-center gap-2 text-[13px]"><Icon name="photo" size={36} />{t('noImage')}</span>}
                </div>
                <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('image')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('upload')} onChange={(e) => { const f = e.target.files?.[0]; if (f) readPhoto(f, (image) => patch({ image })) }} className="text-sm font-normal" />
                  <span className="text-[13px] text-soft font-normal">{t('imageHint')}</span>
                </label>
              </div>
            )}
            {step === 'image' && (
              <section aria-labelledby="galeria-titulo" className="mt-6 flex flex-col gap-3">
                <h4 id="galeria-titulo" className="text-[15px] font-medium text-ink">{t('gallery')}</h4>
                <p className="text-[13px] text-soft">{t('galleryHint')}</p>
                {photoError && <p role="alert" className="text-[14px] text-busy-ink">{photoError}</p>}
                <ul className="flex flex-wrap gap-3">
                  {gallery.map((g, i) => (
                    <li key={g.key} className="flex flex-col gap-1 items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Odoo por el proxy same-origin o base64 recién elegido. */}
                      <img src={g.image ? `data:image/*;base64,${g.image}` : catalogPhotoUrl(g.id!)} alt={t('galleryPhoto', { n: i + 1 })} className="w-[96px] h-[72px] rounded-md object-cover bg-muted" />
                      <div className="flex gap-1">
                        <button type="button" className="h-tap-min min-w-[44px] rounded-md border border-border text-sm" disabled={i === 0} aria-label={t('galleryLeft', { n: i + 1 })} onClick={() => move(i, -1)}>←</button>
                        <button type="button" className="h-tap-min min-w-[44px] rounded-md border border-border text-sm" disabled={i === gallery.length - 1} aria-label={t('galleryRight', { n: i + 1 })} onClick={() => move(i, 1)}>→</button>
                        <button type="button" className="h-tap-min min-w-[44px] rounded-md border border-border text-sm" aria-label={t('galleryRemove', { n: i + 1 })} onClick={() => setSlots(gallery.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
                {gallery.length < GALLERY_MAX && (
                  <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('galleryAdd')}
                    <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('galleryAdd')} className="text-sm font-normal"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readPhoto(f, (image) => setSlots([...gallery, { key: `nueva-${Date.now()}`, image }])) }} />
                  </label>
                )}
              </section>
            )}
            {step === 'attributes' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <TextInput label={t('prepTime')} hint={t('prepTimeHint')} type="number" inputMode="numeric" min={1} max={600} step={1} value={attrs.tiempoPreparacion ?? ''} onChange={(e) => patchAttr({ tiempoPreparacion: numOrUndefined(e.target.value) })} className="tabular" />
                  <TextInput label={t('previousPrice')} hint={t('previousPriceHint')} type="number" inputMode="numeric" min={0} value={attrs.precioAntes ?? ''} onChange={(e) => patchAttr({ precioAntes: numOrUndefined(e.target.value) })} className="tabular" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <TextInput label={t('pieces')} hint={t('piecesHint')} type="number" min={0} value={attrs.piezas ?? ''} onChange={(e) => patchAttr({ piezas: numOrUndefined(e.target.value) })} className="tabular" />
                  <TextInput label={t('abv')} type="number" min={0} step="0.1" value={attrs.abv ?? ''} onChange={(e) => patchAttr({ abv: numOrUndefined(e.target.value) })} className="tabular" />
                  <TextInput label={t('ibu')} type="number" min={0} value={attrs.ibu ?? ''} onChange={(e) => patchAttr({ ibu: numOrUndefined(e.target.value) })} className="tabular" />
                </div>
                <fieldset className="flex flex-col gap-1.5"><legend className="text-[15px] font-medium mb-1.5">{t('spicy')}</legend>
                  <div className="flex flex-wrap gap-2">{SPICY_LEVELS.map((l) => <Chip key={l} label={t(`spicyLevels.${l}`)} icon={l > 0 ? 'flame' : undefined} active={(attrs.picante ?? 0) === l} onClick={() => patchAttr({ picante: l as SpicyLevel })} />)}</div>
                </fieldset>
                <div className="grid grid-cols-2 gap-4">
                  <TextInput label={t('tags')} hint={t('tagsHint')} defaultValue={listToText(attrs.etiquetas)} onBlur={(e) => patchAttr({ etiquetas: textToList(e.target.value) })} />
                  <TextInput label={t('allergens')} hint={t('allergensHint')} defaultValue={listToText(attrs.alergenos)} onBlur={(e) => patchAttr({ alergenos: textToList(e.target.value) })} />
                </div>
                <TextInput label="Ingredientes del plato (opcional)" hint="Separa los ingredientes con comas. Solo se muestra lo que registres." defaultValue={listToText(attrs.ingredientes)} onBlur={e=>patchAttr({ingredientes:textToList(e.target.value)})}/>
                <fieldset className="grid grid-cols-2 gap-4"><legend className="text-[15px] font-medium mb-2">Información nutricional por porción (opcional)</legend><p className="col-span-2 text-sm text-soft">Completa solo los datos que conozcas. Los campos vacíos no aparecen en el menú; cero se muestra como un valor real.</p>{([['calorias','Calorías (kcal)'],['peso','Peso de la porción (g)'],['proteina','Proteína (g)'],['grasa','Grasa (g)'],['carbohidratos','Carbohidratos (g)'],['fibra','Fibra (g)']] as const).map(([key,label])=><TextInput key={key} label={label} type="number" min={0} max={100000} step="0.1" value={attrs.nutricion?.[key]??''} onChange={e=>patchAttr({nutricion:{...attrs.nutricion,[key]:numOrUndefined(e.target.value)}})}/>)}</fieldset>
                {!!extraProducts.length&&(['extras','acompanamientos'] as const).map(kind=><fieldset key={kind} className="flex flex-col gap-2"><legend className="text-[15px] font-medium mb-2">{kind==='extras'?'Adicionales del plato':'Acompañamientos recomendados'}</legend><p className="text-sm text-soft">{kind==='extras'?'Opciones con casilla y cantidad: huevo extra, queso, salsas…':'Platos que se muestran debajo con su foto y cantidad.'} Usan el precio y disponibilidad del catálogo.</p>{kind==='acompanamientos'&&<label className="flex items-center gap-3 py-2"><input type="checkbox" checked={attrs.acompanamientos!==undefined} onChange={e=>patchAttr({acompanamientos:e.target.checked?[]:undefined})}/>Elegir acompañamientos manualmente</label>}{(kind==='extras'||attrs.acompanamientos!==undefined)&&<div className="max-h-48 overflow-auto space-y-2">{extraProducts.map(extra=><label key={extra.id} className="flex items-center gap-3 py-2"><input type="checkbox" checked={attrs[kind]?.includes(extra.id)||false} disabled={(!attrs[kind]?.includes(extra.id)&&(attrs[kind]?.length||0)>=19)||!!attrs[kind==='extras'?'acompanamientos':'extras']?.includes(extra.id)} onChange={e=>patchAttr({[kind]:e.target.checked?[...(attrs[kind]||[]),extra.id]:(attrs[kind]||[]).filter(id=>id!==extra.id)})}/>{extra.name}</label>)}</div>}{kind==='acompanamientos'&&attrs.acompanamientos===undefined&&<p className="text-sm text-soft">Se sugieren hasta tres productos disponibles del catálogo.</p>}</fieldset>)}
                <fieldset className="flex flex-col gap-2"><legend className="text-[15px] font-medium mb-1.5">{t('sizes')}</legend>
                  {sizes.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_180px_auto] gap-3 items-end">
                      <TextInput label={t('sizeName')} value={s.nombre} onChange={(e) => setSize(i, { nombre: e.target.value })} />
                      <TextInput label={t('sizePrice')} type="number" min={0} value={s.precio} onChange={(e) => setSize(i, { precio: Number(e.target.value) })} className="tabular" />
                      <Button size="compact" aria-label={t('removeSize')} onClick={() => patchAttr({ tamanos: sizes.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></Button>
                    </div>
                  ))}
                  <Button size="compact" className="self-start" onClick={() => patchAttr({ tamanos: [...sizes, { nombre: '', precio: p.price }] })}><Icon name="plus" size={18} />{t('addSize')}</Button>
                </fieldset>
                {toggleRow(t('onlyToday'), t('onlyTodayHint'), attrs.soloHoy ?? false, (v) => patchAttr({ soloHoy: v }))}
              </>
            )}
          </div>
          <footer className="px-5 py-4 border-t border-border flex items-center gap-4 shrink-0">
            <Button variant="primary" onClick={save} disabled={state === 'saving' || !p.name.trim()}>{t('save')}</Button>
            {state === 'saved' && <p role="status" className="text-[14px] text-success-ink">{t('saved')}</p>}
            {state === 'error' && <p role="alert" className="text-[14px] text-danger-ink">{ui('error')}</p>}
          </footer>
        </section>
      </div>
    </Modal>
  )
}
