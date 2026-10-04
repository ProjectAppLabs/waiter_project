'use client'

import { useRouter } from 'next/navigation'

import { useAuthStore } from '@/lib/stores/authStore'

const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

// Plan Y4: mientras la sesión sea de soporte de ProjectApp, una franja fija lo dice, con la hora en que vence y la salida.
export function SupportBanner() {
  const router = useRouter()
  const support = useAuthStore((s) => s.support)
  const logout = useAuthStore((s) => s.logout)
  if (!support) return null
  return (
    <div role="status" aria-label="Sesión de soporte" className="fixed top-0 inset-x-0 z-[60] h-8 flex items-center justify-center gap-3 bg-primary text-white text-[14px] font-semibold shadow">
      <span>Sesión de soporte de ProjectApp · {support.agent} · termina a las {hour(support.until)}</span>
      <button type="button" className="underline underline-offset-2" onClick={() => { void logout().then(() => router.replace('/login')) }}>Salir</button>
    </div>
  )
}
