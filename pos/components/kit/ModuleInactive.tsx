'use client'

import { Icon } from '@/components/kit/Icon'
import { MODULE_NAMES, type ModuleKey } from '@/lib/domain/modules'

// Plan W: en lugar de romper la página, se explica que la función no está en el plan y a quién pedirla.
export function ModuleInactive({ module }: { module: ModuleKey }) {
  return (
    <div role="alert" className="flex-1 grid place-items-center p-8">
      <div className="max-w-md flex flex-col items-center gap-3 text-center">
        <span className="w-14 h-14 rounded-full bg-muted text-soft grid place-items-center"><Icon name="lock" size={26} /></span>
        <h1 className="text-[22px] font-semibold text-ink">Esta función no está activa en tu plan</h1>
        <p className="text-[16px] text-soft">El módulo <strong className="text-ink">{MODULE_NAMES[module]}</strong> no está activo para este local. Si lo necesitas, escribe a ProjectApp para activarlo.</p>
      </div>
    </div>
  )
}
