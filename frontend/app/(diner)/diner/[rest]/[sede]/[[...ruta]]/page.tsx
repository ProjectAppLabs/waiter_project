'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo } from 'react'
import { FirstVisitIntro } from '@/components/smart/FirstVisitIntro'
import { SmartExperience } from '@/components/smart/SmartMenu'
import { parseRoute } from '@/lib/domain/route'
import { applyGoogleFonts, templateVars } from '@/lib/domain/template'
import { designSystemAttributes } from '@/lib/domain/designVariants'
import { themeVars } from '@/lib/domain/theme'
import { useDinerStore } from '@/lib/stores/dinerStore'

function DinerPage() {
  const params = useParams<{ rest: string; sede: string; ruta?: string[] }>()
  const search = useSearchParams()
  const previewParam = search?.get('vista_previa') ?? null
  const draftParam = search?.get('borrador') ?? null
  const route = useMemo(() => parseRoute(params.ruta), [params.ruta])
  const { entry, error, load, refreshCart, session, template, preview, draftToken, draftExpires, applyPreviewParam } = useDinerStore()
  const keys = useMemo(() => ({ rest: params.rest, venue: params.sede, token: route.token }), [params.rest, params.sede, route.token])
  useEffect(() => {
    void load(keys, draftParam).then(() => {
      if (draftParam === null && !previewParam && !useDinerStore.getState().preview && useDinerStore.getState().entry) return refreshCart()
    })
  }, [keys, load, refreshCart, previewParam, draftParam])
  useEffect(() => {
    if (session && draftParam === null && !previewParam && !preview) void refreshCart()
  }, [session, route.screen, refreshCart, previewParam, preview, draftParam])
  useEffect(() => { if (previewParam && draftParam === null) void applyPreviewParam(previewParam) }, [previewParam, draftParam, applyPreviewParam])
  useEffect(() => {
    if (!draftExpires || draftParam === null) return
    const timer = setTimeout(() => { void load(keys, draftParam) }, Math.max(0, Date.parse(draftExpires) - Date.now()))
    return () => clearTimeout(timer)
  }, [draftExpires, draftParam, keys, load])
  useEffect(() => { applyGoogleFonts(template) }, [template])
  const published = `/${encodeURIComponent(keys.rest)}/${encodeURIComponent(keys.venue)}/carta`
  if (!entry || draftToken !== draftParam) return <main className="min-h-screen grid place-items-center p-6 text-center text-soft"><div>
    <p role={error ? 'alert' : 'status'}>{error ? draftParam !== null ? `No pudimos abrir el borrador. ${error}` : 'No pudimos cargar el menú del restaurante.' : draftParam !== null ? 'Preparando el borrador…' : 'Preparando tu mesa…'}</p>
    {error && <button className="mt-4 rounded-xl border px-6 py-3" onClick={() => void load(keys, draftParam)}>Volver a intentar</button>}
    {draftParam !== null && <p><a href={published} className="inline-flex min-h-11 items-center underline">Abrir menú publicado</a></p>}
  </div></main>
  const style = { ...themeVars(entry.contexto.marca), ...templateVars(template) } as React.CSSProperties
  return <main {...designSystemAttributes(template.tema)} style={style} className="min-h-screen bg-t-fondo text-t-tinta">
    {preview && <p className="sm-preview-banner" role="status">Vista previa · cambios sin guardar{draftParam !== null && <> · <a href={published} className="inline-flex min-h-11 items-center underline">Abrir menú publicado</a></>}</p>}
    <FirstVisitIntro restaurant={keys.rest} enabled={route.screen==='carta'&&!preview&&!previewParam&&draftParam===null}><SmartExperience route={route} entry={entry} rest={keys.rest} venue={keys.venue} token={keys.token} id={route.id}/></FirstVisitIntro>
  </main>
}
export default function DinerPageBoundary() {
  return <Suspense fallback={null}><DinerPage/></Suspense>
}
