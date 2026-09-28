'use client'
/* eslint-disable @next/next/no-img-element -- Logo del restaurante servido por experience. */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/smart/SmartMenu'
import { designSystemAttributes } from '@/lib/domain/designVariants'
import { applyGoogleFonts, templateVars } from '@/lib/domain/template'
import { themeVars } from '@/lib/domain/theme'
import { getEntry, getOrganization } from '@/lib/services/api'
import type { Entry, OrganizationEntry } from '@/lib/types'

// Plan O: portada de la organización (/<org>/). Con un solo restaurante lleva directo a su menú; con varios, se elige.
// El diseño del menú es de la organización, así que la portada toma el tema de su primer restaurante.
export default function OrganizationLanding() {
  const { rest } = useParams<{ rest: string }>()
  const router = useRouter()
  const [org, setOrg] = useState<OrganizationEntry | null>(null)
  const [entry, setEntry] = useState<Entry | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    getOrganization(rest).then((o) => {
      if (!alive) return
      if (o.restaurantes.length === 1) { router.replace(`/${encodeURIComponent(rest)}/${encodeURIComponent(o.restaurantes[0].slug)}/`); return }
      setOrg(o)
      if (o.restaurantes[0]) getEntry(rest, o.restaurantes[0].slug, null).then((e) => { if (alive) setEntry(e) }).catch(() => undefined)
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No encontramos este restaurante.') })
    return () => { alive = false }
  }, [rest, router])
  useEffect(() => { if (entry?.contexto.plantilla) applyGoogleFonts(entry.contexto.plantilla) }, [entry])
  if (error) return <main className="min-h-screen grid place-items-center p-6 text-center"><p role="alert">{error}</p></main>
  if (!org) return <main className="min-h-screen grid place-items-center p-6 text-center text-soft"><p role="status">Buscando los restaurantes…</p></main>
  const template = entry?.contexto.plantilla
  const style = (entry && template ? { ...themeVars(entry.contexto.marca), ...templateVars(template) } : {}) as React.CSSProperties
  const logo = entry?.contexto.marca.logo
  return (
    <main {...(template ? designSystemAttributes(template.tema) : {})} style={style} className="min-h-screen bg-t-fondo text-t-tinta">
      <div className="smart-menu sm-screen-portada"><div className="sm-page">
        <header className="sm-organization-head">
          {logo ? <img src={logo} alt={org.organizacion.nombre} className="sm-organization-logo" /> : <p className="sm-eyebrow">{org.organizacion.nombre}</p>}
          <h1>Elige tu restaurante</h1>
          <p>Cada local tiene su carta y sus mesas; tu cuenta sirve en todos.</p>
        </header>
        <nav aria-label="Restaurantes">
          {org.restaurantes.map((r) => (
            <Link key={r.slug} className="sm-venue-card" href={`/${encodeURIComponent(rest)}/${encodeURIComponent(r.slug)}/`}>
              <span><strong>{r.nombre}</strong>{r.direccion && <small>{r.direccion}</small>}</span><Icon name="arrow" />
            </Link>
          ))}
        </nav>
      </div></div>
    </main>
  )
}
