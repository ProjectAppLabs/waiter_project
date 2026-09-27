'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { SettingsModal } from '@/components/kit/SettingsModal'
import { AuroraBackground } from '@/components/kit/Aurora'
import { TopBar } from '@/components/kit/TopBar'
import { adminSubtabForPath, tabForPath } from '@/lib/domain/navigation'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { useNotificationAlerts } from '@/lib/hooks/useNotificationAlerts'
import { useAuthStore } from '@/lib/stores/authStore'
import { useBusStore } from '@/lib/stores/busStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Armazón del kit: barra superior por rol, contenido sobre el lienzo y el modal de ajustes.
// "Cerrar sesión" del modal termina el turno del empleado (pos_hr); la sesión de Odoo del terminal sigue abierta.
export function KitShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const session = useAuthStore((s) => s.session)
  const endShift = useAuthStore((s) => s.endShift)
  const policy = useCatalogStore((s) => s.catalog?.settings.rolePermissions)
  const restaurant = useCatalogStore((s) => s.catalog?.company.name ?? '')
  const [settings, setSettings] = useState(false)
  // Una sola conexión al bus por tablet: el servidor avisa de lo que cambia y el sondeo pasa a ser red
  // de seguridad. Sonido y aviso en pantalla de cada notificación nueva, esté donde esté el mesero.
  // Se suelta al desmontar, no se cierra: cada pantalla monta su propio armazón y la conexión sobrevive a
  // la navegación (ver busStore). Al salir de verdad, authStore la cierra.
  const startBus = useBusStore((s) => s.start)
  const releaseBus = useBusStore((s) => s.release)
  useEffect(() => { startBus(); return releaseBus }, [startBus, releaseBus])
  useNotificationAlerts()
  // Manda el empleado que marcó su PIN, no la credencial con la que se abrió la tablet.
  const { name: shownName, role } = useIdentity()
  return (
    <div className="pos-ambient h-screen flex flex-col text-ink">
      <AuroraBackground />
      <TopBar active={tabForPath(pathname)} role={role} policy={policy} administrationOnly={!session} userName={shownName} activeSubtab={adminSubtabForPath(pathname)} onOpenSettings={() => setSettings(true)} />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      <SettingsModal open={settings} onClose={() => setSettings(false)} user={{ name: shownName, role }} restaurant={restaurant}
        onLogout={async () => { await endShift(); router.replace('/login') }} />
    </div>
  )
}
