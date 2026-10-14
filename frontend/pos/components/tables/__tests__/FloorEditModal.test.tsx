import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { EditorTable } from '@/components/tables/LayoutArranger'
import { FloorEditModal } from '@/components/tables/FloorEditModal'
import { messages } from '@/lib/i18n/messages'
import type { FloorSetting } from '@/lib/services/tables'
import { toast } from '@/lib/stores/toastStore'
import type { Table } from '@/lib/types'

jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
jest.mock('@/lib/services/tables', () => ({ saveFloorLayout: jest.fn() }))
// El arrastre ya tiene sus pruebas: el sustituto mueve la primera mesa y quita la última, como haría el usuario.
jest.mock('@/components/tables/LayoutArranger', () => ({
  LayoutArranger: ({ tables, onChange, onRemove }: { tables: EditorTable[]; onChange: (t: EditorTable[]) => void; onRemove?: (t: EditorTable) => void }) => (<div>
    <span>{tables.length} mesas en el plano</span>
    <button type="button" onClick={() => onChange(tables.map((t, i) => (i === 0 ? { ...t, x: t.x + 40 } : t)))}>mover primera</button>
    <button type="button" onClick={() => { const last = tables[tables.length - 1]; onChange(tables.slice(0, -1)); onRemove?.(last) }}>quitar última</button>
    <button type="button" onClick={() => { onChange([...tables, { key: 'n', id: null, number: 9, seats: 2, x: 0, y: 300, width: 120, height: 120 }]) }}>agregar nueva</button>
  </div>),
}))

const floor: FloorSetting = { id: 3, name: 'Piso 2 · Exterior', active: true, tableCount: 2 }
const tables = [
  { id: 10, number: 1, seats: 4, x: 0, y: 0, width: 120, height: 120 },
  { id: 11, number: 2, seats: 6, x: 200, y: 0, width: 240, height: 120 },
] as unknown as Table[]
function mount(save: jest.Mock, f: FloorSetting = floor) {
  const onSaved = jest.fn(async () => {}), onClose = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}>
    <FloorEditModal open onClose={onClose} floor={f} tables={tables} configId={5} onSaved={onSaved} save={save} />
  </NextIntlClientProvider>)
  return { onSaved, onClose }
}

// Recorre el asistente entero con consultas por rol: con la máquina cargada pasa de los 5 s por defecto.
jest.setTimeout(30_000)
beforeEach(() => jest.clearAllMocks())

// Falla si el modal no arranca con el número y el tipo del piso, si no guarda los cambios de nombre, tipo y posición,
// si no manda los ids de las mesas quitadas (quedarían en el salón), o si no avisa, recarga y cierra al terminar.
it('edita información y plano, y guarda las mesas quitadas', async () => {
  const save = jest.fn().mockResolvedValue(3)
  const { onSaved, onClose } = mount(save)
  expect(screen.getByRole('textbox', { name: 'Número de piso' })).toHaveValue('2')
  expect(screen.getByRole('radio', { name: 'Exterior' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByLabelText('Sube tu plano')).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'Número de piso' }), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('radio', { name: 'Interior' }))
  fireEvent.click(screen.getByRole('tab', { name: /Organizar plano/ }))
  expect(screen.getByRole('tab', { name: /Organizar plano/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('2 mesas en el plano')).toBeInTheDocument()
  fireEvent.click(screen.getByText('mover primera'))
  fireEvent.click(screen.getByText('quitar última'))
  fireEvent.click(screen.getByText('agregar nueva'))
  fireEvent.click(screen.getByText('quitar última'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar información' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(save).toHaveBeenCalledWith({ id: 3, name: 'Piso 5', configId: 5 }, [{ id: 10, number: 1, seats: 4, x: 40, y: 0, width: 120, height: 120 }], [11])
  expect(toast).toHaveBeenCalledWith({ title: 'Plano guardado', body: 'Los cambios ya se ven en el salón.' })
  expect(onSaved).toHaveBeenCalled()
})

// Falla si un piso con nombre libre (sin número) aparece vacío al editarlo, o si se puede guardar con el número borrado.
it('un piso sin número muestra su nombre y no deja guardar vacío', () => {
  mount(jest.fn(), { id: 4, name: 'Terraza', active: true, tableCount: 0 })
  const input = screen.getByRole('textbox', { name: 'Número de piso' })
  expect(input).toHaveValue('Terraza')
  expect(screen.getByRole('radio', { name: 'Interior' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.change(input, { target: { value: '  ' } })
  expect(screen.getByRole('button', { name: 'Guardar información' })).toBeDisabled()
})

// Falla si un error al guardar cierra el modal (se perderían los cambios) o no avisa.
it('si falla el guardado avisa y no cierra', async () => {
  const save = jest.fn().mockRejectedValue(new Error('caído'))
  const { onSaved, onClose } = mount(save)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar información' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo guardar el plano.', tone: 'danger' })))
  expect(onClose).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Guardar información' })).toBeEnabled()
})
