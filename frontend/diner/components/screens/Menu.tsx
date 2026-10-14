'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { GenericMenu } from '@/components/templates/generic/GenericMenu'
import { MENU_LAYOUTS } from '@/components/templates/registry'
import { pathFor } from '@/lib/domain/route'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

// Carta: el contenedor guarda la búsqueda y el filtro (son de Waiter) y delega el dibujo al layout de la plantilla (registro por código).
export function Menu({ entry, rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const router = useRouter()
  const store = useDinerStore()
  const template = store.template ?? DEFAULT_TEMPLATE
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const Layout = MENU_LAYOUTS[template.layouts?.menu ?? template.codigo] ?? GenericMenu
  return (
    <Layout
      entry={entry} template={template} query={query} setQuery={setQuery} category={category} setCategory={setCategory}
      onOpen={(d) => router.push(pathFor(rest, venue, token, 'plato', d.id))} onAdd={(d) => void store.add(d.id, 1, '')}
      cart={store.cart ?? null} orderBarHref={pathFor(rest, venue, token, 'pedido')}
    />
  )
}
