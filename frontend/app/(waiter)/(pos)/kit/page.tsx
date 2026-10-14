'use client'

import { useRef, useState } from 'react'

import { KpiTile as DashboardKpiTile } from '@/components/dashboard/KpiTile'
import { DocSection, Example, Swatch } from '@/components/design/parts'
import { Aurora, AuroraBackground } from '@/components/kit/Aurora'
import { BrandMark } from '@/components/kit/BrandMark'
import { Card } from '@/components/kit/Card'
import { Chip } from '@/components/kit/Chip'
import { Icon, KIT_ICON_NAMES } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { CardGridSkeleton, ListSkeleton, Skeleton, SkeletonText } from '@/components/kit/Skeleton'
import { Modal } from '@/components/kit/Modal'
import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { PinInput } from '@/components/kit/PinInput'
import { StatusPill, type PillTone } from '@/components/kit/StatusPill'
import { Toggle } from '@/components/kit/Toggle'
import { WizardSteps } from '@/components/kit/WizardSteps'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { KpiTile } from '@/components/ui/KpiTile'
import { Money } from '@/components/ui/Money'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { AURORA, KIT_DARK, KIT_LIGHT, RADII, TAP_SIZES, TYPE_SCALE, cssVar, type KitToken } from '@/lib/design/tokens'
import { toast } from '@/lib/stores/toastStore'

const SECTIONS = [
  ['principios', 'Principios'], ['color', 'Color'], ['tipografia', 'Tipografía'], ['forma', 'Forma y tamaño'],
  ['acciones', 'Acciones'], ['formularios', 'Formularios'], ['estados', 'Estados'], ['contenedores', 'Contenedores'], ['esqueletos', 'Esqueletos de carga'],
  ['iconos', 'Iconos'], ['aurora', 'Patrón Aurora'], ['movimiento', 'Movimiento'],
] as const

const PILL_TONES: PillTone[] = ['progress', 'success', 'info', 'danger', 'reserved', 'neutral']
const BADGE_TONES = ['free', 'busy', 'kitchen', 'pending', 'assist', 'brand', 'neutral'] as const
const TOKEN_GROUPS: [string, KitToken[]][] = [
  ['Marca', ['primary', 'primarySoft', 'primaryInk']],
  ['Superficies', ['canvas', 'surface', 'muted', 'border', 'overlay']],
  ['Texto', ['ink', 'soft', 'dim']],
  ['En curso', ['progress', 'progressSoft', 'progressInk']],
  ['Listo', ['success', 'successSoft', 'successInk']],
  ['Alerta', ['danger', 'dangerSoft', 'dangerInk']],
  ['Información', ['info', 'infoSoft', 'infoInk']],
  ['Reservada', ['reserved', 'reservedInk']],
]

