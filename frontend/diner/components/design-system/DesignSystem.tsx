'use client'

// Página viva del sistema de diseño (Plan J5): fundamentos, cada componente con sus variantes y las pantallas del
// inventario, pintados con el tema de la sede (o de un borrador). Solo lectura: no abre sesiones ni pide nada.
import { COMPONENTS, DEMONSTRATED_BY, FIELDS, FIELD_LABELS, SAMPLES, Sample, sampleDishes, type ComponentId, type VariantField } from './samples'
import { DESIGN_FACTORS, SHAPE_FACTOR, SHAPE_ROLES } from '@/lib/domain/designSystem'
import { SCREEN_LAYOUTS, designSystemAttributes } from '@/lib/domain/designVariants'
import { COLOR_TOKENS } from '@/lib/domain/template'
import type { DesignContract, DesignRule, Entry, MenuTheme, Template } from '@/lib/types'
import './design-system.css'

export interface DesignSystemProps {
  entry: Entry
  template: Template
  contract: DesignContract | null
  // Token del borrador (?borrador=) y su caducidad; sin borrador se muestra el tema publicado.
  draft: string | null
  expires: string | null
  // /<rest>/<sede>, ya codificado.
  base: string
}

const COLOR_NAMES: Record<(typeof COLOR_TOKENS)[number], string> = {
  fondo: 'Fondo', superficie: 'Superficie', tinta: 'Tinta', tintaSuave: 'Tinta suave', tintaTerciaria: 'Destacado',
  borde: 'Borde', acento: 'Acento', acentoTinta: 'Tinta sobre acento', acentoSuave: 'Acento suave',
}
const SHAPE_NAMES: Record<(typeof SHAPE_ROLES)[number], string> = { tarjeta: 'Tarjeta', boton: 'Botón', chip: 'Chip', campo: 'Campo', imagen: 'Imagen', hoja: 'Hoja' }
const FACTOR_NAMES: Record<keyof typeof DESIGN_FACTORS, string> = { densidad: 'Densidad', texto: 'Texto', titulo: 'Títulos' }
const SPACING_STEPS = [4, 8, 12, 16, 24, 32, 48] as const
const number = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 2 })

// Fundamentos del tema; una respuesta sin tema v2 muestra los tokens resueltos con los factores en 1.
export function foundationOf(template: Template): MenuTheme['fundamentos'] {
  if (template.tema?.version === 2) return template.tema.fundamentos
  const k = template.tokens
  return { densidad: 1, texto: 1, titulo: 1, forma: { tarjeta: 1, boton: 1, chip: 1, campo: 1, imagen: 1, hoja: 1 },
    colores: { fondo: k.fondo, superficie: k.superficie, tinta: k.tinta, tintaSuave: k.tintaSuave, tintaTerciaria: k.tintaTerciaria, borde: k.borde, acento: k.acento, acentoTinta: k.acentoTinta, acentoSuave: k.acentoSuave },
    tipografia: { display: k.displayFont, cuerpo: k.cuerpoFont } }
}

function rule(contract: DesignContract | null, ...path: string[]): DesignRule | undefined {
  let current: DesignRule | undefined = contract?.esquema as DesignRule | undefined
  for (const key of path) current = current?.properties?.[key]
  return current
}

function expiresAt(iso: string | null): string | null {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null
}

