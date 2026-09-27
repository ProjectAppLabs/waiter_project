import { memo, type ReactNode } from 'react'

import { artSize, artTransform, type Decor, type DecorAsset } from '@/lib/domain/decor'

// Dibujos de las piezas, vistos desde arriba y planos, en la línea de un plano de arquitectura. Cada uno se dibuja con
// las medidas reales de la pieza (no se estira una imagen): una escalera más larga tiene más escalones, un mesón más
// ancho sigue viéndose de granito. Coordenadas locales: 0..w de ancho y 0..h de largo, antes de girar.
const INK = '#334155'
const STEEL = '#d5dbe3', STEEL_DARK = '#9aa5b4'
const GRANITE = '#9ca3ab', GRANITE_DOT = '#7c848d'
const WOOD = '#c9a47c', WOOD_DARK = '#a47b52'
const BLUE = '#7385d8'
const PORCELAIN = '#f8fafc', WATER = '#d6ebf7'
const LEAF = '#4f9d62', LEAF_DARK = '#2f7a45', POT = '#b8704f'
const line = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

// Puntos del granito en posiciones fijas (pseudoaleatorias pero estables): el mismo mesón se ve igual en cada render.
function speckles(w: number, h: number, density = 0.012) {
  const n = Math.min(160, Math.round(w * h * density / 10))
  return Array.from({ length: n }, (_, i) => {
    const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12543.1234
    return <circle key={i} cx={3 + (a - Math.floor(a)) * (w - 6)} cy={3 + (b - Math.floor(b)) * (h - 6)} r={0.9} fill={GRANITE_DOT} />
  })
}

function burner(cx: number, cy: number, r: number, key: string | number) {
  return <g key={key}><circle cx={cx} cy={cy} r={r} fill="#475569" /><circle cx={cx} cy={cy} r={r * 0.62} fill="none" stroke="#94a3b8" strokeWidth={1.2} /><circle cx={cx} cy={cy} r={r * 0.25} fill="#94a3b8" /></g>
}

