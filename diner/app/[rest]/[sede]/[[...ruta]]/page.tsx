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
  const route = useMemo(() => parseRoute(params.ruta), [params.ruta])
  const { entry, error, load, refreshCart, session, template, preview, applyPreviewParam } = useDinerStore()
  const keys = useMemo(() => ({ rest: params.rest, venue: params.sede, token: route.token }), [params.rest, params.sede, route.token])
  useEffect(() => {
    void load(keys).then(() => {
      if (!previewParam && !useDinerStore.getState().preview) return refreshCart()
    })
  }, [keys, load, refreshCart, previewParam])
  useEffect(() => {
    if (session && !previewParam && !preview) void refreshCart()
  }, [session, route.screen, refreshCart, previewParam, preview])
  useEffect(() => { if (previewParam) void applyPreviewParam(previewParam) }, [previewParam, applyPreviewParam])
  useEffect(() => { applyGoogleFonts(template) }, [template])
  if (!entry) return <main className="min-h-screen grid place-items-center p-6 text-center text-soft"><div><p>{error ? 'No pudimos cargar el menú del restaurante.' : 'Preparando tu mesa…'}</p>{error && <button className="mt-4 rounded-xl border px-6 py-3" onClick={() => void load(keys)}>Volver a intentar</button>}</div></main>
  const style = { ...themeVars(entry.contexto.marca), ...templateVars(template) } as React.CSSProperties
  return <main {...designSystemAttributes(template.tema)} style={style} className="min-h-screen bg-t-fondo text-t-tinta">
    {preview && <p className="sm-preview-banner" role="status">Vista previa · cambios sin guardar</p>}
    <FirstVisitIntro restaurant={keys.rest} enabled={route.screen==='carta'&&!preview&&!previewParam}><SmartExperience route={route} entry={entry} rest={keys.rest} venue={keys.venue} token={keys.token} id={route.id}/></FirstVisitIntro>
  </main>
}
export default function DinerPageBoundary() {
  return <Suspense fallback={null}><DinerPage/></Suspense>
}
