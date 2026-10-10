import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AssistantView } from '@/components/business/AssistantView'
import { CoreError } from '@/lib/services/core/http'
import { assistantStatus, assistantTags, liftRestriction, proposeTags, restrictedParticipants, saveTags, type AssistantStatus, type AssistantTags } from '@/lib/services/core/assistant'

jest.mock('@/lib/services/core/assistant', () => ({
  assistantTags: jest.fn(), saveTags: jest.fn(), proposeTags: jest.fn(), restrictedParticipants: jest.fn(), liftRestriction: jest.fn(), assistantStatus: jest.fn(),
}))

const TAGS: AssistantTags = {
  vocabulary: [{ key: 'picante', name: 'Picante' }, { key: 'vegetariano', name: 'Vegetariano' }],
  products: [{ id: 1, name: 'Hamburguesa diabla', tags: ['picante'], reviewed: false }, { id: 2, name: 'Ensalada', tags: ['vegetariano'], reviewed: true }],
}
const READY: AssistantStatus = { evaluator: true, voice: true, messages: 12, perRestaurant: 300, perParticipant: 30 }
const PERSON = { id: 9, channel: 'whatsapp' as const, standing: 'restricted' as const, reason: 'Mensajes fuera de tema', until: '2026-10-09T18:30:00Z' }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assistantTags).mockResolvedValue(TAGS)
  jest.mocked(restrictedParticipants).mockResolvedValue([PERSON])
  jest.mocked(assistantStatus).mockResolvedValue(READY)
})

// Falla si las etiquetas que el dueño elige no son las que se guardan, si guardar no marca el plato como revisado o si
// el filtro «solo sin revisar» muestra platos ya revisados.
it('revisa las etiquetas de un plato', async () => {
  jest.mocked(saveTags).mockResolvedValue({ ...TAGS.products[0], tags: ['picante', 'vegetariano'], reviewed: true })
  render(<AssistantView />)
  const dish = await screen.findByRole('listitem', { name: 'Hamburguesa diabla' })
  fireEvent.click(within(dish).getByRole('button', { name: 'Vegetariano' }))
  fireEvent.click(within(dish).getByRole('button', { name: 'Marcar revisado' }))
  await waitFor(() => expect(saveTags).toHaveBeenCalledWith(1, ['picante', 'vegetariano']))
  expect(await screen.findByText('«Hamburguesa diabla» quedó revisado.')).toBeInTheDocument()
  expect(within(dish).getByText('Revisado')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /Solo sin revisar/ }))
  expect(screen.getByText('Todos los platos están revisados.')).toBeInTheDocument()
})

// Falla si «Proponer con IA» pide etiquetas para platos ya revisados o si las propuestas no se ven para revisarlas.
it('propone etiquetas solo para lo que falta revisar', async () => {
  jest.mocked(proposeTags).mockResolvedValue([{ id: 1, name: 'Hamburguesa diabla', tags: ['picante', 'vegetariano'], reviewed: false }])
  render(<AssistantView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Proponer con IA' }))
  await waitFor(() => expect(proposeTags).toHaveBeenCalledWith([1]))
  expect(await screen.findByText(/propuso etiquetas para 1 plato\./)).toBeInTheDocument()
  expect(within(screen.getByRole('listitem', { name: 'Hamburguesa diabla' })).getByRole('button', { name: 'Vegetariano' })).toHaveAttribute('aria-pressed', 'true')
})

// Falla si sin las claves de IA la página no lo dice o deja proponer con IA, que respondería 503.
it('explica que sin claves responde con plantillas', async () => {
  jest.mocked(assistantStatus).mockResolvedValue({ ...READY, evaluator: false, voice: false })
  render(<AssistantView />)
  expect(await screen.findByText(/sigue atendiendo con respuestas fijas/)).toBeInTheDocument()
  expect(screen.getAllByText('Sin configurar')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Proponer con IA' })).toBeDisabled()
})

// Falla si quitar la restricción no llama al servidor con el cliente correcto o si el cliente sigue en la lista.
it('quita la restricción a un cliente', async () => {
  jest.mocked(liftRestriction).mockResolvedValue({})
  render(<AssistantView />)
  expect(await screen.findByText('Cliente de WhatsApp')).toBeInTheDocument()
  expect(screen.getByText(/Mensajes fuera de tema/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar restricción' }))
  await waitFor(() => expect(liftRestriction).toHaveBeenCalledWith(9))
  expect(await screen.findByText('Nadie está restringido.')).toBeInTheDocument()
})

// Falla si un error del servidor deja la página en blanco o cargando para siempre.
it('muestra el error al leer o al guardar', async () => {
  jest.mocked(assistantStatus).mockRejectedValueOnce(new CoreError(403, 'forbidden', 'Sin permiso'))
  const { unmount } = render(<AssistantView />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso')
  unmount()
  jest.mocked(liftRestriction).mockRejectedValue(new Error(''))
  render(<AssistantView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Quitar restricción' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar.')
})
