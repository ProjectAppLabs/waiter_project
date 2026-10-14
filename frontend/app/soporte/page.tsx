'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { LoginFrame } from '@/components/account/LoginFrame'
import { Button } from '@/components/ui/Button'
import { CoreError } from '@/lib/services/core/http'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan Y4: ProjectApp llega aquí con un token de un solo uso (2 minutos) y lo cambia por una sesión de soporte con el
// permiso que dio el dueño. El token sale de la dirección enseguida para que no quede en el historial del navegador.
export default function SupportEntry() {
  const router = useRouter()
  const enter = useAuthStore((s) => s.enterSupport)
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    window.history.replaceState(null, '', '/soporte')
    // Sin token también pasa por la promesa: el aviso se pinta después de montar, igual en servidor y navegador.
    ;(token ? enter(token) : Promise.reject(new Error('El enlace de soporte no trae el token.'))).then(() => router.replace('/organizacion'))
      .catch((e: unknown) => setError(e instanceof CoreError ? (e.code === 'unreachable' ? 'No se pudo abrir la sesión de soporte.' : e.message) : e instanceof Error ? e.message : 'No se pudo abrir la sesión de soporte.'))
  }, [enter, router])
  return (
    <LoginFrame>
      <div className="w-[440px] pt-10 flex flex-col gap-4 text-center">
        <h1 className="text-[24px] font-semibold text-ink">Sesión de soporte de ProjectApp</h1>
        {error ? <>
          <p role="alert" className="text-danger-ink">{error}</p>
          <p className="text-[15px] text-dim">El enlace sirve una sola vez y vence en 2 minutos. Pide otro desde la ficha del cliente; el acceso debe estar vigente.</p>
          <Button onClick={() => router.replace('/login')}>Ir al inicio</Button>
        </> : <p role="status" className="text-dim">Abriendo la sesión…</p>}
      </div>
    </LoginFrame>
  )
}
