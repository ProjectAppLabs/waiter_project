import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { EditorTable } from '@/components/tables/LayoutArranger'
import { FloorWizard } from '@/components/tables/FloorWizard'
import { messages } from '@/lib/i18n/messages'
import { toast } from '@/lib/stores/toastStore'
import type { Floor } from '@/lib/types'

jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
jest.mock('@/lib/services/tables', () => ({ saveFloorLayout: jest.fn() }))
// El arrastre del plano ya tiene sus pruebas (LayoutArranger.test.tsx): aquí basta con un sustituto que agrega mesas.
jest.mock('@/components/tables/LayoutArranger', () => ({
  LayoutArranger: ({ tables, onChange }: { tables: EditorTable[]; onChange: (t: EditorTable[]) => void }) => (<div>
    <button type="button" onClick={() => onChange([...tables, { key: 'n1', id: null, number: 1, seats: 4, x: 0, y: 0, width: 120, height: 120 }])}>agregar pequeña</button>
    <button type="button" onClick={() => onChange([...tables, { key: 'n2', id: null, number: 2, seats: 8, x: 200, y: 0, width: 240, height: 120 }])}>agregar grande</button>
  </div>),
}))

const floors = [{ id: 1, name: 'Piso 1' }, { id: 2, name: 'Piso 2 · Exterior' }] as unknown as Floor[]
function mount(save: jest.Mock, onCreated = jest.fn(async () => {}), onClose = jest.fn()) {
  render(<NextIntlClientProvider locale="es" messages={messages}>
    <FloorWizard open onClose={onClose} floors={floors} configId={5} onCreated={onCreated} save={save} />
  </NextIntlClientProvider>)
  return { onCreated, onClose }
}

// Recorre el asistente entero con consultas por rol: con la máquina cargada pasa de los 5 s por defecto.
jest.setTimeout(30_000)
beforeEach(() => jest.clearAllMocks())

// Falla si el asistente no propone el siguiente número de piso, si se puede avanzar sin número, si el piso se guarda
// sin mesas, si el nombre o las mesas no llegan bien al servidor, si el resumen final cuenta mal, o si «Ir a mesas»
// no abre el piso recién creado.
it('crea un piso exterior con sus mesas y muestra el resumen', async () => {
  const save = jest.fn().mockResolvedValue(77)
  const { onCreated, onClose } = mount(save)
  const number = screen.getByRole('textbox', { name: 'Número de piso' })
  expect(number).toHaveValue('3')
  fireEvent.change(number, { target: { value: ' ' } })
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  fireEvent.change(number, { target: { value: '4' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Exterior' }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  expect(screen.getByText('Piso# 4 / Tipo Exterior')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  fireEvent.click(screen.getByText('agregar pequeña'))
  fireEvent.click(screen.getByText('agregar grande'))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  const list = await screen.findByLabelText('Mesas creadas con éxito')
  expect(save).toHaveBeenCalledWith({ id: null, name: 'Piso 4 · Exterior', configId: 5, background: undefined }, [
    { id: null, number: 1, seats: 4, x: 0, y: 0, width: 120, height: 120 },
    { id: null, number: 2, seats: 8, x: 200, y: 0, width: 240, height: 120 },
  ])
  const values = within(list).getAllByRole('definition').map((d) => d.textContent)
  expect(values).toEqual(['Piso 4', '1', '1', '2'])
  fireEvent.click(screen.getByRole('button', { name: 'Ir a mesas' }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(77))
  expect(onClose).toHaveBeenCalled()
})

// Falla si un error del servidor deja el asistente colgado en «Guardando…», no avisa, o salta al paso de éxito.
it('avisa si no se pudo guardar y deja reintentar', async () => {
  const save = jest.fn().mockRejectedValue(new Error('caído'))
  mount(save)
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.click(screen.getByText('agregar pequeña'))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo guardar el plano.', tone: 'danger' })))
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  expect(screen.queryByText('Ir a mesas')).toBeNull()
})

// Falla si «Atrás» pierde lo escrito en Información, o si cerrar antes de terminar intenta abrir un piso que no existe.
it('vuelve atrás sin perder datos y cerrar a medias no abre ningún piso', () => {
  const save = jest.fn()
  const { onCreated, onClose } = mount(save)
  fireEvent.change(screen.getByRole('textbox', { name: 'Número de piso' }), { target: { value: 'Terraza' } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
  expect(screen.getByRole('textbox', { name: 'Número de piso' })).toHaveValue('Terraza')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(onClose).toHaveBeenCalled()
  expect(onCreated).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})
