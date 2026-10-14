'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Aurora } from '@/components/kit/Aurora'
import { BrandMark } from '@/components/kit/BrandMark'

// Acceso (inicio de sesión y recuperar o activar la cuenta) en pantalla partida. A la izquierda, un panel azul noche con manchas
// de color que derivan despacio: son los colores del propio salón (mesa libre, en curso, lista, reservada). A la
// derecha, el formulario de siempre. En pantallas angostas el panel se vuelve una franja superior con la marca.
// La animación vive en components/kit/Aurora.tsx y está documentada en la vista /kit.
export const LOGIN_INPUT = 'w-full h-12 px-4 rounded-md border border-border bg-surface text-[16px] text-ink placeholder:text-dim focus:outline-none focus:border-primary'

export function LoginFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('pos.login')
  return (
    <main className="h-screen overflow-hidden flex flex-col lg:flex-row bg-surface text-ink">
      <aside className="shrink-0 h-[148px] lg:h-auto lg:w-[46%]">
        <Aurora className="h-full">
          <div className="h-full flex flex-col justify-between p-6 lg:p-12">
            <BrandMark size="lg" tone="inverse" />
            <div className="hidden lg:block max-w-[420px]">
              <p className="text-[40px] leading-[1.1] font-semibold tracking-[-0.025em]">{t('panelTitle')}</p>
              <p className="mt-4 text-[17px] leading-relaxed text-white/75">{t('panelText')}</p>
            </div>
          </div>
        </Aurora>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 overflow-auto flex flex-col items-center px-6 py-10">
        <div className="my-auto w-full max-w-[520px] flex flex-col items-center">{children}</div>
      </div>
    </main>
  )
}
