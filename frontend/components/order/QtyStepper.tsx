'use client'

export function QtyStepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const cell = 'w-[52px] h-[52px] grid place-items-center text-[22px] text-soft'
  return (
    <div className="inline-flex items-center border border-border rounded-md overflow-hidden bg-surface">
      <button type="button" className={cell} onClick={() => onChange(qty - 1)}>−</button>
      <span className="w-[52px] text-center font-mono tabular text-[19px]">{qty}</span>
      <button type="button" className={`${cell} border-l border-muted`} onClick={() => onChange(qty + 1)}>＋</button>
    </div>
  )
}
