'use client'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'

// Lo primero de «Diseño del menú»: invitar a personalizarlo desde la IA de cada restaurante con el MCP de Waiter. Las
// claves se crean en «Integraciones IA»; el botón lleva allí.
export function McpInvite({ onConnect }: { onConnect: () => void }) {
  return (
    <section aria-labelledby="mcp-invita" className="mb-6 flex max-w-3xl flex-col gap-4 rounded-[20px] border border-brand-500/30 bg-brand-50 p-5 sm:flex-row sm:items-center">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-primary"><Icon name="sparkles" size={24} /></span>
      <div className="min-w-0 flex-1">
        <h3 id="mcp-invita" className="text-lg font-bold">Conecta nuestro MCP con tu IA favorita</h3>
        <p className="mt-1 text-sm text-soft">
          Personaliza tu menú conversando con Claude, ChatGPT u otra IA compatible con MCP: colores, fuentes, fotos,
          banners y componentes. Cada cambio se prepara como borrador y se verifica antes de publicarse.
        </p>
      </div>
      <Button variant="primary" size="compact" onClick={onConnect}>Conectar mi IA</Button>
    </section>
  )
}
