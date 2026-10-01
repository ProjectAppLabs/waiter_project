import type { AccountRole } from '@/lib/domain/roles'

// Plan R: el equipo agrupado para que con muchas personas no sea una lista interminable. Nadie sale dos veces:
// - «Toda la organización»: los dueños;
// - «Varios restaurantes»: quien lleva más de uno (encargados);
// - un grupo por restaurante con quien trabaja solo en ese;
// - «Sin restaurante»: lo que falta asignar.
export interface GroupablePerson { id: number; name: string; role: AccountRole | null; configIds: number[] }
export interface PeopleGroup<T> { key: string; title: string; people: T[] }

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, cashier: 2, waiter: 3 }

export function groupPeople<T extends GroupablePerson>(people: T[], restaurants: { id: number; name: string }[]): PeopleGroup<T>[] {
  const byRole = (a: T, b: T) => (ROLE_ORDER[a.role ?? ''] ?? 9) - (ROLE_ORDER[b.role ?? ''] ?? 9) || a.name.localeCompare(b.name, 'es')
  const groups: PeopleGroup<T>[] = [
    { key: 'org', title: 'Toda la organización', people: people.filter((p) => p.role === 'owner') },
    { key: 'many', title: 'Varios restaurantes', people: people.filter((p) => p.role !== 'owner' && p.configIds.length > 1) },
    ...restaurants.map((r) => ({ key: `r${r.id}`, title: r.name, people: people.filter((p) => p.role !== 'owner' && p.configIds.length === 1 && p.configIds[0] === r.id) })),
    { key: 'none', title: 'Sin restaurante', people: people.filter((p) => p.role !== 'owner' && (p.configIds.length === 0 || (p.configIds.length === 1 && !restaurants.some((r) => r.id === p.configIds[0])))) },
  ]
  return groups.filter((g) => g.people.length).map((g) => ({ ...g, people: [...g.people].sort(byRole) }))
}

// A partir de cuántas personas los grupos empiezan cerrados (solo con su conteo).
export const COLLAPSE_FROM = 25
