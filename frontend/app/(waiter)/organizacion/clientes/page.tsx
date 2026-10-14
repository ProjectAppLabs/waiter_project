'use client'
import { CustomersView } from '@/components/business/CustomersView'

// Plan Q: los clientes son de toda la organización (plan O): sus puntos valen en todos los restaurantes.
export default function OrganizationCustomers() { return <div className="-mx-5"><CustomersView /></div> }
