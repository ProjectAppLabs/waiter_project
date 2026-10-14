// Anillo de progreso naranja del kit ("10 %" dentro de un arco): el arco avanza con el porcentaje de líneas servidas.
export function ProgressRing({ percent, size = 44 }: { percent: number; size?: number }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${clamped} %`}>
      <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-progress/25" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-progress" strokeDasharray={`${(clamped / 100) * c} ${c}`} />
      </svg>
      <span className="absolute text-[11px] font-semibold text-progress-ink tabular">{clamped}%</span>
    </span>
  )
}
