'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { AuroraBackground } from '@/components/kit/Aurora'
import { BrandMark } from '@/components/kit/BrandMark'
import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { usePlatformStore } from '@/lib/stores/platformStore'
import { cn } from '@/lib/utils'

// Plan T0: la consola de ProjectApp. Aquí se dan de alta los dueños que pagan por Waiter, se lleva su plan y su estado y
// se suspende a quien no paga. Solo entra la gente de ProjectApp (`PlatformUser`), con su propia sesión. Mismo sistema de
// diseño que la consola del dueño: aurora al fondo y un panel translúcido con el menú y el contenido.
const SECTIONS: [string, string, KitIcon][] = [['/plataforma', 'Clientes', 'store'], ['/plataforma/metricas', 'Métricas', 'chartLine'], ['/plataforma/cobros', 'Cobros', 'coins'], ['/plataforma/equipo', 'Equipo de ProjectApp', 'users']]

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, hydrated, hydrate, logout } = usePlatformStore()
  const onLogin = pathname.startsWith('/plataforma/login')
  // La página de inicio hidrata por su cuenta: el armazón no repite la pregunta al servidor.
  useEffect(() => { if (!onLogin) void hydrate() }, [hydrate, onLogin])
  useEffect(() => { if (hydrated && !user && !onLogin) router.replace('/plataforma/login') }, [hydrated, user, onLogin, router])

  if (onLogin) return <>{children}</>
  if (!hydrated || !user) return null
  return (
    <main className="pos-ambient h-screen p-5 flex text-ink">
      <AuroraBackground />
      <div className="flex-1 min-w-0 min-h-0 ambient-panel border border-border rounded-lg flex overflow-hidden">
        <nav aria-label="Consola de ProjectApp" className="relative w-[260px] shrink-0 border-r border-border p-4 flex flex-col gap-1 overflow-y-auto">
          <BrandMark href="/plataforma" className="px-3 pt-1 pb-5" />
          <div className="px-3 pb-4 border-t border-border pt-4">
            <span className="text-[12px] font-bold uppercase tracking-widest text-primary">ProjectApp</span>
            <p className="mt-1 text-[18px] font-semibold truncate">Plataforma</p>
          </div>
          {SECTIONS.map(([href, label, icon]) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
              className={cn('flex items-center gap-3 h-11 px-3 rounded-md text-[15px] font-semibold', pathname === href ? 'bg-canvas border border-border text-ink' : 'text-soft hover:bg-muted')}>
              <Icon name={icon} size={20} /><span>{label}</span>
            </Link>
          ))}
          <div className="mt-auto flex flex-col gap-2 px-3 pt-4 text-[14px] text-soft">
            <span className="truncate">{user.name} · {user.role === 'admin' ? 'Administra' : 'Opera'}</span>
            <Button size="compact" onClick={() => { void logout().then(() => router.replace('/plataforma/login')) }}>Cerrar sesión</Button>
          </div>
        </nav>
        <div className="relative flex-1 min-w-0 m-4 rounded-lg border border-border overflow-y-auto px-7 pt-7">{children}<div aria-hidden className="h-7" /></div>
      </div>
    </main>
  )
}
