'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DishCard } from '@/components/ui/DishCard'
import { greetingFor } from '@/lib/domain/theme'
import { recommended } from '@/lib/domain/cart'
import { pathFor } from '@/lib/domain/route'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

// Portada (sistema de diseño §06): saludo en la serif del restaurante, línea del mesero, "Ver la carta", recomendados.
export function Home({ entry, rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null }) {
  const t = useTranslations('diner.home')
  const router = useRouter()
  const { add, call } = useDinerStore()
  const [called, setCalled] = useState(false)
  const brand = entry.contexto.marca
  const dishes = entry.carta.categorias.flatMap((c) => c.productos)
  const picks = recommended(dishes)
  const waiterLine = brand.mesero ? t('waiterLine', { name: brand.mesero, welcome: brand.bienvenida }) : t('waiterLineNoName', { welcome: brand.bienvenida })
  return (
    <div className="flex flex-col">
      <section className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-2.5">
        <h1 className="font-display text-[32px] leading-tight">{greetingFor(new Date().getHours(), brand.saludo)}</h1>
        {brand.bienvenida && <p className="text-base text-soft">{waiterLine}</p>}
        <button type="button" onClick={() => router.push(pathFor(rest, venue, token, 'carta'))} className="mt-2 h-14 rounded-rest bg-surface border border-border flex items-center justify-between px-[18px] text-base font-medium">
          <span>{t('seeMenu')}</span><span className="text-ink-3">→</span>
        </button>
        {entry.contexto.mesa && (
          <button type="button" onClick={async () => { if (await call()) setCalled(true) }} className="h-tap-min rounded-rest text-[15px] font-medium text-brand">{called ? t('called') : t('callWaiter')}</button>
        )}
      </section>
      {picks.length > 0 && (
        <section className="px-[18px] pb-[18px] flex flex-col gap-3">
          <div className="flex items-baseline justify-between"><span className="text-lg font-medium">{t('recommended')}</span>
            <button type="button" onClick={() => router.push(pathFor(rest, venue, token, 'carta'))} className="text-sm text-brand font-medium">{t('seeAll')}</button></div>
          <div className="grid grid-cols-2 gap-3">
            {picks.map((d) => <DishCard key={d.id} dish={d} onOpen={(x) => router.push(pathFor(rest, venue, token, 'plato', x.id))} onAdd={(x) => void add(x.id, 1, '')} />)}
          </div>
        </section>
      )}
    </div>
  )
}
