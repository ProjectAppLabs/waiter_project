'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { taxRegime, type TaxRegime, type TaxRegimeInfo } from '@/lib/services/taxRegime'

// Tope del art. 512-13 ET para no ser responsable del INC. La UVT la fija la DIAN cada diciembre para el
// año siguiente, así que se guarda con su año a la vista: cuando cambie, se actualiza aquí y se ve en pantalla.
const UVT = { year: 2026, value: 52_374, resolution: 'Resolución DIAN 000238 de 2025' }
const THRESHOLD_UVT = 3_500

const OPTIONS: { key: TaxRegime; title: string; body: string }[] = [
  { key: 'inc', title: 'INC 8 % — impuesto nacional al consumo',
    body: 'Lo que cobra un restaurante en Colombia (art. 512-9 del Estatuto Tributario). Es el caso normal.' },
  { key: 'iva', title: 'IVA 19 % — solo franquicia',
    body: 'Únicamente si el restaurante opera bajo contrato de franquicia, concesión o regalía: entonces cobra IVA en lugar del INC.' },
  { key: 'none', title: 'No responsable — sin impuesto',
    body: 'El cliente paga el precio de la carta y no se cobra impuesto. Exige cumplir las dos condiciones del art. 512-13 a la vez.' },
]

export function TaxRegimeForm({ configId }: { configId: number }) {
  const [info, setInfo] = useState<TaxRegimeInfo | null>(null)
  const [choice, setChoice] = useState<TaxRegime | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void taxRegime(configId)
      .then((r) => { setInfo(r); setChoice(r.regime === 'mixed' ? null : r.regime) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo leer el régimen.'))
  }, [configId])

  async function save() {
    if (!choice) return
    setBusy(true); setError(''); setSaved(false)
    try { setInfo(await taxRegime(configId, choice)); setSaved(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el régimen.') }
    finally { setBusy(false) }
  }

  return (
    <section aria-label="Régimen tributario" className="max-w-2xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-ink">Régimen tributario</h3>
        <p className="mt-1 text-sm text-soft">
          Define qué impuesto lleva la carta. Al cambiarlo se aplica a los platos y bebidas del punto de venta;
          la propina nunca queda gravada, porque por ser voluntaria no hace parte de la base del INC.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      {saved && <p role="status" className="text-sm text-success-ink">Régimen guardado. Los terminales lo recargan al recuperar el foco o en un minuto.</p>}
      {info?.regime === 'mixed' && (
        <p role="alert" className="text-sm text-busy-ink">
          La carta tiene hoy impuestos distintos entre sí ({info.taxes.map((r) => `${r} %`).join(', ')}).
          Elige un régimen para dejarla toda igual.
        </p>
      )}

      <fieldset disabled={busy || !info} className="space-y-2">
        <legend className="sr-only">Régimen tributario del restaurante</legend>
        {OPTIONS.map((o) => (
          <label key={o.key} className={`flex gap-3 p-4 rounded-lg border cursor-pointer ${choice === o.key ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
            <input type="radio" name="regimen" className="mt-1 w-5 h-5 accent-primary shrink-0"
              checked={choice === o.key} onChange={() => { setChoice(o.key); setSaved(false) }} />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">{o.title}</span>
              <span className="block text-[14px] text-soft">{o.body}</span>
              {o.key === 'none' && (
                <span className="mt-1 block text-[13px] text-soft">
                  Ingresos del año anterior por debajo de {THRESHOLD_UVT.toLocaleString('es-CO')} UVT
                  (${formatCop(THRESHOLD_UVT * UVT.value)} con la UVT de {UVT.year}, ${formatCop(UVT.value)} · {UVT.resolution})
                  <b className="text-ink"> y</b> un solo establecimiento de comercio. Revísalo cada año con tu contador.
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {info && <p className="text-xs text-soft">Afecta a {info.products} productos de la carta.</p>}
      <Button variant="primary" disabled={busy || !choice || choice === info?.regime} onClick={() => void save()}>
        {busy ? 'Guardando…' : 'Guardar régimen'}
      </Button>
    </section>
  )
}
