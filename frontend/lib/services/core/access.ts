import { coreFetch } from '@/lib/services/core/http'

// Inicio de sesión universal (experience/accounts/universal.py): una sola entrada para meseros, cajeros, encargados,
// dueños y la gente de ProjectApp. La credencial se busca en todas las organizaciones y en ProjectApp; por cada cuenta
// que coincide llega un destino con un pase de un solo uso (2 minutos) que se cambia por la sesión en el subdominio de
// la organización o en la consola.
export interface AccessDestination {
  kind: 'pos' | 'platform'
  organization?: { slug: string; name: string }
  role: string
  name: string
  pass?: string
  // ProjectApp con doble factor: primero el código, que se cambia por el pase.
  two_factor?: boolean
  challenge?: string
  // Lo que impide entrar (organización suspendida, fuera de turno) se dice aquí, sin cambiar de dirección.
  error?: { code: string; message: string; window?: string }
}

const access = <T>(path: string, body: unknown) => coreFetch<T>(path, { method: 'POST', body, scope: 'access' })
export const universalLogin = (login: string, password: string) => access<{ destinations: AccessDestination[] }>('login', { login, password }).then((r) => r.destinations)
export const universalVerify2fa = (challenge: string, code: string) => access<{ pass: string }>('2fa', { challenge, code }).then((r) => r.pass)
export const universalRequestCode = (login: string) => access<{ ok: true }>('request_code', { login: login.trim() })
export const universalActivate = (login: string, code: string, password: string) => access<{ ok: true }>('activate', { login: login.trim(), code, password })
