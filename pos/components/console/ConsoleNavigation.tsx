'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { BrandMark } from '@/components/kit/BrandMark'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'

// En tableta vertical el menú no reserva ancho: el diálogo nativo retiene el foco y deja inerte el fondo.
// El contenido se recibe ya filtrado por el layout, de modo que ambas variantes conservan los mismos permisos.
export function ConsoleNavigation({ label, brandHref, pathname, children }: {
  label: string
  brandHref: string
  pathname: string
  children: ReactNode
}) {
  const dialogId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { dialog.current?.close() }, [pathname])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  const close = () => { dialog.current?.close() }

  return (
    <>
      <nav aria-label={label} className="relative hidden w-[260px] shrink-0 border-r border-border p-4 lg:flex flex-col gap-1 overflow-y-auto">
        {children}
      </nav>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:hidden">
        <BrandMark href={brandHref} />
        <button ref={trigger} type="button" aria-label="Abrir menú" aria-controls={dialogId} aria-expanded={open}
          onClick={() => { dialog.current?.showModal(); setOpen(true) }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-brand-500">
          <Icon name="layout" size={20} />Menú
        </button>
      </header>
      <dialog ref={dialog} id={dialogId} aria-label={label}
        onCancel={(event) => { event.preventDefault(); close() }}
        onClose={() => { setOpen(false); trigger.current?.focus() }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom)) close()
        }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(320px,calc(100vw-32px))] max-w-none border-r border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-overlay/60 lg:hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border p-3">
            <Button autoFocus size="compact" onClick={close} aria-label="Cerrar menú"><Icon name="close" size={20} />Cerrar</Button>
          </div>
          <nav aria-label={label} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4"
            onClick={(event) => { if (event.target instanceof Element && event.target.closest('a[href]')) close() }}>
            {children}
          </nav>
        </div>
      </dialog>
    </>
  )
}
