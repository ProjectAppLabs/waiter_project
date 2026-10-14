import type { ReactNode } from 'react'

import { AURORA } from '@/lib/design/tokens'
import { cn } from '@/lib/utils'

// Fondo azul noche con manchas de color a la deriva (patrón «Aurora», documentado en /kit). Solo CSS: el difuminado
// va una vez sobre el campo y cada mancha anima transform; se detiene con «reducir movimiento». El contenido que
// reciba queda por encima y debe ir en blanco. Las manchas salen de AURORA: agrega una ahí y su clase en globals.css.
export function Aurora({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('login-aurora relative overflow-hidden text-white', className)}>
      <div className="login-aurora-field" aria-hidden>
        {AURORA.blobs.map((blob) => <span key={blob.key} className={`login-blob login-blob-${blob.key}`} />)}
      </div>
      <div className="relative z-[1] h-full">{children}</div>
    </div>
  )
}

// Variante ambiental: se monta una vez en un contenedor .pos-ambient. Comparte la paleta y
// el movimiento del acceso; solo el fondo se difumina, nunca los textos ni los controles.
export function AuroraBackground() {
  return (
    <div className="pos-aurora-backdrop" aria-hidden="true">
      <div className="pos-aurora-field">
        {AURORA.blobs.map((blob) => <span key={blob.key} className={`login-blob login-blob-${blob.key}`} />)}
      </div>
    </div>
  )
}
