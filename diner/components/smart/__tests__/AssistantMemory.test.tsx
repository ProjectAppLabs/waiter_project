import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AssistantMemory } from '../AssistantMemory'
import { noticeUntil } from '../SmartChat'
import { forgetAssistantMemory, getAssistantMemory } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

jest.mock('@/lib/services/api')
const inicial = useDinerStore.getInitialState()
const RECUERDA = { preferencias: [{ clave: 'picante', nombre: 'Picante', veces: 3 }], favoritos: [{ producto: 7, nombre: 'Hamburguesa diabla' }], ultimos: [{ producto: 8, nombre: 'Limonada' }], alergias: ['maní'] }
const conModulos = (modulos: string[] | undefined) => useDinerStore.setState({ ...inicial, keys: { rest: 'demo', venue: 'salon', token: null }, entry: { modulos } as unknown as Entry }, true)
beforeEach(() => { jest.resetAllMocks(); conModulos(undefined) })
afterEach(() => useDinerStore.setState(inicial, true))

// Falla si el comensal no ve lo que el asistente recuerda de él en este restaurante, o si borrar no llama al servidor,
// deja datos a la vista o borra también las alergias, que son de su cuenta.
it('muestra lo que recuerda y lo borra', async () => {
  jest.mocked(getAssistantMemory).mockResolvedValue(RECUERDA)
  jest.mocked(forgetAssistantMemory).mockResolvedValue()
  render(<AssistantMemory />)
  expect(await screen.findByText('Picante')).toBeInTheDocument()
  expect(screen.getByText('Hamburguesa diabla')).toBeInTheDocument()
  expect(getAssistantMemory).toHaveBeenCalledWith('demo', 'salon')
  fireEvent.click(screen.getByRole('button', { name: 'Borrar lo que recuerda' }))
  await waitFor(() => expect(forgetAssistantMemory).toHaveBeenCalledWith('demo', 'salon'))
  expect(await screen.findByText(/ya no recuerda nada de ti/)).toBeInTheDocument()
  expect(screen.queryByText('Hamburguesa diabla')).not.toBeInTheDocument()
  expect(screen.getByText(/maní/)).toBeInTheDocument()
})

// Falla si un error al leer o al borrar deja la sección cargando o en silencio.
it('avisa los errores', async () => {
  jest.mocked(getAssistantMemory).mockRejectedValueOnce(new Error('caído'))
  const { unmount } = render(<AssistantMemory />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos leer')
  unmount()
  jest.mocked(getAssistantMemory).mockResolvedValue(RECUERDA)
  jest.mocked(forgetAssistantMemory).mockRejectedValue(new Error('Sin conexión'))
  render(<AssistantMemory />)
  fireEvent.click(await screen.findByRole('button', { name: 'Borrar lo que recuerda' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})

// Falla si la sección aparece en un restaurante sin el asistente del menú, o si con la memoria vacía ofrece borrar.
it('se oculta sin el asistente y no ofrece borrar lo vacío', async () => {
  conModulos(['menu_comensal'])
  const { container, unmount } = render(<AssistantMemory />)
  expect(container).toBeEmptyDOMElement()
  expect(getAssistantMemory).not.toHaveBeenCalled()
  unmount()
  conModulos(['asistente_menu'])
  jest.mocked(getAssistantMemory).mockResolvedValue({ preferencias: [], favoritos: [], ultimos: [], alergias: [] })
  render(<AssistantMemory />)
  expect(await screen.findByText(/Todavía no recuerda nada/)).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

// Falla si un aviso de restricción no dice hasta cuándo, o si un recordatorio inventa una vigencia.
it('dice hasta cuándo dura cada aviso', () => {
  expect(noticeUntil({ tipo: 'restringido', hasta: '2026-10-09T23:30:00Z' })).toMatch(/^Hasta las .+ solo puedes usar los botones\.$/)
  expect(noticeUntil({ tipo: 'pausado', hasta: '2026-10-10T05:00:00Z' })).toMatch(/mañana/)
  expect(noticeUntil({ tipo: 'cupo', hasta: '2026-10-10T05:00:00Z' })).toMatch(/mañana/)
  expect(noticeUntil({ tipo: 'recordatorio', hasta: '2026-10-10T05:00:00Z' })).toBe('')
  expect(noticeUntil({ tipo: 'advertencia', hasta: null })).toBe('')
})
