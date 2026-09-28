'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { ThresholdsForm } from '@/components/settings/SettingsForms'
import { Button } from '@/components/ui/Button'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { saveSettings } from '@/lib/services/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Los umbrales de alerta (plato demorado, cuenta en espera) se ajustan donde se sufren: en la cocina y en Operación,
// no en Configuración. Solo un administrador los cambia; `label` permite un texto más corto donde ya hay contexto.
export function AlertThresholdsButton({ label, className }: { label?: string; className?: string }) {
  const t = useTranslations('admin.settings.sections')
  const { role } = useIdentity()
  const catalog = useCatalogStore((s) => s.catalog)
  const load = useCatalogStore((s) => s.load)
  const session = useAuthStore((s) => s.session)
  const [open, setOpen] = useState(false)
  if (role !== 'admin' || !catalog) return null
  return (
    <>
      <Button size="compact" className={className} onClick={() => setOpen(true)}><Icon name="alert" size={18} />{label ?? t('alerts')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('alerts')} size="center">
        <div className="p-5">
          <ThresholdsForm key={open ? 'abierto' : 'cerrado'} initial={catalog.settings} section="alerts"
            onSave={async (s) => { await saveSettings(s); await load(session?.id ?? null) }} />
        </div>
      </Modal>
    </>
  )
}
