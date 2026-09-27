'use client'

import { memo } from 'react'

import { Icon } from '@/components/kit/Icon'
import { DecorGlyph } from '@/components/tables/decor/DecorArt'
import { PanelTitle, TableGlyph } from '@/components/tables/editor/parts'
import { DECOR_ASSETS, DECOR_CATEGORIES, DECOR_INFO, type DecorAsset } from '@/lib/domain/decor'

// Mesas que se pueden agregar. `label` es el nombre accesible (lo usan las pruebas); `detail` lo que se lee debajo.
export const TABLE_PRESETS = [
  { label: 'Mesa pequeña', detail: 'Cuadrada · 4 personas', width: 120, height: 120, seats: 4 },
  { label: 'Mesa grande horizontal', detail: 'Alargada · 8 personas', width: 240, height: 120, seats: 8 },
  { label: 'Mesa grande vertical', detail: 'Alargada · 8 personas', width: 120, height: 240, seats: 8 },
  { label: 'Mesa personalizada', detail: '6 personas · cambia tamaño y sillas', width: 160, height: 160, seats: 6 },
] as const

interface Props {
  name: string; onName: (name: string) => void; onAddTable: (width: number, height: number, seats: number) => void; onAddDecor: (asset: DecorAsset) => void
  hasImage: boolean; imageCount: number; canAddImage: boolean; imagePercent: number; onImageFile: (file: File) => void; onImageScale: (percent: number) => void; onImageRemove: () => void; onImageSelect: () => void
  busy: boolean
}

// Columna izquierda: lo que se agrega al plano. Cada mesa se ve dibujada antes de tocarla y cae en el centro de lo que
// se está mirando. La imagen de referencia es un calco: una foto o un plano del local para dibujar encima.
export const EditorPalette = memo(function EditorPalette({ name, onName, onAddTable, onAddDecor, hasImage, imageCount, canAddImage, imagePercent, onImageFile, onImageScale, onImageRemove, onImageSelect, busy }: Props) {
  return (
    <aside className="w-[220px] xl:w-[272px] shrink-0 border-r border-border bg-surface overflow-y-auto flex flex-col" aria-label="Agregar al plano">
      <div className="p-4 border-b border-border">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-soft">Nombre del piso
          <input className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] font-semibold text-ink focus:outline-2 focus:outline-brand-500" value={name} onChange={(e) => onName(e.target.value)} />
        </label>
      </div>
      <section className="p-4 border-b border-border flex flex-col gap-3" aria-label="Agregar mesa">
        <PanelTitle icon="plus">Agregar mesa</PanelTitle>
        <p className="text-[12px] leading-relaxed text-dim">Toca una y aparece en el centro del plano, lista para arrastrar.</p>
        <div className="grid grid-cols-2 gap-2">
          {TABLE_PRESETS.map((p) => (
            <button key={p.label} type="button" aria-label={p.label} disabled={busy} onClick={() => onAddTable(p.width, p.height, p.seats)}
              className="p-2 rounded-md border border-border flex flex-col items-center gap-1 text-center hover:border-primary hover:bg-primary-soft disabled:opacity-40">
              <TableGlyph width={p.width} height={p.height} />
              <span className="text-[12px] xl:text-[13px] font-semibold text-ink leading-tight break-words">{p.label.replace('Mesa ', '').replace(/^./, (c) => c.toUpperCase())}</span>
              <span className="hidden xl:block text-[11px] leading-tight text-dim">{p.detail}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="p-4 border-b border-border flex flex-col gap-3" aria-label="Decoración">
        <PanelTitle icon="palette">Decoración</PanelTitle>
        <p className="text-[12px] leading-relaxed text-dim">Dibuja el espacio: cocina, barra, baños, escaleras. El mesero las ve detrás de las mesas.</p>
        {DECOR_CATEGORIES.map((category) => (
          <div key={category.key} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-dim">{category.label}</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {DECOR_ASSETS.filter((asset) => DECOR_INFO[asset].category === category.key).map((asset) => (
                <button key={asset} type="button" aria-label={`Agregar ${DECOR_INFO[asset].label}`} title={DECOR_INFO[asset].label} disabled={busy} onClick={() => onAddDecor(asset)}
                  className="p-1.5 rounded-md border border-border flex flex-col items-center gap-1 text-center hover:border-primary hover:bg-primary-soft disabled:opacity-40">
                  <DecorGlyph asset={asset} width={DECOR_INFO[asset].width} height={DECOR_INFO[asset].height} size={44} />
                  <span className="text-[11px] font-medium text-ink leading-tight break-words">{DECOR_INFO[asset].label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="p-4 flex flex-col gap-3">
        <PanelTitle icon="photo" aside={imageCount > 0 ? <span className="text-[12px] font-normal text-dim">{imageCount}</span> : undefined}>Imágenes de referencia</PanelTitle>
        <p className="text-[12px] leading-relaxed text-dim">Fotos o planos del local para dibujar encima: una para todo el piso o una por zona. El mesero las ve tenues detrás de las mesas.</p>
        <label className="text-[13px] font-medium text-soft">
          <span className="sr-only">Imagen de referencia</span>
          <span className="h-11 rounded-md border border-dashed border-border flex items-center justify-center gap-2 text-[14px] font-semibold text-soft cursor-pointer hover:border-primary hover:text-primary"><Icon name={hasImage ? 'photoPlus' : 'upload'} size={18} />{hasImage ? 'Agregar otra imagen' : 'Subir imagen'}</span>
          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={!canAddImage} onChange={(e) => { const file = e.target.files?.[0]; if (file) onImageFile(file); e.target.value = '' }} />
          <span className="mt-1.5 block text-[11px] font-normal text-dim">{canAddImage ? 'PNG o JPG · hasta 10 MB cada una' : 'Llegaste al máximo de imágenes. Quita una para agregar otra.'}</span>
        </label>
        {hasImage && <>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">{imageCount > 1 ? 'Tamaño de la primera imagen' : 'Tamaño de la imagen'}
            <input aria-label="Tamaño de la imagen" className="w-full accent-[var(--color-primary)]" type="range" min={25} max={400} step={5} value={imagePercent} onChange={(e) => onImageScale(Number(e.target.value))} />
            <span className="text-[11px] font-normal text-dim">{imagePercent}% · conserva las proporciones</span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onImageSelect} className="flex-1 h-10 rounded-md border border-border flex items-center justify-center gap-2 text-[13px] font-semibold text-soft hover:bg-muted"><Icon name="move" size={16} />Mover</button>
            <button type="button" aria-label="Quitar imagen de referencia" onClick={onImageRemove} className="flex-1 h-10 rounded-md border border-border flex items-center justify-center gap-2 text-[13px] font-semibold text-soft hover:bg-danger-soft hover:text-danger-ink"><Icon name="trash" size={16} />Quitar</button>
          </div>
        </>}
      </section>
    </aside>
  )
})
