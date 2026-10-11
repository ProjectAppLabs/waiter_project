import type { FormEvent, MouseEvent, RefObject } from 'react'

// Lo que entrega WaiterLanding.renderVals() a las secciones: el mismo objeto que el diseño pasa a su plantilla.
export interface Segmento {
  bg: string
  fg: string
  shadow: string
}

export interface LandingVals {
  rootRef: RefObject<HTMLDivElement | null>
  teamCols: string
  teamEnter: (e: MouseEvent<HTMLElement>) => void
  teamLeave: (e: MouseEvent<HTMLElement>) => void
  painCols: string
  arrowDisplay: string
  waHref: string
  navLinksDisplay: string
  tabs: (Segmento & { label: string; onClick: () => void })[]
  mods: {
    icon: string
    name: string
    line: string
    anim: string
    soon?: boolean
    basis: string
    mask: string
    soonDisplay: string
    onEnter: (e: MouseEvent<HTMLElement>) => void
  }[]
  steps: {
    title: string
    text: string
    n: string
    opacity: number
    display: string
    bar: string
    textDisplay: string
    onClick: () => void
  }[]
  howCols: string
  howRows: string
  howPad: string
  howGap: string
  howH2: string
  stageH: string
  brands: { name: string; color: string; ink: string; soft: string; bg: string; bd: string; onClick: () => void }[]
  accent: string
  accentSoft: string
  boxTint: string
  brandName: string
  tones: { label: string; bg: string; fg: string; bd: string; onClick: () => void }[]
  toneName: string
  sedes: (Segmento & { label: string; checked: 'true' | 'false'; onClick: () => void })[]
  formOpen: boolean
  formDone: boolean
  hasError: boolean
  formError: string
  formName: string
  submitLabel: string
  submitOpacity: number
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  faqs: { q: string; a: string }[]
}
