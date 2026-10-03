'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { administrationPath, homePath, withShell } from '@/lib/domain/navigation'
import { rolePolicy } from '@/lib/services/rolePermissions'
import { Button } from '@/components/ui/Button'
import { KitShell } from '@/components/kit/KitShell'
import { SessionGuard } from '@/components/account/SessionGuard'
import { AuroraBackground } from '@/components/kit/Aurora'
import { PageSkeleton, Skeleton } from '@/components/kit/Skeleton'
import { allowedPath, effectiveRole, type Role } from '@/lib/domain/roles'
import { EmergencyLock, OfflineBar } from '@/components/offline/OfflineBar'
import { emergencyPath, operatesInEmergency, useEmergency } from '@/lib/offline/emergency'
import { ModuleInactive } from '@/components/kit/ModuleInactive'
import { hasModule, moduleForPath } from '@/lib/domain/modules'
import { PrintHost } from '@/components/print/PrintHost'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, session, employee, hydrated, hydrate } = useAuthStore()
  const load = useCatalogStore((s) => s.load)
  const catalogStatus = useCatalogStore((s) => s.status)
  const policy = useCatalogStore((s) => s.catalog?.settings.rolePermissions)
  const configId = useCatalogStore((s) => s.catalog?.settings.configId)
  const catalogError = useCatalogStore((s) => s.error)
  const modules = useCatalogStore((s) => s.catalog?.settings.modules)
  // Plan V: en emergencia la caja abre las pantallas de tomar pedidos y cobrar aunque su política no se las dé.
  const emergency = useEmergency().active
  const allowed = (role: Role) => allowedPath(role, pathname, policy) || (emergency && operatesInEmergency(role) && emergencyPath(pathname))

  useEffect(() => { void hydrate() }, [hydrate])
  // PWA: registro del service worker (no hace nada más que permitir la instalación).
  // Plan U2: el service worker guarda la app para abrirla sin internet; solo en producción (en desarrollo estorbaría
  // la recarga en caliente).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'production') void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    // En desarrollo se quita el que haya quedado registrado: guardaría archivos que aquí cambian a cada edición.
    else void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister())).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    // Sin usuario: login. Con usuario pero sin caja abierta: abrir caja (no es un error, es el inicio del turno).
    if (!user) { router.replace('/login'); return }
    // Sin empleado activo (su turno se cerró en otra pestaña): a entrar de nuevo con su cuenta.
    if (!employee) { router.replace('/login'); return }
    if (!session && (effectiveRole(user.role, employee.role) !== 'admin' || !administrationPath(pathname))) { router.replace('/caja'); return }
    // Rol: una pantalla que no le toca lo devuelve al salón, sin pantalla de error.
    if (policy && !allowed(effectiveRole(user.role, employee.role))) { router.replace(homePath(effectiveRole(user.role, employee.role), !!session, policy)); return }
  }, [hydrated, user, employee, session, pathname, router, policy])

  const ready = hydrated && !!user && !!employee
  const sessionId = session?.id ?? null
  useEffect(() => { if (ready) void load(sessionId) }, [ready, sessionId, load])

  useEffect(() => {
    if (!ready || !configId) return
    let alive = true
    const refresh = () => { void rolePolicy(configId).then((rolePermissions) => {
      if (alive) useCatalogStore.setState((state) => state.catalog?.settings.configId === configId && JSON.stringify(state.catalog.settings.rolePermissions) !== JSON.stringify(rolePermissions) ? { catalog: { ...state.catalog, settings: { ...state.catalog.settings, rolePermissions } } } : {})
    }).catch(() => undefined) }
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [ready, configId])

  // Al abrir o recargar la app, hasta saber quién es se veía todo en blanco. Ahora, el armazón con su esqueleto.
  if (!hydrated) return <BootSkeleton />
  if (!hydrated || !user || !employee || (!session && (effectiveRole(user.role, employee.role) !== 'admin' || !administrationPath(pathname))) || !allowed(effectiveRole(user.role, employee.role))) return null
  // Sin catálogo no hay pantalla que pintar: se dice por qué en vez de dejar el POS en blanco.
  if (catalogStatus === 'error') {
    return (
      <main className="pos-ambient h-screen grid place-items-center p-8">
        <AuroraBackground />
        <div role="alert" className="max-w-lg text-center flex flex-col gap-3">
          <span className="text-[20px] font-semibold text-ink">No se pudo cargar la carta</span>
          <p className="text-[15px] text-soft">el servidor rechazó los datos de este terminal. Avisa a quien administra el punto de venta.</p>
          {catalogError && <p className="text-[13px] text-dim font-mono break-words">{catalogError}</p>}
          <Button variant="primary" className="self-center mt-2" onClick={() => { void load(session?.id ?? null) }}>Reintentar</Button>
        </div>
      </main>
    )
  }
  if (!policy) return <BootSkeleton />
  const shell = withShell(pathname)
  // Plan W: un módulo apagado para este local muestra la explicación en vez de la pantalla.
  const pageModule = moduleForPath(pathname)
  const content = pageModule && !hasModule(modules, pageModule) ? <ModuleInactive module={pageModule} /> : children
  return <>{shell ? <KitShell>{content}</KitShell> : content}<SessionGuard idle={shell} /><PrintHost /><OfflineBar /><EmergencyLock /></>
}

// El armazón de la app (barra y contenido) en esqueleto, mientras se recupera la sesión.
function BootSkeleton() {
  return (
    <div className="pos-ambient h-screen flex flex-col">
      <AuroraBackground />
      <div className="h-[92px] shrink-0 px-5 flex items-center gap-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-12 flex-1 max-w-[860px] rounded-lg" />
        <Skeleton className="h-12 w-12 rounded-md ml-auto" /><Skeleton className="h-12 w-60 rounded-md" />
      </div>
      <PageSkeleton />
    </div>
  )
}
