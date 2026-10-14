'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { claudeCodeCommand, connectorUrl, createMcpKey, listMcpKeys, revokeMcpKey, type CreatedMcpKey, type McpKey } from '@/lib/services/mcpKeys'

const when = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

// Texto que se copia con un botón; el botón confirma «Copiado» un momento.
function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations('pos.settings.integrations')
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-soft">{label}</span>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-[13px] text-ink break-all">{value}</code>
        <Button size="compact" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  )
}

// Configuración › Integraciones IA: claves del MCP de Waiter. Cada clave solo llega a este restaurante (la sede la decide
// el servidor a partir de la clave). La clave en claro se ve una sola vez, al crearla; después solo su prefijo.
export function McpKeysForm() {
  const t = useTranslations('pos.settings.integrations')
  const [rows, setRows] = useState<McpKey[] | null>(null)
  const [mcpUrl, setMcpUrl] = useState('')
  const [name, setName] = useState('')
  const [created, setCreated] = useState<CreatedMcpKey | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const apply = (data: { claves: McpKey[]; mcpUrl: string }) => { setRows(data.claves); setMcpUrl(data.mcpUrl) }
  const load = async () => { apply(await listMcpKeys()) }
  // Primera carga: la respuesta se descarta si la sección ya se cerró.
  useEffect(() => {
    let alive = true
    listMcpKeys().then((data) => { if (alive) apply(data) }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : t('loadError')) })
    return () => { alive = false }
  }, [t])

  async function create() {
    setBusy(true); setError('')
    try { const key = await createMcpKey(name.trim()); setCreated(key); setName(''); await load() }
    catch (e) { setError(e instanceof Error ? e.message : t('createError')) }
    finally { setBusy(false) }
  }
  async function revoke(id: number) {
    setBusy(true); setError('')
    try { await revokeMcpKey(id); setConfirming(null); if (created?.id === id) setCreated(null); await load() }
    catch (e) { setError(e instanceof Error ? e.message : t('revokeError')) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <p className="text-[15px] leading-relaxed text-soft">{t('intro')}</p>
      {error && <p role="alert" className="text-[14px] text-busy-ink">{error}</p>}

      <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void create() }}>
        <div className="flex-1"><TextInput label={t('name')} placeholder={t('namePlaceholder')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}><Icon name="plus" size={18} />{t('create')}</Button>
      </form>

      {created && (
        <section aria-label={t('newKey')} className="rounded-lg border-2 border-primary/40 bg-primary-soft/40 p-4 flex flex-col gap-4">
          <p className="flex items-start gap-2 text-[14px] font-semibold text-ink"><Icon name="alert" size={18} className="mt-0.5 shrink-0 text-primary" />{t('onlyOnce')}</p>
          <CopyRow label={t('keyLabel', { name: created.nombre })} value={created.clave} />
          <CopyRow label={t('claudeAi')} value={connectorUrl(created.mcpUrl, created.clave)} />
          <CopyRow label={t('claudeCode')} value={claudeCodeCommand(created.mcpUrl, created.clave)} />
          <Button size="compact" className="self-start" onClick={() => setCreated(null)}>{t('done')}</Button>
        </section>
      )}

      <section aria-label={t('listTitle')} className="flex flex-col gap-2">
        <h3 className="text-[16px] font-semibold text-ink">{t('listTitle')}</h3>
        {rows === null ? <p className="text-[14px] text-soft">{t('loading')}</p> : rows.length === 0 ? <p className="text-[14px] text-soft">{t('empty')}</p> : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {rows.map((k) => (
              <li key={k.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-ink truncate">{k.nombre} <span className="font-mono text-[13px] font-normal text-soft">{k.prefijo}…</span></p>
                  <p className="text-[13px] text-soft">{t('createdOn', { date: when(k.creada), by: k.creadaPor || '—' })} · {k.ultimoUso ? t('lastUse', { date: when(k.ultimoUso) }) : t('neverUsed')}</p>
                </div>
                {k.revocada ? <span className="text-[13px] font-semibold text-soft">{t('revoked')}</span>
                  : confirming === k.id ? <span className="flex items-center gap-2">
                      <Button size="compact" onClick={() => setConfirming(null)} disabled={busy}>{t('cancel')}</Button>
                      <Button size="compact" className="bg-danger text-primary-ink border-danger" onClick={() => void revoke(k.id)} disabled={busy}>{t('confirmRevoke')}</Button>
                    </span>
                  : <Button size="compact" onClick={() => setConfirming(k.id)} disabled={busy}>{t('revoke')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {mcpUrl && <p className="text-[13px] text-soft">{t('serverUrl')} <code className="font-mono text-ink">{mcpUrl}</code></p>}
    </div>
  )
}
