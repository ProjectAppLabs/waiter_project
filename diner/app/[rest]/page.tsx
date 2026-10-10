'use client'
/* eslint-disable @next/next/no-img-element -- Logo del restaurante servido por experience. */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/smart/SmartMenu'
import { designSystemAttributes } from '@/lib/domain/designVariants'
import { applyGoogleFonts, templateVars } from '@/lib/domain/template'
import { themeVars } from '@/lib/domain/theme'
import { getEntry, getOrganization, quoteDelivery } from '@/lib/services/api'
import { carryTo } from '@/lib/domain/venueRedirect'
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
  // Plan D: con varias sedes, el cliente puede pedir que lo llevemos a la que le queda más cerca y le llega. La ubicación
  // se pide al tocar el botón (en contexto), no al cargar la página.
  const [nearby, setNearby] = useState<'buscando' | 'fuera' | 'cerrada' | 'sin-permiso' | ''>('')
  const [closedText, setClosedText] = useState('')
  function nearest() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setNearby('sin-permiso'); return }
    setNearby('buscando')
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const q = await quoteDelivery(rest, p.coords.latitude, p.coords.longitude)
        if (!q.cobertura) { setNearby(q.motivo === 'cerrado' ? 'cerrada' : 'fuera'); setClosedText(q.motivo === 'cerrado' ? q.mensaje : ''); return }
        carryTo(rest, q.sede.slug, { lat: p.coords.latitude, lng: p.coords.longitude, direccion: '' }, `Te mostramos la sede ${q.sede.nombre}, la más cercana a ti.`)
        setNearby('')
        router.push(`/${encodeURIComponent(rest)}/${encodeURIComponent(q.sede.slug)}/`)
      } catch { setNearby('') }
    }, () => setNearby('sin-permiso'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
  }
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
          <button type="button" className="sm-secondary" disabled={nearby === 'buscando'} onClick={nearest}>{nearby === 'buscando' ? 'Buscando la sede más cercana…' : '📍 Ver la sede más cercana'}</button>
          {nearby === 'sin-permiso' && <p role="status">No pudimos ver tu ubicación. Escoge la sede en la lista.</p>}
          {nearby === 'cerrada' && <p role="status">{closedText}</p>}
          {nearby === 'fuera' && <p role="status">Ninguna sede lleva domicilios hasta tu ubicación. Puedes escoger una para recoger o comer allá.</p>}
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
