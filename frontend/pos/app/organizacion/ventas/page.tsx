'use client'
import { SalesView } from '@/components/business/SalesView'
import { RestaurantScope } from '@/components/organization/RestaurantScope'

// Plan Q: las ventas, la caja y los turnos de cada restaurante, con la misma vista que usa su encargado en el POS.
export default function OrganizationSales() { return <RestaurantScope label="Restaurante"><SalesView /></RestaurantScope> }
