import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { ConsoleNavigation } from '@/components/console/ConsoleNavigation'
import { messages } from '@/lib/i18n/messages'

const fixture = (pathname = '/organizacion') => (
  <NextIntlClientProvider locale="es" messages={messages}>
    <ConsoleNavigation label="Consola de la organización" brandHref="/organizacion" pathname={pathname}>
      <a href="/organizacion/restaurantes" onClick={(event) => event.preventDefault()}>Restaurantes</a>
      <a href="/organizacion/equipo" onClick={(event) => event.preventDefault()}>Equipo</a>
      <button type="button">Cerrar sesión</button>
    </ConsoleNavigation>
  </NextIntlClientProvider>
)

// jsdom no implementa el diálogo nativo. Estos dobles sólo despachan su contrato de apertura/cierre;
// el foco atrapado y el fondo inerte se comprueban en Chromium, sin emularlos aquí.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

// Restaura también el spy de geometría si falla una aserción antes de terminar la prueba.
afterEach(() => { jest.restoreAllMocks() })

// Falla si abrir el menú no anuncia su estado ni relaciona el botón con las secciones disponibles.
it('abre el diálogo y anuncia el menú disponible', async () => {
  render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('dialog')).toBeNull()
  await userEvent.click(trigger)
  const drawer = screen.getByRole('dialog', { name: 'Consola de la organización' })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(trigger).toHaveAttribute('aria-controls', drawer.id)
  expect(within(drawer).getAllByRole('link').map((link) => link.textContent)).toEqual(['Restaurantes', 'Equipo'])
})

// Falla si cerrar con el botón conserva el diálogo abierto o deja el foco perdido.
it('cierra con el botón y devuelve el foco al control de apertura', async () => {
  render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  const drawer = screen.getByRole('dialog', { name: 'Consola de la organización' })
  await userEvent.click(within(drawer).getByRole('button', { name: 'Cerrar menú' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveFocus()
})

// Falla si Tab o Shift+Tab desde los extremos envían el foco al fondo o a la barra del navegador.
it('recorre circularmente los controles del menú en ambos sentidos', async () => {
  render(fixture())
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
  const drawer = screen.getByRole('dialog', { name: 'Consola de la organización' })
  const close = within(drawer).getByRole('button', { name: 'Cerrar menú' })
  const logout = within(drawer).getByRole('button', { name: 'Cerrar sesión' })
  // El doble nativo no aplica autofocus: partimos del foco inicial que Chromium comprueba en el E2E.
  close.focus()
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
  expect(logout).toHaveFocus()
  await userEvent.keyboard('{Tab}')
  expect(close).toHaveFocus()
})

// Falla si Escape, el evento cancel del diálogo nativo, deja la navegación tapando el contenido.
it('cierra ante Escape y devuelve el foco al control que abrió el menú', async () => {
  render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveFocus()
})

// Falla si elegir un enlace conserva el menú abierto, incluso cuando se elige la ruta actual.
it('cierra al elegir una sección', async () => {
  render(fixture('/organizacion/restaurantes'))
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Restaurantes' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveFocus()
})

// Falla si un tap dentro se interpreta como fondo, o si el fondo no cierra el menú y restaura el foco.
it('conserva el menú al interactuar dentro y lo cierra al tocar fuera', async () => {
  render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  const drawer = screen.getByRole('dialog')
  jest.spyOn(drawer, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 320, bottom: 915 } as DOMRect)
  fireEvent.click(drawer, { clientX: 200, clientY: 300 })
  expect(drawer).toHaveAttribute('open')
  fireEvent.click(drawer, { clientX: 400, clientY: 300 })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveFocus()
})

// Falla si una navegación externa mantiene abierto un diálogo de la página anterior.
it('cierra cuando cambia la ruta del layout', async () => {
  const { rerender } = render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  rerender(fixture('/organizacion/equipo'))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

// Falla si al pasar a escritorio el diálogo oculto deja el resto de la página inerte.
it('cierra al recuperar la navegación lateral de escritorio', async () => {
  let onChange: (() => void) | undefined
  const media = { matches: false, addEventListener: jest.fn((_name: string, listener: () => void) => { onChange = listener }), removeEventListener: jest.fn() }
  jest.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
  const { unmount } = render(fixture())
  const trigger = screen.getByRole('button', { name: 'Abrir menú' })
  await userEvent.click(trigger)
  media.matches = true
  // El navegador despacha change sobre la MediaQueryList, no resize al componente.
  act(() => onChange?.())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  unmount()
  expect(media.removeEventListener).toHaveBeenCalledWith('change', onChange)
})