function art(asset: DecorAsset, w: number, h: number): ReactNode {
  const m = Math.min(w, h)
  switch (asset) {
    case 'stove':
    case 'range': {
      // Quemadores en rejilla: 2 filas y tantas columnas como quepan (estufa 2, fogón industrial 3 o más).
      const knobs = Math.max(6, h * 0.14), top = h - knobs - 4
      const cols = Math.max(1, Math.round(w / (top * 0.9))), rows = top > 40 ? 2 : 1
      const r = Math.min(w / cols, top / rows) * 0.32
      return <>
        <rect x={0} y={0} width={w} height={h} rx={4} fill={STEEL} {...line} />
        <rect x={4} y={4} width={w - 8} height={top - 4} rx={2} fill="#1f2937" />
        {Array.from({ length: cols * rows }, (_, i) => burner(4 + (w - 8) / cols * ((i % cols) + 0.5), 4 + (top - 4) / rows * (Math.floor(i / cols) + 0.5), r, i))}
        {Array.from({ length: cols * rows }, (_, i) => <circle key={`k${i}`} cx={(w / (cols * rows + 1)) * (i + 1)} cy={top + knobs / 2 + 2} r={Math.min(3.5, knobs / 3)} fill={INK} />)}
      </>
    }
    case 'fridge': {
      const s = m * 0.18, cx = w / 2, cy = h * 0.42
      return <>
        <rect x={0} y={0} width={w} height={h} rx={4} fill="#eef2f6" {...line} />
        <line x1={w * 0.55} y1={3} x2={w * 0.55} y2={h - 3} stroke={STEEL_DARK} strokeWidth={1.5} />
        <rect x={w * 0.55 - 5} y={h * 0.72} width={3} height={h * 0.18} rx={1.5} fill={INK} /><rect x={w * 0.55 + 2} y={h * 0.72} width={3} height={h * 0.18} rx={1.5} fill={INK} />
        {[0, 60, 120].map((a) => { const rad = a * Math.PI / 180; return <line key={a} x1={cx - Math.cos(rad) * s} y1={cy - Math.sin(rad) * s} x2={cx + Math.cos(rad) * s} y2={cy + Math.sin(rad) * s} stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" /> })}
      </>
    }
    case 'sink': {
      const pad = 6, basinW = (w - pad * 3) / 2, basinH = h - pad * 2 - 8
      return <>
        <rect x={0} y={0} width={w} height={h} rx={4} fill={STEEL} {...line} />
        {[0, 1].map((i) => <g key={i}>
          <rect x={pad + i * (basinW + pad)} y={pad + 8} width={basinW} height={basinH} rx={6} fill="#b7c2cf" stroke={STEEL_DARK} strokeWidth={1.5} />
          <circle cx={pad + i * (basinW + pad) + basinW / 2} cy={pad + 8 + basinH / 2} r={Math.min(5, m * 0.08)} fill="#64748b" />
        </g>)}
        <rect x={w / 2 - 3} y={3} width={6} height={10} rx={2} fill="#64748b" />
      </>
    }
    case 'counter':
      return <><rect x={0} y={0} width={w} height={h} rx={3} fill={GRANITE} {...line} />{speckles(w, h)}</>
    case 'island':
      return <>
        <rect x={0} y={0} width={w} height={h} rx={4} fill={STEEL_DARK} {...line} />
        <rect x={5} y={5} width={w - 10} height={h - 10} rx={3} fill={GRANITE} />
        <g transform="translate(5 5)">{speckles(w - 10, h - 10)}</g>
      </>
    case 'bar': {
      // Barra de madera con el borde del lado del cliente más oscuro y algunos vasos.
      const glasses = Math.max(1, Math.floor(w / 70))
      return <>
        <rect x={0} y={0} width={w} height={h} rx={6} fill={WOOD} {...line} />
        <rect x={0} y={h - Math.max(6, h * 0.18)} width={w} height={Math.max(6, h * 0.18)} rx={4} fill={WOOD_DARK} />
        {Array.from({ length: glasses }, (_, i) => <circle key={i} cx={(w / glasses) * (i + 0.5)} cy={h * 0.38} r={Math.min(6, h * 0.12)} fill={WATER} stroke="#7aa6c2" strokeWidth={1.2} />)}
      </>
    }
    case 'stool':
      return <><circle cx={w / 2} cy={h / 2} r={m / 2 - 1} fill={BLUE} {...line} /><circle cx={w / 2} cy={h / 2} r={m * 0.28} fill="#8f9de3" /></>
    case 'register': {
      // Escritorio de caja con portátil y la silla del cajero, como en el plano de ejemplo de Odoo.
      const desk = h * 0.55
      return <>
        <rect x={0} y={0} width={w} height={desk} rx={6} fill={WOOD} {...line} />
        <rect x={w * 0.25} y={desk * 0.18} width={w * 0.5} height={desk * 0.34} rx={2} fill="#e2e8f0" stroke={INK} strokeWidth={1.2} />
        <rect x={w * 0.25} y={desk * 0.56} width={w * 0.5} height={desk * 0.22} rx={2} fill="#94a3b8" />
        <rect x={w * 0.3} y={desk + 6} width={w * 0.4} height={h - desk - 8} rx={6} fill="#f7a987" {...line} />
      </>
    }
    case 'sofa': {
      const back = Math.max(8, h * 0.28), arm = Math.max(8, Math.min(w * 0.12, 22)), seats = Math.max(1, Math.round((w - arm * 2) / 70))
      const seatW = (w - arm * 2) / seats
      return <>
        <rect x={0} y={0} width={w} height={h} rx={10} fill="#5566c2" {...line} />
        <rect x={arm} y={back} width={w - arm * 2} height={h - back - 4} rx={6} fill={BLUE} />
        {Array.from({ length: seats - 1 }, (_, i) => <line key={i} x1={arm + seatW * (i + 1)} y1={back + 4} x2={arm + seatW * (i + 1)} y2={h - 8} stroke="#5566c2" strokeWidth={1.5} />)}
      </>
    }
    case 'plant': {
      const cx = w / 2, cy = h / 2, r = m / 2
      return <>
        <circle cx={cx} cy={cy} r={r * 0.62} fill={POT} {...line} />
        {Array.from({ length: 8 }, (_, i) => <ellipse key={i} cx={cx} cy={cy - r * 0.45} rx={r * 0.2} ry={r * 0.48} fill={i % 2 ? LEAF : LEAF_DARK} transform={`rotate(${i * 45} ${cx} ${cy})`} />)}
        <circle cx={cx} cy={cy} r={r * 0.18} fill={LEAF_DARK} />
      </>
    }
    case 'toilet': {
      const tank = h * 0.28
      return <>
        {/* La taza nace pegada al tanque (lo monta 4 px) y el tanque se dibuja encima para que la unión quede limpia. */}
        <ellipse cx={w / 2} cy={tank + (h - tank) / 2 - 2} rx={w * 0.36} ry={(h - tank) / 2 + 1} fill={PORCELAIN} {...line} />
        <ellipse cx={w / 2} cy={tank + (h - tank) / 2} rx={w * 0.22} ry={(h - tank) / 2 - 7} fill={WATER} />
        <rect x={w * 0.08} y={0} width={w * 0.84} height={tank} rx={4} fill={PORCELAIN} {...line} />
      </>
    }
    case 'washbasin':
      return <>
        <rect x={0} y={0} width={w} height={h} rx={8} fill={PORCELAIN} {...line} />
        <ellipse cx={w / 2} cy={h * 0.58} rx={w * 0.34} ry={h * 0.3} fill={WATER} stroke={STEEL_DARK} strokeWidth={1.2} />
        <rect x={w / 2 - 3} y={4} width={6} height={h * 0.2} rx={2} fill="#64748b" />
      </>
    case 'door': {
      // Hoja abierta 90° con el arco de barrido: la bisagra abajo a la izquierda. Gira la pieza para cambiar el lado.
      const r = m - 2
      return <>
        <rect x={0} y={h - 4} width={w} height={4} fill={INK} opacity={0.25} />
        <path d={`M 2 ${h - 2 - r} A ${r} ${r} 0 0 1 ${2 + r} ${h - 2}`} fill="none" stroke={INK} strokeWidth={1.2} strokeDasharray="5 4" />
        <rect x={0} y={h - 2 - r} width={5} height={r} fill={WOOD_DARK} stroke={INK} strokeWidth={1.2} />
      </>
    }
    case 'window':
      return <>
        <rect x={0} y={0} width={w} height={h} fill={WATER} {...line} />
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#7aa6c2" strokeWidth={1.5} />
        {Array.from({ length: Math.max(0, Math.floor(w / 60) - 1) }, (_, i) => <line key={i} x1={(w / Math.floor(w / 60)) * (i + 1)} y1={0} x2={(w / Math.floor(w / 60)) * (i + 1)} y2={h} stroke={INK} strokeWidth={1.5} />)}
      </>
    case 'stairs': {
      // Escalones de ~20 px a lo largo del lado mayor; la flecha sube hacia el extremo de arriba (gira la pieza para cambiarlo).
      const steps = Math.max(3, Math.round(h / 20)), step = h / steps
      const ax = w / 2, head = Math.min(12, w * 0.18)
      return <>
        <rect x={0} y={0} width={w} height={h} fill="#e7e1d7" {...line} />
        {Array.from({ length: steps - 1 }, (_, i) => <line key={i} x1={0} y1={step * (i + 1)} x2={w} y2={step * (i + 1)} stroke={INK} strokeWidth={1.2} />)}
        <line x1={ax} y1={h - step / 2} x2={ax} y2={step * 0.8} stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M ${ax - head} ${step * 0.8 + head} L ${ax} ${step * 0.8} L ${ax + head} ${step * 0.8 + head}`} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={ax} cy={h - step / 2} r={3.5} fill="#2563eb" />
      </>
    }
    case 'spiral': {
      const cx = w / 2, cy = h / 2, r = m / 2 - 1, steps = 12
      return <>
        <circle cx={cx} cy={cy} r={r} fill="#e7e1d7" {...line} />
        {Array.from({ length: steps }, (_, i) => { const a = (i / steps) * Math.PI * 2; return <line key={i} x1={cx + Math.cos(a) * r * 0.18} y1={cy + Math.sin(a) * r * 0.18} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke={INK} strokeWidth={1.1} /> })}
        <circle cx={cx} cy={cy} r={r * 0.18} fill={INK} />
        <path d={`M ${cx + r * 0.62} ${cy} A ${r * 0.62} ${r * 0.62} 0 1 1 ${cx} ${cy - r * 0.62}`} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M ${cx - 7} ${cy - r * 0.62 - 6} L ${cx} ${cy - r * 0.62} L ${cx - 7} ${cy - r * 0.62 + 6}`} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </>
    }
    case 'column':
      return <>
        <rect x={0} y={0} width={w} height={h} fill="#64748b" {...line} />
        <path d={`M 0 0 L ${w} ${h} M ${w} 0 L 0 ${h}`} stroke="#94a3b8" strokeWidth={1.2} />
      </>
  }
}

// La pieza dentro de su caja (0..width, 0..height), ya girada. Para el editor va dentro de un <g> trasladado; para el
// salón, dentro de un <svg> del tamaño de la caja.
export const DecorArt = memo(function DecorArt({ item }: { item: Pick<Decor, 'asset' | 'width' | 'height' | 'rotation'> }) {
  const { width, height } = artSize(item)
  return <g transform={artTransform(item)}>{art(item.asset, width, height)}</g>
})

// Miniatura para la galería: la pieza con sus medidas por defecto, encajada en un cuadro.
export function DecorGlyph({ asset, width, height, size = 56 }: { asset: DecorAsset; width: number; height: number; size?: number }) {
  const scale = (size - 8) / Math.max(width, height)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <g transform={`translate(${(size - width * scale) / 2} ${(size - height * scale) / 2}) scale(${scale})`}><DecorArt item={{ asset, width, height, rotation: 0 }} /></g>
    </svg>
  )
}
