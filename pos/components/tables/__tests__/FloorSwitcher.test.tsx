import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { FloorSwitcher } from '@/components/tables/FloorHeader'
import { messages } from '@/lib/i18n/messages'
import { useFloorStore } from '@/lib/stores/floorStore'
import type { Floor } from '@/lib/types'

const floor = (id: number, name: string): Floor => ({ id, name, tableIds: [], hasBackground: false } as unknown as Floor)
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si el selector no marca el piso actual, pierde nombres completos o no avisa al elegir otro.
it('shows the current floor and lets the user select another', () => {
  const onChange = jest.fn()
  wrap(<FloorSwitcher floors={[floor(1, 'Terraza'), floor(2, 'Salón principal')]} activeId={1} onChange={onChange} />)
  const picker = screen.getByRole('combobox', { name: 'Cambiar de piso' })
  expect(picker).toHaveValue('1')
  expect(screen.getByRole('option', { name: 'Salón principal' })).toBeInTheDocument()
  fireEvent.change(picker, { target: { value: '2' } })
  expect(onChange).toHaveBeenCalledWith(2)
})

// Falla si en la pantalla partida el selector vuelve a pestañas o pierde el piso elegido.
it('uses the same labelled dropdown in a compact pane', () => {
  const floors = [1, 2, 3].map((n) => floor(n, `Piso ${n}`))
  const onChange = jest.fn()
  wrap(<FloorSwitcher compact floors={floors} activeId={2} onChange={onChange} />)
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  const picker = screen.getByRole('combobox', { name: 'Cambiar de piso' })
  expect(picker).toHaveValue('2')
  fireEvent.change(picker, { target: { value: '3' } })
  expect(onChange).toHaveBeenCalledWith(3)
})

// Falla si la pantalla partida no se recuerda en esta tablet, o si cambiar el piso de cualquiera de los dos paneles
// deja elegida una mesa que ya no está a la vista.
it('remembers the split preference and clears the chosen table when either pane changes floor', () => {
  useFloorStore.getState().setSplit(true)
  expect(localStorage.getItem('waiter.salonSplit')).toBe('1')
  useFloorStore.getState().selectTable(7)
  useFloorStore.getState().setSecondFloor(2)
  expect(useFloorStore.getState()).toMatchObject({ split: true, secondFloorId: 2, selectedTableId: null })
  useFloorStore.getState().setSplit(false)
  expect(localStorage.getItem('waiter.salonSplit')).toBe('0')
})

// Falla si con veinte pisos se crean veinte pestañas o alguno queda fuera del desplegable.
it('keeps all twenty floors selectable without creating twenty tabs', () => {
  const onChange = jest.fn()
  wrap(<FloorSwitcher floors={Array.from({ length: 20 }, (_, i) => floor(i + 1, `Piso ${i + 1}`))} activeId={1} onChange={onChange} />)
  const picker = screen.getByRole('combobox', { name: 'Cambiar de piso' })
  expect(screen.getAllByRole('option')).toHaveLength(20)
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  fireEvent.change(picker, { target: { value: '20' } })
  expect(onChange).toHaveBeenCalledWith(20)
})

// Falla si con un solo piso se ofrece un selector inútil en vez de mostrarlo como piso actual.
it('shows a single floor as the current location without offering a false choice', () => {
  wrap(<FloorSwitcher floors={[floor(1, 'Terraza')]} activeId={1} onChange={jest.fn()} />)
  expect(screen.getByText('Piso actual')).toBeInTheDocument()
  expect(screen.getByText('Terraza')).toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})
