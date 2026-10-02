import { currentOrg } from '@/lib/domain/tenant'

// Plan T: mientras dura la migración, cada organización vive en un solo sitio. Las que siguen en Odoo (Burger House, hasta
// el corte de T6) se listan en NEXT_PUBLIC_ODOO_ORGS; cualquier otra ya está en el sistema propio. Sin organización
// conocida (una tableta por la IP sin organización por omisión) se sigue en Odoo, como hasta ahora.
export type Backend = 'odoo' | 'core'

export function backendFor(org: string | null, odooOrgs = process.env.NEXT_PUBLIC_ODOO_ORGS ?? 'burger-house'): Backend {
  const legacy = odooOrgs.split(',').map((s) => s.trim()).filter(Boolean)
  // Tras el corte de T6 no queda ninguna organización en Odoo: sin organización conocida también es el sistema propio.
  if (!org) return legacy.length ? 'odoo' : 'core'
  return legacy.includes(org) ? 'odoo' : 'core'
}

export const currentBackend = (): Backend => backendFor(currentOrg())
export const onCore = (): boolean => currentBackend() === 'core'
