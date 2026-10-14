import type { ReactNode } from 'react'

// Estado vacío honesto: dice qué falta y qué lo llenaría. Nunca un espacio en blanco.
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex-1 grid place-items-center p-10">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className="text-xl font-bold">{title}</span>
        {body && <p className="text-base text-soft leading-relaxed">{body}</p>}
        {action}
      </div>
    </div>
  )
}
