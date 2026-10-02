'use client'
import { SummaryView } from '@/components/business/SummaryView'
import { RestaurantsView } from '@/components/organization/RestaurantsView'
import { onCore } from '@/lib/domain/backend'

// Plan Q2: la primera pantalla del dueño es cómo van sus restaurantes, lado a lado. Plan T: en el sistema propio el
// resumen llega con T4; hasta entonces se abre en Restaurantes.
export default function OrganizationHome() { return onCore() ? <RestaurantsView /> : <SummaryView /> }
