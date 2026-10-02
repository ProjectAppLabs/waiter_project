import { onCore } from '@/lib/domain/backend'
import * as core from '@/lib/services/core/pos'
import { callKw, jsonRpc } from '@/lib/services/odoo'

import type { AccountRole } from '@/lib/domain/roles'

export interface AuthUser { uid: number; name: string; companyId: number; role: AccountRole }
export interface PosSession { id: number; configId: number; state: 'opened' | 'opening_control' }

interface RawSession { id: number; config_id: [number, string]; state: PosSession['state'] }
interface RawAuth { uid: number; name: string; user_companies: { current_company: number } }
interface RawInfo { uid: number | false; name?: string; user_companies?: { current_company: number } }

const DB = process.env.NEXT_PUBLIC_ODOO_DB ?? 'projectapp'
const OPEN_STATES = ['opened', 'opening_control']

export async function login(loginName: string, password: string): Promise<AuthUser> {
  const raw = await jsonRpc<RawAuth>('/web/session/authenticate', { db: DB, login: loginName, password })
  return { uid: raw.uid, name: raw.name, companyId: raw.user_companies.current_company, role: await roleOf(raw.uid) }
}

// Quién está logueado según la cookie (HttpOnly: solo Odoo lo sabe). null si no hay sesión.
export async function currentUser(): Promise<AuthUser | null> {
  const raw = await jsonRpc<RawInfo>('/web/session/get_session_info', {})
  if (!raw.uid) return null
  return { uid: raw.uid, name: raw.name ?? '', companyId: raw.user_companies?.current_company ?? 0, role: await roleOf(raw.uid) }
}

// El rol lo pone el addon projectapp_ops en res.users; un usuario siempre puede leer el suyo.
async function roleOf(uid: number): Promise<AccountRole> {
  const [row] = await callKw<{ waiter_role: AccountRole | false }[]>('res.users', 'read', [[uid], ['waiter_role']])
  return row.waiter_role || 'waiter'
}

export function logout(): Promise<void> {
  if (onCore()) return core.logout().then(() => undefined)
  return jsonRpc<void>('/web/session/destroy', {})
}

function toSession(raw: RawSession): PosSession {
  return { id: raw.id, configId: raw.config_id[0], state: raw.state }
}

// La caja abierta del restaurante de este dispositivo (plan O). Sin restaurante elegido se mira cualquiera, como antes.
export async function getOpenSession(configId: number | null = null): Promise<PosSession | null> {
  // Plan T: la caja del sistema propio llega con T2; hasta entonces no hay caja abierta.
  if (onCore()) return null
  const domain: unknown[] = [['state', 'in', OPEN_STATES]]
  if (configId !== null) domain.push(['config_id', '=', configId])
  const rows = await callKw<RawSession[]>('pos.session', 'search_read', [domain, ['id', 'config_id', 'state']], { limit: 1 })
  return rows.length ? toSession(rows[0]) : null
}

export async function ensureOpenSession(configId: number): Promise<PosSession> {
  const open = await getOpenSession(configId)
  if (open) return open
  const id = await callKw<number>('pos.session', 'create', [{ config_id: configId }])
  await callKw<void>('pos.session', 'action_pos_session_open', [[id]])
  return { id, configId, state: 'opening_control' }
}

// Plan P: cada persona cambia su propia contraseña; Odoo comprueba la actual antes de guardar la nueva.
export function changePassword(current: string, next: string): Promise<boolean> {
  if (onCore()) return core.changePassword(current, next).then(() => true)
  return callKw<boolean>('res.users', 'change_password', [current, next])
}
