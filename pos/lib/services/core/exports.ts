import { currentOrg } from '@/lib/domain/tenant'
import { CoreError } from '@/lib/services/core/http'

// Plan Y1: los CSV al detalle los arma el servidor (todo el periodo, no solo lo que la pantalla tiene cargado).
export type ExportKind = 'ventas' | 'pagos' | 'inventario' | 'movimientos' | 'clientes' | 'historial' | 'equipo'
export interface ExportParams { from?: string; to?: string; restaurant_id?: number | null; [key: string]: string | number | null | undefined }

export async function downloadExport(kind: ExportKind, params: ExportParams = {}): Promise<string> {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
  const headers: Record<string, string> = { Accept: 'text/csv' }
  const org = currentOrg()
  if (org) headers['X-Waiter-Org'] = org
  let response: Response
  try {
    response = await fetch(`/experience/api/pos/v1/exports/${kind}?${query}`, { headers, credentials: 'include' })
  } catch {
    throw new CoreError(0, 'unreachable', 'Exportar necesita conexión con el servidor.')
  }
  if (!response.ok) {
    let data: Record<string, unknown> = {}
    try { data = await response.json() } catch { /* sin cuerpo */ }
    throw new CoreError(response.status, typeof data.error === 'string' ? data.error : `http_${response.status}`, typeof data.message === 'string' ? data.message : 'No se pudo exportar.', data)
  }
  const name = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `${kind}.csv`
  const url = URL.createObjectURL(await response.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
  return name
}
