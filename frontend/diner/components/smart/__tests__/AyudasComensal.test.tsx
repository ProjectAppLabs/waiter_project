import { act, fireEvent, render, screen } from '@testing-library/react'
import { IngredientIllustration } from '../SmartIngredients'
import { SmartAssistantReminder } from '../SmartAssistantReminder'
import { ChatCarousel, ChatReply } from '../ChatReply'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { gsap } from 'gsap'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useSearchParams: () => null }))
const mockRevertir = jest.fn()
let mockReducir = false
jest.mock('gsap', () => ({ gsap: {
  matchMedia: () => ({ add: (_consulta: unknown, efecto: (contexto: { conditions: { reduce: boolean } }) => void) => efecto({ conditions: { reduce: mockReducir } }), revert: mockRevertir }),
  to: jest.fn(), from: jest.fn(),
} }))
const inicial = useDinerStore.getInitialState()
beforeEach(() => {
  jest.clearAllMocks()
  mockReducir = false
  sessionStorage.clear()
  useDinerStore.setState({ ...inicial, keys: { rest: 'casa', venue: 'centro', token: null } }, true)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { useDinerStore.setState(inicial, true); jest.useRealTimers(); jest.restoreAllMocks() })

// Falla si un ingrediente reconocido pierde su ilustración o uno desconocido se representa con otro alimento.
it('ilustra los ingredientes reconocidos y usa un icono neutro para los demás', () => {
  const vista = render(<IngredientIllustration name=" HUEVO " />)
  expect(vista.container.querySelector('img')).toHaveAttribute('src', '/smart-menu/emoji/emoji-egg-01063649.png')
  vista.rerender(<IngredientIllustration name="Salsa de la casa" />)
  expect(vista.container.querySelector('img')).toBeNull()
  expect(vista.container.querySelector('svg')).toBeInTheDocument()
})

// Falla si la sugerencia aparece antes de cinco minutos, no permite cerrarse o se repite durante la misma visita.
it('sugiere el asistente una sola vez por sede después de cinco minutos', () => {
  jest.useFakeTimers()
  const vista = render(<SmartAssistantReminder />)
  act(() => jest.advanceTimersByTime(299999))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => jest.advanceTimersByTime(1))
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('link', { name: /Elegir con el asistente/ })).toHaveAttribute('href', '/casa/centro/asistente')
  fireEvent.click(screen.getByRole('button', { name: 'Seguir explorando' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  vista.unmount()
  render(<SmartAssistantReminder />)
  act(() => jest.advanceTimersByTime(300000))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

// Falla si el recordatorio interrumpe otro diálogo, aparece en vista previa o se abre después de abandonar la página.
it('respeta los diálogos abiertos, la vista previa y la salida de la pantalla', () => {
  jest.useFakeTimers()
  const vista = render(<><dialog open aria-label="Pedido" /><SmartAssistantReminder /></>)
  act(() => jest.advanceTimersByTime(300000))
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(sessionStorage.getItem('smart-menu:assistant-reminder:casa:centro')).toBeNull()
  vista.unmount()
  useDinerStore.setState({ preview: DEFAULT_TEMPLATE })
  const previa = render(<SmartAssistantReminder />)
  act(() => jest.advanceTimersByTime(300000))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  previa.unmount()
  useDinerStore.setState({ preview: null })
  const ultima = render(<SmartAssistantReminder />)
  ultima.unmount()
  act(() => jest.advanceTimersByTime(300000))
  expect(sessionStorage.getItem('smart-menu:assistant-reminder:casa:centro')).toBeNull()
})

// Falla si cerrar la sugerencia o seguir su enlace deja el diálogo sobre la conversación.
it.each(['cerrar', 'abrir asistente'])('retira la sugerencia al elegir %s', accion => {
  jest.useFakeTimers()
  render(<SmartAssistantReminder />)
  act(() => jest.advanceTimersByTime(300000))
  fireEvent.click(accion === 'cerrar' ? screen.getByRole('button', { name: 'Cerrar sugerencia' }) : screen.getByRole('link', { name: /Elegir con el asistente/ }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

// Falla si las recomendaciones se muestran antes de terminar la respuesta o el lector de pantalla recibe texto incompleto.
it('revela las opciones al terminar la respuesta y conserva el texto accesible completo', () => {
  const vista = render(<ChatReply text="Tenemos sopa de verduras" animate><button>Elegir sopa</button></ChatReply>)
  expect(screen.getByText('Tenemos sopa de verduras')).toHaveClass('sr-only')
  expect(screen.queryByRole('button', { name: 'Elegir sopa' })).not.toBeInTheDocument()
  const [avance, opciones] = jest.mocked(gsap.to).mock.calls[0] as unknown as [{ words: number }, { onUpdate: () => void; onComplete: () => void }]
  act(() => { avance.words = 2; opciones.onUpdate() })
  expect(screen.getByText('Tenemos sopa')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  act(() => opciones.onComplete())
  expect(screen.getByRole('button', { name: 'Elegir sopa' })).toBeVisible()
  expect(gsap.from).toHaveBeenCalled()
  vista.unmount()
  expect(mockRevertir).toHaveBeenCalled()
})

// Falla si reducir el movimiento obliga a esperar la animación para elegir una recomendación.
it('muestra de inmediato la respuesta con movimiento reducido', () => {
  mockReducir = true
  render(<ChatReply text="Tenemos sopa" animate><button>Elegir sopa</button></ChatReply>)
  expect(screen.getByRole('button', { name: 'Elegir sopa' })).toBeVisible()
  expect(gsap.to).not.toHaveBeenCalled()
})

// Falla si los controles del carrusel desplazan en la dirección equivocada o ignoran la preferencia de movimiento.
it('desplaza las opciones hacia ambos lados y respeta el movimiento reducido', () => {
  const vista = render(<ChatCarousel title="Sopas" count={2}><p>Sopa de verduras</p><p>Sopa de pollo</p></ChatCarousel>)
  const carril = screen.getByLabelText('Opciones de Sopas')
  Object.defineProperty(carril, 'clientWidth', { value: 200 })
  const desplazar = jest.fn()
  carril.scrollBy = desplazar
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente en Sopas' }))
  expect(desplazar).toHaveBeenLastCalledWith({ left: 170, behavior: 'smooth' })
  jest.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  fireEvent.click(screen.getByRole('button', { name: 'Anterior en Sopas' }))
  expect(desplazar).toHaveBeenLastCalledWith({ left: -170, behavior: 'instant' })
  vista.rerender(<ChatCarousel title="Sopas" count={1}><p>Sopa de verduras</p></ChatCarousel>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
