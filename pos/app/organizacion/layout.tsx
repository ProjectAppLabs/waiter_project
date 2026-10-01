'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { AuroraBackground } from '@/components/kit/Aurora'
import { BrandMark } from '@/components/kit/BrandMark'
import { Icon, type KitIcon } from '@/components/kit/Icon'
import { OrgContext } from '@/components/organization/OrgContext'
import { Button } from '@/components/ui/Button'
import { isOwner } from '@/lib/domain/roles'
import { listRestaurants, type Restaurant } from '@/lib/services/restaurants'
import { getCompany } from '@/lib/services/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { cn } from '@/lib/utils'

// Plan O: consola del dueño, fuera del POS. Todo lo de la organización (restaurantes, equipo, diseño del menú,
// promociones, integraciones y empresa) y la puerta a cada POS. Solo entra el dueño, con su propia cuenta.
const SECTIONS: [string, string, KitIcon][] = [
  ['/organizacion', 'Restaurantes', 'store'], ['/organizacion/catalogo', 'Catálogo', 'bag'], ['/organizacion/equipo', 'Equipo', 'users'], ['/organizacion/diseno', 'Diseño del menú', 'layout'],
  ['/organizacion/promociones', 'Promociones', 'percentage'], ['/organizacion/integraciones', 'Integraciones IA', 'sparkles'], ['/organizacion/empresa', 'Empresa e impuestos', 'lock'],
]

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, employee, hydrated, hydrate, logout } = useAuthStore()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [companyName, setCompanyName] = useState('')
  const owner = !!user && !!employee && isOwner(user.role, employee.role)
  const reload = useCallback(async () => { setRestaurants(await listRestaurants()) }, [])

  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => { if (hydrated && !owner) router.replace('/login') }, [hydrated, owner, router])
  useEffect(() => {
    if (!owner) return
    let alive = true
    listRestaurants().then((r) => { if (alive) setRestaurants(r) }).catch(() => { if (alive) setRestaurants([]) })
    getCompany().then((c) => { if (alive) setCompanyName(c.name) }).catch(() => undefined)
    return () => { alive = false }
  }, [owner])

  if (!hydrated || !owner) return null
  return (
    <OrgContext.Provider value={{ restaurants, reload, companyName }}>
      {/* El mismo sistema que el POS: una sola aurora difuminada al fondo (AuroraBackground, blur y opacidad en
          globals.css) y encima un panel translúcido (.ambient-panel) con el menú y el contenido, como Configuración. No
          se difumina cada tarjeta: el campo ya viene difuminado y así el fondo cuesta una sola capa. */}
      <main className="pos-ambient h-screen p-5 flex text-ink">
        <AuroraBackground />
        <div className="flex-1 min-w-0 min-h-0 ambient-panel border border-border rounded-lg flex overflow-hidden">
          <nav aria-label="Consola de la organización" className="relative w-[260px] shrink-0 border-r border-border p-4 flex flex-col gap-1 overflow-y-auto">
            {/* La marca del producto siempre presente, como en la barra del POS y en el inicio. */}
            <BrandMark href="/organizacion" className="px-3 pt-1 pb-5" />
            <div className="px-3 pb-4 border-t border-border pt-4">
              <span className="text-[12px] font-bold uppercase tracking-widest text-primary">Organización</span>
              <p className="mt-1 text-[18px] font-semibold truncate">{companyName || 'Tu organización'}</p>
            </div>
            {SECTIONS.map(([href, label, icon]) => (
              <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
                className={cn('flex items-center gap-3 h-12 px-3 rounded-md text-[15px] font-semibold', pathname === href ? 'bg-canvas border border-border text-ink' : 'text-soft hover:bg-muted')}>
                <Icon name={icon} size={20} /><span>{label}</span>
              </Link>
            ))}
            <div className="mt-auto flex flex-col gap-2 px-3 pt-4 text-[14px] text-soft">
              <span className="truncate">{employee?.name}</span>
              <Button size="compact" onClick={() => { void logout().then(() => router.replace('/login')) }}>Cerrar sesión</Button>
            </div>
          </nav>
          {/* relative: lo absoluto de adentro (textos sr-only) se recorta aquí y no estira la página. */}
          <div className="relative flex-1 min-w-0 m-4 rounded-lg border border-border overflow-y-auto p-7">{children}</div>
        </div>
      </main>
    </OrgContext.Provider>
  )
}
