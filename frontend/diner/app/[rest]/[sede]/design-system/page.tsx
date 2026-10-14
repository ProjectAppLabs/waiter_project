'use client'

// /<rest>/<sede>/design-system: la página viva del sistema de diseño (Plan J5). Carga la entrada de la sede como la carta
// y admite ?borrador=<token> para ver un borrador en todos los componentes antes de confirmarlo. Nunca escribe.
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { DesignSystem } from '@/components/design-system/DesignSystem'
import { applyGoogleFonts, templateVars } from '@/lib/domain/template'
import { themeVars } from '@/lib/domain/theme'
import { getDesignContract } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { DesignContract } from '@/lib/types'

function DesignSystemPage() {
  const params = useParams<{ rest: string; sede: string }>()
  const search = useSearchParams()
  const draftParam = search?.get('borrador') ?? null
  const { entry, error, load, template, draftToken, draftExpires } = useDinerStore()
  const keys = useMemo(() => ({ rest: params.rest, venue: params.sede, token: null }), [params.rest, params.sede])
  const [contract, setContract] = useState<DesignContract | null>(null)
  useEffect(() => { void load(keys, draftParam) }, [keys, load, draftParam])
  // Sin contrato la página igual se dibuja: solo pierde descripciones e inventario de pantallas.
  useEffect(() => {
    let alive = true
    getDesignContract().then((c) => { if (alive) setContract(c) }).catch(() => undefined)
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!draftExpires || draftParam === null) return
    const timer = setTimeout(() => { void load(keys, draftParam) }, Math.max(0, Date.parse(draftExpires) - Date.now()))
    return () => clearTimeout(timer)
  }, [draftExpires, draftParam, keys, load])
  useEffect(() => { applyGoogleFonts(template) }, [template])
  const base = `/${encodeURIComponent(keys.rest)}/${encodeURIComponent(keys.venue)}`
  if (!entry || draftToken !== draftParam) return <main className="min-h-screen grid place-items-center p-6 text-center text-soft"><div>
    <p role={error ? 'alert' : 'status'}>{error ? draftParam !== null ? `No pudimos abrir el borrador. ${error}` : 'No pudimos cargar el sistema de diseño.' : draftParam !== null ? 'Preparando el borrador…' : 'Preparando el sistema de diseño…'}</p>
    {error && <button className="mt-4 rounded-xl border px-6 py-3" onClick={() => void load(keys, draftParam)}>Volver a intentar</button>}
    {draftParam !== null && <p><a href={`${base}/design-system`} className="inline-flex min-h-11 items-center underline">Ver el tema publicado</a></p>}
  </div></main>
  // Sin atributos data-ds-* en <main>: cada muestra lleva los suyos, y así una opción no contamina a la vecina.
  const style = { ...themeVars(entry.contexto.marca), ...templateVars(template) } as React.CSSProperties
  return <main style={style} className="ds-root">
    <DesignSystem entry={entry} template={template} contract={contract} draft={draftParam} expires={draftExpires} base={base} />
  </main>
}
export default function DesignSystemPageBoundary() {
  return <Suspense fallback={null}><DesignSystemPage /></Suspense>
}
