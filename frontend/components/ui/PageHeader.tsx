import type { ReactNode } from 'react'

// El título identifica la vista. Los controles conservan sus propias superficies y estados.
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="shrink-0 text-[28px] leading-tight font-semibold tracking-title text-ink">{children}</h1>
}

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="shrink-0 min-h-[88px] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <PageTitle>{title}</PageTitle>
      {children && <div className="flex items-center gap-2 min-w-0">{children}</div>}
      {actions && <div className="ml-auto flex items-center gap-3 shrink-0">{actions}</div>}
    </header>
  )
}