// Sistema de diseño del POS, vivo: cada ejemplo es el componente real con los tokens reales, así que lo que se ve
// aquí es lo que se ve en el salón. Solo disponible en desarrollo. Cómo ampliarlo: docs/diseno.
export default function DesignSystemPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [pin, setPin] = useState('')
  const [on, setOn] = useState(true)
  const [segment, setSegment] = useState<'hoy' | 'semana' | 'mes'>('hoy')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'center' | 'wide' | 'full' | null>(null)
  // El índice mueve solo el panel de contenido. Un ancla normal (#id) desplazaría el documento entero y se llevaría
  // la barra superior, porque el navegador hace scroll de todos los ancestros aunque tengan overflow oculto.
  const scroller = useRef<HTMLDivElement>(null)
  const goTo = (id: string) => {
    const target = document.getElementById(id)
    if (!scroller.current || !target) return
    scroller.current.scrollTo({ top: target.offsetTop - 24 })
    target.querySelector('h2')?.focus({ preventScroll: true })
  }
  return (
    <>
      <div className="flex-1 min-h-0 flex">
        <nav aria-label="Secciones del sistema de diseño" className="hidden lg:flex w-[232px] shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 overflow-y-auto">
          <p className="px-3 pb-2 text-[13px] text-soft">Sistema de diseño</p>
          {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => goTo(id)} className="h-10 px-3 flex items-center rounded-md text-left text-[15px] font-medium text-soft hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500">{label}</button>)}
          <div className="mt-auto pt-4"><Segmented label="Tema de los ejemplos" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} /></div>
        </nav>

        <div ref={scroller} data-theme={theme} className="relative flex-1 min-w-0 overflow-y-auto motion-safe:scroll-smooth bg-canvas text-ink">
          <div className="mx-auto max-w-[1040px] px-6 lg:px-10 py-10">
            <header className="mb-12">
              <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.025em]">Sistema de diseño de Waiter</h1>
              <p className="mt-3 max-w-[68ch] text-[16px] leading-relaxed text-soft">Todo lo que se ve en el salón, la cocina y la caja sale de aquí: los colores, la letra, los tamaños y los componentes. Cada ejemplo es el componente real, no una imagen, así que esta página nunca se queda vieja.</p>
            </header>

            <DocSection id="principios" title="Principios" intro="Cuatro reglas que explican por qué el sistema es como es. Cuando algo nuevo no encaje, se decide con ellas."
              extend={<>antes de crear un componente, busca uno en <code className="font-mono">components/kit</code> o <code className="font-mono">components/ui</code>. Si de verdad falta, créalo ahí, con tokens y no con colores sueltos, y añádele un ejemplo en esta página.</>}>
              <ol className="grid gap-4 md:grid-cols-2">
                {[
                  ['Se usa con el dedo y de pie', 'Nada tocable mide menos de 48 px. El texto base es de 16 px porque la tablet está a un brazo de distancia.'],
                  ['El estado sigue siendo claro', 'Ámbar es en curso, verde es listo, rojo es alerta, azul es acción. Aurora aporta ambiente al fondo; los controles y estados conservan sus colores semánticos.'],
                  ['Una sola fuente de verdad', 'Los valores viven en lib/design/tokens.ts y en globals.css. Una prueba falla si dejan de coincidir.'],
                  ['Claro y oscuro desde el primer día', 'Un componente usa tokens semánticos (surface, ink, border), nunca un hex. Así el tema oscuro sale gratis.'],
                ].map(([title, body]) => <li key={title} className="rounded-lg border border-border bg-surface p-5"><p className="text-[16px] font-semibold">{title}</p><p className="mt-1.5 text-[15px] leading-relaxed text-soft">{body}</p></li>)}
              </ol>
            </DocSection>

            <DocSection id="color" title="Color" intro="Cada muestra enseña el valor en tema claro a la izquierda y en oscuro a la derecha. En el código se usa el nombre semántico como clase de Tailwind: bg-surface, text-ink, border-border, bg-primary."
              extend={<>agrega el token en <code className="font-mono">KIT_LIGHT</code> y <code className="font-mono">KIT_DARK</code>, decláralo como <code className="font-mono">--kit-…</code> en los dos temas de <code className="font-mono">globals.css</code> y expónlo en <code className="font-mono">@theme</code>. Aparece aquí solo al sumarlo a un grupo.</>}>
              {TOKEN_GROUPS.map(([group, tokens]) => (
                <div key={group}>
                  <h3 className="mb-3 text-[16px] font-semibold">{group}</h3>
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">{tokens.map((token) => <Swatch key={token} name={token} cssName={cssVar(token)} light={KIT_LIGHT[token]} dark={KIT_DARK[token]} />)}</div>
                </div>
              ))}
            </DocSection>

            <DocSection id="tipografia" title="Tipografía" intro="Open Sans para toda la interfaz e IBM Plex Mono para códigos y PIN. La escala es corta a propósito: si necesitas un tamaño que no está aquí, probablemente sobra jerarquía."
              extend={<>suma el estilo a <code className="font-mono">TYPE_SCALE</code> en <code className="font-mono">lib/design/tokens.ts</code> con su clase y cuándo se usa.</>}>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {TYPE_SCALE.map((style) => (
                  <div key={style.name} className="p-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
                    <p className={style.className}>{style.name === 'Cifras' ? '$ 128.450' : style.name === 'Código' ? 'MESA-08 · 4821' : 'Opera más mesas'}</p>
                    <div><p className="text-[14px] font-semibold">{style.name}</p><p className="text-[13px] text-soft">{style.use}</p><p className="mt-1 font-mono text-[12px] text-soft break-words">{style.className}</p></div>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="forma" title="Forma y tamaño" intro="Cuatro radios y tres alturas táctiles. El radio crece con el tamaño del contenedor; la altura crece con lo que cuesta equivocarse."
              extend={<>declara <code className="font-mono">--radius-…</code> o <code className="font-mono">--spacing-…</code> en el <code className="font-mono">@theme</code> de <code className="font-mono">globals.css</code> y súmalo a <code className="font-mono">RADII</code> o <code className="font-mono">TAP_SIZES</code>.</>}>
              <Example name="Radios" className="items-end gap-6">
                {RADII.map((r) => <div key={r.token} className="flex flex-col gap-2"><span className={`block w-24 h-16 border border-border bg-primary-soft ${r.className}`} /><p className="text-[14px] font-semibold">{r.className} · {r.px} px</p><p className="max-w-[160px] text-[13px] text-soft">{r.use}</p></div>)}
              </Example>
              <Example name="Alturas táctiles" className="items-end gap-6">
                {TAP_SIZES.map((s) => <div key={s.token} className="flex flex-col gap-2"><span className={`w-40 rounded-md bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold ${s.className}`}>{s.px} px</span><p className="text-[14px] font-semibold">{s.className}</p><p className="max-w-[180px] text-[13px] text-soft">{s.use}</p></div>)}
              </Example>
            </DocSection>

            <DocSection id="acciones" title="Acciones" intro="Un botón primario por pantalla: el siguiente paso. Lo demás es secundario. Destructivo solo para lo que no se puede deshacer, siempre con confirmación."
              extend={<>las variantes y tamaños están en <code className="font-mono">components/ui/Button.tsx</code> (<code className="font-mono">VARIANT</code> y <code className="font-mono">SIZE</code>). Añade ahí la nueva y un ejemplo aquí.</>}>
              <Example name="Variantes" code={'<Button variant="primary">Enviar a cocina</Button>'}>
                <Button variant="primary">Enviar a cocina</Button><Button>Guardar borrador</Button><Button variant="ghost">Cancelar</Button><Button variant="destructive">Anular pedido</Button><Button variant="primary" disabled>Sin platos</Button>
              </Example>
              <Example name="Tamaños" code={'<Button size="money" variant="primary">Cobrar</Button>'}>
                <Button size="compact">Compacto · 48</Button><Button>Estándar · 56</Button><Button size="money" variant="primary">Cobrar <Money amount={128450} withSymbol /></Button>
              </Example>
              <Example name="Filtros y selección" code={'<Chip label="En progreso" count={11} active />'}>
                <Chip label="Todos" count={20} active /><Chip label="En progreso" count={11} /><Chip label="Listos" count={5} icon="check" />
                <Segmented label="Periodo" value={segment} onChange={setSegment} options={[{ value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} />
              </Example>
            </DocSection>

            <DocSection id="formularios" title="Formularios" intro="La etiqueta va siempre visible encima del campo, y la ayuda debajo. El marcador de posición es un ejemplo, no la instrucción."
              extend={<>usa <code className="font-mono">Field</code> de <code className="font-mono">components/ui/Field.tsx</code> para envolver cualquier control nuevo: te da etiqueta, ayuda y el <code className="font-mono">id</code> enlazado.</>}>
              <Example name="Campos" className="items-start" code={'<TextInput label="Nombre del plato" hint="Como aparece en la carta." />'}>
                <div className="w-full grid gap-4 md:grid-cols-2">
                  <TextInput label="Nombre del plato" placeholder="Hamburguesa clásica" hint="Como aparece en la carta." />
                  <Select label="Estación de cocina" defaultValue="parrilla"><option value="parrilla">Parrilla</option><option value="barra">Barra</option></Select>
                  <SearchInput value={search} onChange={setSearch} placeholder="Buscar plato o mesa" />
                  <div className="flex items-center gap-3 h-tap-min"><Toggle checked={on} onChange={setOn} label="Sonido de avisos" /><span className="text-[15px]">Sonido de avisos</span></div>
                </div>
              </Example>
              <Example name="PIN y teclado" className="flex-col">
                <PinInput value={pin} label="PIN" />
                <NumericKeypad onDigit={(d) => setPin((p) => (p + d).slice(0, 6))} onBackspace={() => setPin((p) => p.slice(0, -1))} />
              </Example>
            </DocSection>

            <DocSection id="estados" title="Estados" intro="La píldora cuenta en qué va un pedido o una mesa; la insignia marca una cualidad. Las dos usan la tripleta del token: fondo suave, tinta y, si hace falta, el color pleno."
              extend={<>un estado nuevo necesita su tripleta de color (pleno, suave, tinta) en los tokens y su tono en <code className="font-mono">StatusPill</code> o <code className="font-mono">Badge</code>.</>}>
              <Example name="StatusPill" code={'<StatusPill tone="progress" icon="clock">En curso</StatusPill>'}>{PILL_TONES.map((tone) => <StatusPill key={tone} tone={tone} icon="clock">{tone}</StatusPill>)}</Example>
              <Example name="Badge" code={'<Badge tone="kitchen">En cocina</Badge>'}>{BADGE_TONES.map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}</Example>
              <Example name="Indicadores" className="items-stretch">
                <KpiTile label="Ventas de hoy" value={<Money amount={2845000} withSymbol />} icon="chartLine" hint="18 pedidos" tone="primary" className="flex-1 min-w-[220px]" />
                <KpiTile label="Mesas ocupadas" value="9 de 14" icon="grid" className="flex-1 min-w-[220px]" />
                <KpiTile label="Platos demorados" value="2" icon="alert" tone="danger" hint="Más de 20 min" className="flex-1 min-w-[220px]" />
              </Example>
              <Example name="Aviso en pantalla"><Button onClick={() => toast({ title: '¡Pedido #DI001 enviado!', body: 'Va camino a cocina.' })}>Mostrar aviso</Button></Example>
            </DocSection>

            <DocSection id="contenedores" title="Contenedores" intro="La tarjeta agrupa, el modal interrumpe y el estado vacío invita a actuar. Un modal solo se abre por una acción de la persona."
              extend={<>los tamaños del modal están en <code className="font-mono">components/kit/Modal.tsx</code>. Para un panel lateral usa <code className="font-mono">components/ui/Drawer.tsx</code>.</>}>
              <div className="grid gap-6 md:grid-cols-2">
                <Card title="Tarjeta con acción" action={<Button size="compact">Ver todo</Button>}><p className="p-5 text-[15px] text-soft">Cabecera de 16 px seminegrita, borde de 1 px y radio grande. El contenido pone su propio relleno.</p></Card>
                <Card title="Estado vacío"><KitEmptyState icon="cart" title="No hay pedidos" body="Cuando se cree un pedido, el último aparecerá aquí." /></Card>
              </div>
              <Example name="Pasos de un asistente"><div className="w-full"><WizardSteps steps={['Datos del cliente', 'Mesa', 'Menú', 'Resumen']} current={1} /></div></Example>
              <Example name="Modales" code={'<Modal open title="Detalle" size="wide" onClose={…}>'}><Button onClick={() => setModal('center')}>Centrado</Button><Button onClick={() => setModal('wide')}>Ancho</Button><Button onClick={() => setModal('full')}>Completo</Button></Example>
            </DocSection>

            <DocSection id="esqueletos" title="Esqueletos de carga" intro="Mientras llegan los datos, la vista muestra la forma de lo que va a llegar. Nunca una pantalla en blanco, ni un «Cargando…» suelto, ni un «no hay nada» que todavía no es verdad: el vacío se muestra solo cuando la carga terminó y de verdad no hay nada."
              extend={<>los bloques están en <code className="font-mono">components/kit/Skeleton.tsx</code>. Para una vista nueva, compón su esqueleto con <code className="font-mono">Skeleton</code> dentro de un <code className="font-mono">LoadingRegion</code> (que lo anuncia una sola vez a los lectores de pantalla), con las mismas medidas que el contenido real para que nada salte al llegar. El brillo sale de <code className="font-mono">--skeleton-glow</code> y se detiene con «reducir movimiento».</>}>
              <div className="grid gap-6 md:grid-cols-2">
                <Example name="Bloque y texto" code={'<Skeleton className="h-4 w-32" />  ·  <SkeletonText lines={3} />'}><div className="w-full flex flex-col gap-4"><Skeleton className="h-10 w-10 rounded-md" /><SkeletonText lines={3} /></div></Example>
                <Example name="Indicador" code={'<KpiTile loading label="Ventas del mes" … />'}><div className="w-full"><DashboardKpiTile loading label="Ventas del mes" value="" icon="wallet" /></div></Example>
              </div>
              <Example name="Lista" code={'<ListSkeleton rows={3} />'}><div className="w-full"><ListSkeleton rows={3} /></div></Example>
              <Example name="Tarjetas" code={'<CardGridSkeleton count={3} />'}><div className="w-full"><CardGridSkeleton count={3} /></div></Example>
            </DocSection>

            <DocSection id="iconos" title="Iconos" intro={`${KIT_ICON_NAMES.length} iconos de trazo, todos del mismo juego. Se piden por nombre y heredan el color del texto.`}
              extend={<>añade el trazo al mapa <code className="font-mono">ICONS</code> de <code className="font-mono">components/kit/Icon.tsx</code>: el nombre queda tipado y aparece en esta cuadrícula.</>}>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
                {KIT_ICON_NAMES.map((name) => <div key={name} className="rounded-md border border-border bg-surface px-2 py-3 flex flex-col items-center gap-2"><Icon name={name} size={22} /><span className="font-mono text-[11px] text-soft break-all text-center">{name}</span></div>)}
              </div>
            </DocSection>

            <DocSection id="aurora" title="Patrón Aurora" intro="Cinco manchas de color a la deriva: intensas sobre azul noche en el acceso, amplias y suaves detrás de todas las vistas del POS. El fondo se difumina; el texto, las cifras y los controles permanecen nítidos."
              extend={<>la paleta sale de <code className="font-mono">AURORA.blobs</code>. El acceso usa <code className="font-mono">&lt;Aurora&gt;</code>; el POS monta una sola <code className="font-mono">&lt;AuroraBackground /&gt;</code> dentro de <code className="font-mono">.pos-ambient</code>. Las vistas con KitShell ya la heredan. Ajusta intensidad y blur en <code className="font-mono">globals.css</code>; usa <code className="font-mono">.ambient-panel</code> en paneles grandes, sin añadir blur a cada tarjeta.</>}>
              <Aurora className="h-[280px] rounded-lg"><div className="h-full p-8 flex flex-col justify-between"><BrandMark size="lg" tone="inverse" /><p className="max-w-[360px] text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]">Opera más mesas con menos carga.</p></div></Aurora>
              <div className="pos-ambient overflow-hidden rounded-lg border border-border p-6 sm:p-8">
                <AuroraBackground />
                <p className="text-[13px] font-semibold text-soft">Aurora ambiental · POS</p>
                <div className="mt-3 mb-8 flex flex-wrap justify-between gap-4">
                  <p className="text-[24px] font-semibold text-ink">Todo listo para un buen servicio.</p>
                  <p className="text-[24px] font-semibold tabular text-ink">09:41</p>
                </div>
                <div className="ambient-panel rounded-lg border border-border p-5 flex flex-wrap items-center justify-between gap-4">
                  <div><p className="text-[15px] text-soft">Pedidos en curso</p><p className="mt-2 text-[28px] font-semibold tabular text-ink">12</p></div>
                  <StatusPill tone="success">Listo para servir</StatusPill>
                </div>
              </div>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                {AURORA.blobs.map((blob) => <div key={blob.key} className="rounded-lg border border-border bg-surface overflow-hidden"><span className="block h-12" style={{ background: blob.core }} aria-hidden /><div className="px-3 py-2.5"><p className="text-[14px] font-semibold">{blob.key}</p><p className="font-mono text-[12px] text-soft">{blob.core} · {blob.seconds} s</p><p className="mt-1 text-[12px] text-soft">{blob.from}</p></div></div>)}
              </div>
              <ul className="max-w-[68ch] list-disc pl-5 text-[15px] leading-relaxed text-soft">
                <li>El difuminado se aplica una sola vez, sobre el campo que contiene las manchas. Cada mancha anima solo <code className="font-mono">transform</code>, para que una tablet modesta no pierda cuadros.</li>
                <li>En el acceso las manchas se mezclan en modo <code className="font-mono">screen</code>. En el POS su intensidad se reduce según el tema, conservando una zona de lectura tranquila.</li>
                <li>Cada mancha tiene una duración distinta y prima, entre 22 y 36 segundos, así el dibujo no se repite a la vista.</li>
                <li>El acceso usa texto blanco. La variante ambiental usa <code className="font-mono">text-ink</code> y <code className="font-mono">text-soft</code>, con superficies casi opacas para tablas y controles. El reloj se integra directamente en el fondo.</li>
              </ul>
            </DocSection>

            <DocSection id="movimiento" title="Movimiento" intro="El movimiento responde a una acción o acompaña una espera; no decora. Las transiciones de la interfaz duran entre 150 y 250 ms. El único movimiento continuo es la Aurora."
              extend={<>toda animación nueva debe apagarse dentro de <code className="font-mono">@media (prefers-reduced-motion: reduce)</code>, como hace <code className="font-mono">.login-blob</code>.</>}>
              <ul className="max-w-[68ch] list-disc pl-5 text-[15px] leading-relaxed text-soft">
                <li>Abrir y cerrar (modal, panel, aviso): aparece desde donde se tocó y se va por donde vino.</li>
                <li>Cambios de estado de una mesa o un plato: cambia el color, sin rebotes ni destellos. En un salón lleno, lo que parpadea cansa.</li>
                <li>Anima solo <code className="font-mono">transform</code> y <code className="font-mono">opacity</code>. Nada de animar ancho, alto o sombras.</li>
              </ul>
            </DocSection>
          </div>
        </div>
      </div>
      <Modal open={modal !== null} onClose={() => setModal(null)} title="Detalle" size={modal ?? 'center'}><div className="p-6">Contenido del modal {modal}</div></Modal>
    </>
  )
}
