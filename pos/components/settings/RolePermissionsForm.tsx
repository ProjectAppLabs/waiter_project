'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DEFAULT_ROLE_POLICY, ROLE_ACTIONS, ROLE_VIEWS, type RolePolicy } from '@/lib/domain/permissions'

// Plan Q: Clientes y Facturación ya no son pantallas del POS (son de la consola del dueño): no se ofrecen por rol.
const POS_VIEWS = ROLE_VIEWS.filter((view) => view !== 'customers' && view !== 'billing')
import { rolePolicy } from '@/lib/services/rolePermissions'
import { useCatalogStore } from '@/lib/stores/catalogStore'

const LABELS: Record<string, string> = {
  dashboard: 'Inicio', tables: 'Mesas', orders: 'Pedidos / caja', reservations: 'Reservas', history: 'Historial', inventory: 'Inventario', kitchen: 'Cocina', sales: 'Ventas', customers: 'Clientes', billing: 'Contabilidad y facturación',
  create_orders: 'Crear pedidos y agregar rondas', charge_orders: 'Cobrar pedidos', serve_orders: 'Registrar entregas y atender llamadas', edit_inventory: 'Modificar inventario',
}
const ROLES = [['waiter', 'Mesero'], ['cashier', 'Cajero']] as const
const peopleLabel = (n: number) => n === 1 ? '1 persona' : `${n} personas`

// `counts`: personas del equipo con cada rol (se ve bajo el nombre de la columna).
export function RolePermissionsForm({ configId, initial, counts }: { configId: number; initial?: RolePolicy; counts?: Partial<Record<string, number>> }) {
  const [policy, setPolicy] = useState<RolePolicy>(() => structuredClone(initial ?? DEFAULT_ROLE_POLICY))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  async function save() {
    setBusy(true); setError(''); setSaved(false)
    try {
      const rolePermissions = await rolePolicy(configId, policy)
      setPolicy(rolePermissions)
      useCatalogStore.setState((state) => state.catalog ? { catalog: { ...state.catalog, settings: { ...state.catalog.settings, rolePermissions,
        waiterCanCharge: rolePermissions.waiter.actions.includes('charge_orders'), waiterCanEditInventory: rolePermissions.waiter.actions.includes('edit_inventory') } } } : {})
      setSaved(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los permisos.') } finally { setBusy(false) }
  }
  return <section className="space-y-4">
    <div><h3 className="text-lg font-semibold">Qué puede hacer cada rol</h3><p className="mt-1 text-sm text-soft">Elige las vistas y acciones de cada rol. El administrador conserva acceso completo. Los cambios se aplican a todos los empleados de ese rol en este punto de venta.</p></div>
    {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    {saved && <p role="status" className="text-sm text-success-ink">Permisos guardados. Los demás terminales los recargan al recuperar el foco o en un minuto.</p>}
    <fieldset disabled={busy} className="rounded-lg border border-border overflow-hidden">
      <legend className="sr-only">Permisos por rol</legend>
      <div className="grid grid-cols-[1fr_110px_110px] gap-2 px-4 py-3 bg-muted text-sm font-semibold"><span>Permiso</span>{ROLES.map(([key, label]) => <span key={key} className="flex flex-col items-center text-center">{label}{counts && <small className="text-xs font-normal text-soft">{peopleLabel(counts[key] ?? 0)}</small>}</span>)}</div>
      {(['views', 'actions'] as const).map((kind) => <div key={kind}>
        <h4 className="px-4 py-2 border-t border-border bg-surface/40 text-xs font-semibold text-soft">{kind === 'views' ? 'Vistas disponibles' : 'Acciones permitidas'}</h4>
        {(kind === 'views' ? POS_VIEWS : ROLE_ACTIONS).map((permission) => <div key={permission} className="grid grid-cols-[1fr_110px_110px] items-center gap-2 px-4 py-2 border-t border-border text-sm">
          <span>{LABELS[permission]}</span>{ROLES.map(([role, label]) => <label key={role} className="min-h-11 flex items-center justify-center cursor-pointer"><span className="sr-only">{label}: {LABELS[permission]}</span>
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={(policy[role][kind] as readonly string[]).includes(permission)} onChange={(e) => {
              const checked = e.target.checked
              setSaved(false)
              setPolicy((previous) => ({ ...previous, [role]: { ...previous[role], [kind]: checked ? [...previous[role][kind], permission] : previous[role][kind].filter((entry) => entry !== permission) } }))
            }} />
          </label>)}
        </div>)}
      </div>)}
    </fieldset>
    <p className="text-xs text-soft">Crear y cobrar requieren acceso a Mesas o Pedidos. Las entregas y llamadas se atienden desde Mesas.</p>
    <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar permisos'}</Button>
  </section>
}
