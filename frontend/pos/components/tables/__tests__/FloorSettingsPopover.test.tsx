import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { FloorSettingsPopover } from '@/components/tables/FloorSettingsPopover'
import { messages } from '@/lib/i18n/messages'

const floors = [
  { id: 2, name: 'Terraza', active: true, tableCount: 12 },
  { id: 24, name: 'Piso 3849 · Exterior', active: false, tableCount: 2 },
  { id: 27, name: 'Piso 3925 · Exterior', active: false, tableCount: 1 },
]
const setup = () => {
  const handlers = { onClose: jest.fn(), onAdd: jest.fn(), onEdit: jest.fn(), onToggle: jest.fn(), onDelete: jest.fn() }
  render(<NextIntlClientProvider locale="es" messages={messages}><FloorSettingsPopover open floors={floors} currentFloor={floors[0]} {...handlers} /></NextIntlClientProvider>)
  return handlers
}

// Falla si los pisos dejan de separarse en activos e inactivos, si se pierde el conteo de mesas o si editar deja de
// responder al nombre accesible que usan los recorridos e2e.
it('groups floors by state with their table count and keeps edit reachable by name', () => {
  const { onEdit } = setup()
  expect(within(screen.getByRole('region', { name: 'Activos' })).getByText('12 mesas')).toBeInTheDocument()
  const inactive = screen.getByRole('region', { name: 'Inactivos' })
  expect(within(inactive).getByText('1 mesa')).toBeInTheDocument()
  fireEvent.click(within(inactive).getByRole('button', { name: 'Editar piso Piso 3849' }))
  expect(onEdit).toHaveBeenCalledWith(floors[1])
})

// Falla si un piso se borra con un solo toque, o si cancelar la confirmación lo borra igual.
it('deletes a floor only after confirming', () => {
  const { onDelete } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar piso Piso 3849' }))
  const dialog = screen.getByRole('dialog', { name: '¿Eliminar Piso 3849?' })
  expect(within(dialog).getByText(/Se eliminan el piso y sus 2 mesas/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Conservar' }))
  expect(onDelete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar piso Piso 3849' }))
  fireEvent.click(screen.getByRole('button', { name: /^Eliminar piso$/ }))
  expect(onDelete).toHaveBeenCalledWith(floors[1])
})
