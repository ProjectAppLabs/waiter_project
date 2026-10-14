import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Piezas de la vista /kit. Una sección = un tema del sistema; `extend` dice, en una línea, dónde se toca para ampliarlo.
export function DocSection({ id, title, intro, extend, children }: { id: string; title: string; intro: string; extend: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 pb-12 mb-12 border-b border-border last:border-0">
      <h2 id={`${id}-title`} tabIndex={-1} className="outline-none text-[24px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-soft">{intro}</p>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
      <p className="mt-6 max-w-[68ch] rounded-md bg-primary-soft px-4 py-3 text-[14px] leading-relaxed text-ink"><strong className="font-semibold">Para extender: </strong>{extend}</p>
    </section>
  )
}

// Un ejemplo vivo con su nombre y, debajo, cómo se escribe.
export function Example({ name, code, children, className }: { name: string; code?: string; children: ReactNode; className?: string }) {
  return (
    <figure className="rounded-lg border border-border bg-surface overflow-hidden">
      <figcaption className="px-4 h-11 flex items-center border-b border-border text-[14px] font-semibold text-ink">{name}</figcaption>
      <div className={cn('p-5 flex flex-wrap items-center gap-3', className)}>{children}</div>
      {code && <pre className="px-4 py-3 border-t border-border bg-muted text-[13px] leading-relaxed font-mono text-soft overflow-x-auto">{code}</pre>}
    </figure>
  )
}

export function Swatch({ name, cssName, light, dark }: { name: string; cssName: string; light: string; dark: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="grid grid-cols-2 h-16" aria-hidden>
        <span style={{ background: light }} />
        <span style={{ background: dark }} />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[14px] font-semibold text-ink">{name}</p>
        <p className="font-mono text-[12px] text-soft">{cssName}</p>
        <p className="mt-1 font-mono text-[12px] text-soft">{light} · {dark}</p>
      </div>
    </div>
  )
}
