'use client'
import { onCore } from '@/lib/domain/backend'
import { getSettings, patchSettings } from '@/lib/services/core/sales'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { callKw } from '@/lib/services/odoo'
import { useAuthStore } from '@/lib/stores/authStore'
import type { Role } from '@/lib/domain/roles'

const roles: [Role, string][] = [['waiter', 'Mesero'], ['cashier', 'Cajero'], ['admin', 'Administrador']]
type Policy = { require_payment_roles: Role[] }
// `readOnly` (plan Q): el encargado ve la política de su restaurante; la decide el dueño desde su consola.
export function KitchenPaymentPolicyForm({ configId, readOnly = false }: { configId: number; readOnly?: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    setPolicy(null)
    ;(onCore() ? getSettings(configId).then((s) => ({ require_payment_roles: s.restaurant.kitchen_prepay_roles } as unknown as Policy)) : callKw<Policy>('pos.config', 'waiter_kitchen_policy', [[configId]]))
      .then((value: Policy) => { if (active) setPolicy(value) })
      .catch(() => { if (active) setError('No se pudo cargar la política de cocina.') })
    return () => { active = false }
  }, [configId])
  const save = async () => {
    if (!policy) return
    setBusy(true); setError(''); setNotice('')
    const employee = useAuthStore.getState().employee
    try {
      setPolicy(onCore() ? { ...policy, require_payment_roles: (await patchSettings(configId, { kitchen_prepay_roles: policy.require_payment_roles as string[] })).restaurant.kitchen_prepay_roles } as Policy : await callKw<Policy>('pos.config', 'waiter_kitchen_policy', [[configId], employee?.id, employee?.token, policy.require_payment_roles]))
      setNotice('Permisos guardados.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los permisos.') }
    finally { setBusy(false) }
  }
  return <section className="border border-border rounded-lg p-5 flex flex-col gap-4">
    <div><h3 className="font-semibold text-lg">Cobrar antes de enviar a cocina</h3><p className="text-sm text-soft mt-1">Activa los roles que deben cobrar primero. Los demás podrán enviar a cocina y cobrar después.</p></div>
    <p className="text-sm bg-canvas p-3 rounded-md">Comensal desde el menú: siempre debe pagar primero. Solo un empleado con permiso puede enviar su pedido sin cobrar.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {policy && <form onSubmit={e => { e.preventDefault(); void save() }} className="flex flex-col gap-4">
      <fieldset disabled={busy || readOnly} className="flex flex-col gap-3">
        {roles.map(([role, label]) => <label key={role} className="flex items-center gap-3"><input type="checkbox" checked={policy.require_payment_roles.includes(role)} onChange={e => { setNotice(''); setPolicy({ require_payment_roles: e.target.checked ? [...policy.require_payment_roles, role] : policy.require_payment_roles.filter(r => r !== role) }) }}/>{label}: cobrar antes de enviar</label>)}
      </fieldset>
      {readOnly ? <p className="text-sm text-soft">La decide el dueño en su consola (Pagos).</p> : <div><Button type="submit" disabled={busy}>Guardar permisos de cocina</Button></div>}
    </form>}
  </section>
}
