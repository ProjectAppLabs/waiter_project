// Reparto de meseros por zona: {zona: [empleados]}. Hay uno habitual guardado en el piso (se prepara con la caja
// cerrada) y, si hace falta, un ajuste que vale solo para el turno abierto. El turno sin ajuste hereda el habitual.
export type Assignments = Record<string, number[]>
export type StaffSource = 'plan' | 'shift'
export interface ZoneStaff { assignments: Assignments; source: StaffSource; plan: Assignments }

export const EMPTY_STAFF: ZoneStaff = { assignments: {}, source: 'plan', plan: {} }

export function toggleStaff(a: Assignments, zoneId: string, employeeId: number): Assignments {
  const current = a[zoneId] ?? []
  const next = current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]
  const rest = Object.fromEntries(Object.entries(a).filter(([zone]) => zone !== zoneId))
  return next.length ? { ...rest, [zoneId]: next } : rest
}

// Se comparan como conjuntos: el orden en que se tocó a los meseros no es un cambio.
export function sameStaff(a: Assignments, b: Assignments): boolean {
  const norm = (x: Assignments) => JSON.stringify(Object.entries(x).filter(([, ids]) => ids.length).map(([z, ids]) => [z, [...ids].sort((p, q) => p - q)]).sort(([p], [q]) => (p < q ? -1 : 1)))
  return norm(a) === norm(b)
}

export const zonesWithoutStaff = <Z extends { id: string }>(zones: Z[], a: Assignments): Z[] => zones.filter((z) => !(a[z.id] ?? []).length)

export const unassigned = <E extends { id: number }>(employees: E[], a: Assignments): E[] => {
  const busy = new Set(Object.values(a).flat())
  return employees.filter((e) => !busy.has(e.id))
}

// Nombres de pila por zona para rotular el plano («Terraza · Sofía, Carlos»). Un empleado que ya no está en la
// lista (inactivo) simplemente no aparece.
export function staffNames(zones: { id: string }[], a: Assignments, employees: { id: number; name: string }[]): Record<string, string[]> {
  const byId = new Map(employees.map((e) => [e.id, e.name.trim().split(/\s+/)[0]]))
  return Object.fromEntries(zones.map((z) => [z.id, (a[z.id] ?? []).flatMap((id) => byId.get(id) ?? [])]))
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
