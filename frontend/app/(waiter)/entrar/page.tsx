'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { LoginFrame } from '@/components/account/LoginFrame'
import { Button } from '@/components/ui/Button'
import { centralHost, here, leaveTo } from '@/lib/domain/tenant'
import { CoreError } from '@/lib/services/core/http'
import { ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'

// Inicio universal: la persona se identificó en el inicio común y llega aquí, a la dirección de su organización o a la
// consola, con un pase de un solo uso (2 minutos) en el fragmento: `/entrar#pase=…&destino=pos|plataforma`. El pase se
// cambia por la sesión de esta dirección y sale de la barra enseguida para que no quede en el historial.
export default function EnterWithPass() {
  const tl = useTranslations('pos.login')
  const router = useRouter()
  const enterPos = useAuthStore((s) => s.enterPass)
  const enterPlatform = usePlatformStore((s) => s.enterPass)
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const data = new URLSearchParams(window.location.hash.slice(1))
    const pass = data.get('pase') ?? ''
    const platform = data.get('destino') === 'plataforma'
    window.history.replaceState(null, '', '/entrar')
    // Sin pase también pasa por la promesa: el aviso se pinta después de montar, igual en servidor y navegador.
    ;(pass ? (platform ? enterPlatform(pass) : enterPos(pass)) : Promise.reject(new Error(tl('entering.failed'))))
      // `/login` ya sabe a dónde va cada quien: su pantalla de inicio, la consola del dueño o elegir restaurante.
      .then(() => router.replace(platform ? '/platform' : '/login'))
      .catch((e: unknown) => setError(e instanceof ShiftDeniedError ? e.message
        : e instanceof CoreError && e.code !== 'unreachable' ? e.message : tl('entering.failed')))
  }, [enterPos, enterPlatform, router, tl])
  const backToLogin = () => { const { protocol, host } = here(); leaveTo(`${protocol}//${centralHost(host)}/login`) }
  return (
    <LoginFrame>
      <div className="w-[440px] pt-10 flex flex-col gap-4 text-center">
        <h1 className="text-[24px] font-semibold text-ink">{tl('entering.title')}</h1>
        {error ? <>
          <p role="alert" className="text-danger-ink">{error}</p>
          <p className="text-[15px] text-dim">{tl('entering.hint')}</p>
          <Button onClick={backToLogin}>{tl('entering.back')}</Button>
        </> : <p role="status" className="text-dim">{tl('entering.opening')}</p>}
      </div>
    </LoginFrame>
  )
}
