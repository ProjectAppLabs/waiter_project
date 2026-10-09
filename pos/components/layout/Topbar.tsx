import type { ReactNode } from 'react'

export function Topbar({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <header className="min-h-[76px] lg:h-[76px] shrink-0 px-7 py-3 lg:py-0 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 border-b border-border ambient-panel">
      <div className="flex flex-wrap items-center gap-3.5">{left}</div>
      <div className="flex flex-wrap items-center gap-2.5">{right}</div>
    </header>
  )
}
