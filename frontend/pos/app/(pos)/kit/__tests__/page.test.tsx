import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import DesignSystemPage from '../page'
import { messages } from '@/lib/i18n/messages'
import { AURORA, KIT_LIGHT, RADII, TAP_SIZES, TYPE_SCALE, cssVar, type KitToken } from '@/lib/design/tokens'

jest.mock('@/components/kit/KitShell', () => ({ KitShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><DesignSystemPage /></NextIntlClientProvider>)

// Falla si un token, un estilo de letra, un radio, una altura táctil o una mancha de la Aurora existe en el sistema
// pero no aparece en la vista: la documentación dejaría de ser completa sin que nadie lo note.
it('documents every token, type style, radius, tap size and aurora blob', () => {
  wrap()
  for (const token of Object.keys(KIT_LIGHT) as KitToken[]) expect(screen.getByText(cssVar(token))).toBeInTheDocument()
  const type = screen.getByRole('region', { name: 'Tipografía' })
  for (const style of TYPE_SCALE) expect(within(type).getAllByText(style.name).length).toBeGreaterThan(0)
  for (const r of RADII) expect(screen.getByText(`${r.className} · ${r.px} px`)).toBeInTheDocument()
  for (const s of TAP_SIZES) expect(screen.getByText(s.className)).toBeInTheDocument()
  const aurora = screen.getByRole('region', { name: 'Patrón Aurora' })
  for (const blob of AURORA.blobs) expect(within(aurora).getByText(blob.key)).toBeInTheDocument()
})

// Falla si una sección pierde su nota «Para extender» o si el índice deja de listar una sección.
it('lists every section in the index and tells how to extend each one', () => {
  wrap()
  const index = screen.getByRole('navigation', { name: 'Secciones del sistema de diseño' })
  const sections = screen.getAllByRole('region')
  expect(sections).toHaveLength(12)
  for (const section of sections) {
    expect(within(section).getByText('Para extender:')).toBeInTheDocument()
    expect(within(index).getByRole('button', { name: document.getElementById(section.getAttribute('aria-labelledby')!)!.textContent! })).toBeInTheDocument()
  }
})

// Falla si el conmutador deja de aplicar el tema solo a los ejemplos (debe ser un data-theme local, no el del documento).
it('previews the examples in dark without touching the document theme', () => {
  wrap()
  fireEvent.click(screen.getByText('Oscuro'))
  expect(screen.getByRole('region', { name: 'Color' }).closest('[data-theme]')).toHaveAttribute('data-theme', 'dark')
  expect(document.documentElement).not.toHaveAttribute('data-theme', 'dark')
})
