import * as core from '@/lib/services/core/loyalty'

export interface Customer { id: number; name: string; phone: string; email: string; vat: string; idTypeId: number | null; street: string; city: string; orders: number; invoiced: number }
export interface CustomerInput { name: string; phone: string; email: string; vat: string; idTypeId: number | null; street: string; city: string }
export interface IdType { id: number; name: string }
export interface CustomerOrder { id: number; reference: string; date: string; total: number; state: string }

const ID_TYPES = ['CC', 'CE', 'NIT', 'PAS', 'TI', 'PEP'] as const
const fromCore = (c: core.CoreCustomer): Customer => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, vat: c.vat, idTypeId: ID_TYPES.indexOf(c.id_type as typeof ID_TYPES[number]) + 1 || null, street: c.street, city: c.city, orders: c.orders, invoiced: c.invoiced })

export async function listCustomers(query = ''): Promise<Customer[]> {
  return (await core.listCustomers(query)).map(fromCore)
}

export async function saveCustomer(id: number | null, c: CustomerInput): Promise<number> {
  const body = { name: c.name, phone: c.phone, email: c.email, vat: c.vat, id_type: c.idTypeId === null ? 'CC' : ID_TYPES[c.idTypeId - 1] ?? 'CC', street: c.street, city: c.city }
  return (id === null ? await core.createCustomer(body) : await core.updateCustomer(id, body)).id
}

export async function identificationTypes(): Promise<IdType[]> {
  return (await core.idTypes()).map((t) => ({ id: ID_TYPES.indexOf(t.id as typeof ID_TYPES[number]) + 1, name: t.name })).filter((t) => t.id > 0)
}

// Tarjeta de fidelización del cliente (módulos loyalty + pos_loyalty): la de más puntos si tiene varias; null sin tarjeta.
export interface LoyaltyCard { id: number; points: number; pointsDisplay: string; code: string; program: string; expires: string | null }

export async function loyaltyCard(partnerId: number): Promise<LoyaltyCard | null> {
  const c = await core.customerCard(partnerId)
  return c ? { id: c.id, points: c.points, pointsDisplay: String(c.points), code: c.code, program: c.program, expires: c.expires } : null
}

export async function customerOrders(partnerId: number): Promise<CustomerOrder[]> {
  return (await core.customerOrders(partnerId)).map((o) => ({ id: o.id, reference: o.number, date: o.paid_at, total: o.total, state: o.state }))
}
