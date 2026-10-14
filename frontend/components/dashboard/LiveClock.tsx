'use client'

import { useEffect, useState } from 'react'

// Reloj y fecha en vivo del kit ("09:55:02" y "jue, 2 de abril de 2025"), en la hora del dispositivo.
export function LiveClock({ label }: { label: string }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0)
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [])
  if (!now) return <div className="h-[60px]" />
  return (
    <div className="flex flex-col items-end" aria-label={label}>
      <time dateTime={now.toISOString()} className="text-[28px] leading-none font-semibold text-ink tabular">{now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
      <span className="text-[15px] text-soft mt-1.5">{now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  )
}
