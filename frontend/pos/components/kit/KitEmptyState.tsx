import { Icon, type KitIcon } from '@/components/kit/Icon'

// Estado vacío del kit (Dashboard / Empty.png): icono en círculo, título y frase.
export function KitEmptyState({ icon, title, body }: { icon: KitIcon; title: string; body?: string }) {
  return (
    <div className="flex-1 grid place-items-center p-8 text-center">
      <div className="flex flex-col items-center gap-2 max-w-xs">
        <span className="w-14 h-14 rounded-full border border-border grid place-items-center text-soft"><Icon name={icon} size={26} /></span>
        <span className="text-[18px] font-semibold text-ink">{title}</span>
        {body && <p className="text-[14px] text-soft">{body}</p>}
      </div>
    </div>
  )
}
