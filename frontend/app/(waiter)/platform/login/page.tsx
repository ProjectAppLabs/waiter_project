'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// La gente de ProjectApp entra por el inicio único (/login). Esta dirección queda para los enlaces viejos (los de
// /plataforma/login llegan acá por la redirección de proxy.ts) y conserva el código de invitación (?codigo=…).
export default function PlatformLoginRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace(`/login${window.location.search}`) }, [router])
  return null
}