export function DesignSystem({ entry, template, contract, draft, expires, base }: DesignSystemProps) {
  const foundation = foundationOf(template)
  const dishes = sampleDishes(entry)
  const context = { entry, dishes }
  const inventory = contract?.inventario
  const components = inventory?.componentes ?? COMPONENTS
  const layerOf = (field: VariantField) => field in SCREEN_LAYOUTS ? 'distribucion' : 'variantes'
  // La opción elegida es la misma que la carta pone en <main>: valores fuera del catálogo caen al predeterminado.
  const attributes = designSystemAttributes(template.tema)
  const chosen = (field: VariantField) => attributes[FIELDS[field].attribute as `data-ds-${string}`]
  const withDraft = (path: string) => draft !== null ? `${path}?borrador=${encodeURIComponent(draft)}` : path
  const until = expiresAt(expires)
  return <div className="ds-page">
    <header className="ds-header">
      <p className="ds-eyebrow">Sistema de diseño del menú</p>
      <h1>{entry.contexto.marca.nombre || entry.carta.restaurante}</h1>
      <p>{entry.contexto.sede.nombre}</p>
      <p role="status" className="ds-status">{draft !== null
        ? <>Tema de un borrador{until && <> · caduca a las {until}</>}. Nada de lo que ves está publicado.</>
        : <>Tema publicado. Cada muestra usa los componentes reales de la carta.</>}</p>
      <nav className="ds-links" aria-label="Enlaces del sistema de diseño">
        <a href={withDraft(`${base}/carta`)}>{draft !== null ? 'Ver el borrador en la carta' : 'Abrir la carta'}</a>
        {draft !== null && <a href={`${base}/design-system`}>Ver el tema publicado</a>}
        <a href="#fundamentos">Fundamentos</a>
        <a href="#componentes">Componentes</a>
        <a href="#pantallas">Pantallas</a>
      </nav>
    </header>

    <section className="ds-section" id="fundamentos" aria-labelledby="ds-fundamentos">
      <h2 id="ds-fundamentos">Fundamentos</h2>
      <div className="ds-grid">
        <article className="ds-card">
          <h3>Colores</h3>
          <ul className="ds-swatches">
            {COLOR_TOKENS.map((token) => <li key={token} className="ds-swatch">
              <i style={{ background: foundation.colores[token] }} aria-hidden="true" />
              <span><strong>{COLOR_NAMES[token]}</strong><code>{foundation.colores[token]}</code>{rule(contract, 'fundamentos', 'colores', token)?.readOnly && <small>Calculado a partir del acento y el fondo.</small>}</span>
            </li>)}
          </ul>
        </article>
        <article className="ds-card">
          <h3>Tipografía</h3>
          <p className="ds-type-display" style={{ fontFamily: `'${foundation.tipografia.display}', system-ui, sans-serif` }}>Aa {foundation.tipografia.display}</p>
          <p className="ds-type-body" style={{ fontFamily: `'${foundation.tipografia.cuerpo}', system-ui, sans-serif` }}>Cuerpo en {foundation.tipografia.cuerpo}: describe el plato, sus ingredientes y cómo se sirve.</p>
          <dl className="ds-factors">
            {(Object.keys(DESIGN_FACTORS) as (keyof typeof DESIGN_FACTORS)[]).map((key) => {
              const limits = rule(contract, 'fundamentos', key)
              return <div key={key}><dt>{FACTOR_NAMES[key]}</dt><dd><strong>× {number(foundation[key])}</strong><small>{number(limits?.minimum ?? DESIGN_FACTORS[key].min)} a {number(limits?.maximum ?? DESIGN_FACTORS[key].max)}, predeterminado {number(DESIGN_FACTORS[key].default)}</small>{limits?.description && <small>{limits.description}</small>}</dd></div>
            })}
          </dl>
        </article>
        <article className="ds-card">
          <h3>Espaciado</h3>
          <p>Pasos de 2 px multiplicados por la densidad <strong>× {number(foundation.densidad)}</strong>.</p>
          <ol className="ds-scale" aria-label="Escala de espaciado">
            {SPACING_STEPS.map((step) => <li key={step}><code>--ds-espacio-{step}</code><i style={{ width: `calc(${step}px * ${foundation.densidad})` }} aria-hidden="true" /><span>{number(step * foundation.densidad)} px</span></li>)}
          </ol>
        </article>
        <article className="ds-card">
          <h3>Forma</h3>
          <p>{rule(contract, 'fundamentos', 'forma', 'tarjeta')?.description ?? 'Multiplica el radio original de cada componente; 0 deja esquinas rectas.'} Rango {number(SHAPE_FACTOR.min)} a {number(SHAPE_FACTOR.max)}.</p>
          <ul className="ds-shapes">
            {SHAPE_ROLES.map((role) => <li key={role}><i className="ds-shape" style={{ borderRadius: `calc(16px * ${foundation.forma[role]})` }} aria-hidden="true" /><strong>{SHAPE_NAMES[role]}</strong><code>× {number(foundation.forma[role])}</code></li>)}
          </ul>
        </article>
      </div>
    </section>

    <section className="ds-section" id="componentes" aria-labelledby="ds-componentes">
      <h2 id="ds-componentes">Componentes</h2>
      <p>Cada componente aparece con el tema {draft !== null ? 'del borrador' : 'publicado'} y, debajo, cada opción de sus variantes. La opción elegida lleva un marco.</p>
      {components.map((component) => {
        const id = component.id as ComponentId
        const render = SAMPLES[id]
        if (!render) return null
        const full = inventory?.componentes.find((c) => c.id === id)
        const demonstrated = (component.variantes as readonly string[]).filter((field) => DEMONSTRATED_BY[field as VariantField] === id) as VariantField[]
        const elsewhere = (component.variantes as readonly string[]).filter((field) => DEMONSTRATED_BY[field as VariantField] !== id) as VariantField[]
        return <article className="ds-component" id={`componente-${id}`} key={id} aria-labelledby={`ds-${id}`}>
          <h3 id={`ds-${id}`}>{component.nombre}</h3>
          {full && <ul className="ds-meta" aria-label="Fundamentos y selectores que consume">
            {full.fundamentos.map((f) => <li key={f}>{f.replace(/^fundamentos\./, '')}</li>)}
            {full.selectores.map((s) => <li key={s}><code>{s}</code></li>)}
            {template.tema?.componentes?.[id] && <li className="ds-meta-plantilla">plantilla propia (v{template.tema.componentes[id]!.version})</li>}
          </ul>}
          <Sample template={template} screen={id === 'ficha' ? 'plato' : id === 'carrito' ? 'pedido' : 'carta'}>{render(context)}</Sample>
          {elsewhere.length > 0 && <p className="ds-elsewhere">También cambia con {elsewhere.map((field, i) => <span key={field}>{i > 0 && ', '}<a href={`#componente-${DEMONSTRATED_BY[field]}`}>{FIELD_LABELS[field].toLowerCase()}</a></span>)}.</p>}
          {demonstrated.map((field) => {
            const definition = inventory?.variantes[field]
            const current = chosen(field)
            return <div key={field} className="ds-field" data-campo={field}>
              <h4>{FIELD_LABELS[field]} <code>{definition?.ruta ?? `${layerOf(field)}.${field}`}</code></h4>
              <div className={`ds-grid${field === 'ficha' ? ' ds-grid-wide' : ''}`}>
                {FIELDS[field].values.map((value) => <figure key={value} className="ds-option" data-campo={field} data-valor={value} data-elegida={value === current}>
                  <Sample template={template} override={{ [field]: value }} screen={id === 'ficha' ? 'plato' : id === 'carrito' ? 'pedido' : 'carta'}>{render(context)}</Sample>
                  <figcaption><strong>{value}{value === FIELDS[field].default && ' (predeterminada)'}</strong>{definition?.opciones.find((o) => o.valor === value)?.descripcion}</figcaption>
                </figure>)}
              </div>
            </div>
          })}
        </article>
      })}
    </section>

    <section className="ds-section" id="pantallas" aria-labelledby="ds-pantallas">
      <h2 id="ds-pantallas">Pantallas</h2>
      {inventory ? <>
        <p>Componentes de cada pantalla, en el orden del inventario.</p>
        <ul className="ds-screens">
          {Object.entries(inventory.pantallas).map(([screen, ids]) => <li key={screen} className="ds-card">
            <strong>{screen}</strong>
            <ol>{ids.map((id) => <li key={id}><a href={`#componente-${id}`}>{inventory.componentes.find((c) => c.id === id)?.nombre ?? id}</a></li>)}</ol>
          </li>)}
        </ul>
      </> : <p>El inventario de pantallas no está disponible: el contrato del sistema de diseño no respondió.</p>}
    </section>
  </div>
}
