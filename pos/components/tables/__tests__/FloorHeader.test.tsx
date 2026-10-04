import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { FloorInfoChip, FloorSwitcher, SelectedTableBar } from '@/components/tables/FloorHeader'
import { messages } from '@/lib/i18n/messages'

const floor = (id: number, name: string) => ({ id, name, tableIds: [], hasBackground: false })
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si el nombre del piso muestra el sufijo técnico del tipo («· Exterior») o si elegir otro piso no avisa.
it('shows floor names without the type suffix', async () => {
  const onChange = jest.fn()
  wrap(<FloorSwitcher floors={[floor(1, 'Terraza'), floor(2, 'Piso 2 · Exterior')]} activeId={1} onChange={onChange} />)
  expect(screen.getByRole('combobox', { name: 'Cambiar de piso' })).toHaveValue('1')
  expect(screen.getByRole('option', { name: 'Piso 2' })).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cambiar de piso' }), '2')
  expect(onChange).toHaveBeenCalledWith(2)
})

// Falla si con cuatro pisos o más no aparece el desplegable del kit (If Floor 4+.png).
it('switches to a dropdown with four or more floors', async () => {
  const onChange = jest.fn()
  wrap(<FloorSwitcher floors={[floor(1, 'Piso 1'), floor(2, 'Piso 2'), floor(3, 'Piso 3'), floor(4, 'Piso 4')]} activeId={1} onChange={onChange} />)
  expect(screen.queryByRole('tab')).toBeNull()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cambiar de piso' }), '4')
  expect(onChange).toHaveBeenCalledWith(4)
})

// Falla si la barra pierde el nombre de la mesa, el detalle, el aspa o el pedido nuevo: con la mesa ya
// elegida, esta barra es donde empieza el trabajo.
it('selected bar carries the table name, clear, detail and new order', async () => {
  const onDetail = jest.fn(), onClear = jest.fn(), onNewOrder = jest.fn()
  wrap(<SelectedTableBar name="11" hasReservation={false} onClear={onClear} onReservations={() => undefined} onDetail={onDetail} onNewOrder={onNewOrder} />)
  expect(screen.getByRole('toolbar')).toHaveTextContent('Mesa seleccionada:Mesa 11')
  await userEvent.click(screen.getByRole('button', { name: 'Detalle de mesa' }))
  await userEvent.click(screen.getByRole('button', { name: 'Crear pedido' }))
  await userEvent.click(screen.getByRole('button', { name: 'Quitar selección' }))
  expect([onDetail.mock.calls.length, onNewOrder.mock.calls.length, onClear.mock.calls.length]).toEqual([1, 1, 1])
})

// Falla si "Info de reserva" sale en una mesa sin reservas: un botón que abre una lista vacía es ruido.
it('offers the reservation list only when the table actually has one', async () => {
  const onReservations = jest.fn()
  const bar = (has: boolean) => <SelectedTableBar name="11" hasReservation={has} onClear={jest.fn()} onReservations={onReservations} onDetail={jest.fn()} onNewOrder={jest.fn()} />
  const { rerender } = wrap(bar(false))
  expect(screen.queryByRole('button', { name: 'Info de reserva' })).not.toBeInTheDocument()
  rerender(<NextIntlClientProvider locale="es" messages={messages}>{bar(true)}</NextIntlClientProvider>)
  await userEvent.click(screen.getByRole('button', { name: 'Info de reserva' }))
  expect(onReservations).toHaveBeenCalled()
})

// Falla si el chip del piso no muestra el tipo o esconde las mesas libres al abrirse.
it('floor chip shows the type and reveals remaining tables on tap', async () => {
  wrap(<FloorInfoChip type="outdoor" remaining={{ large: 2, small: 7 }} />)
  expect(screen.getByRole('button', { name: 'Ver detalle del piso' })).toHaveTextContent('Tipo Exterior')
  await userEvent.click(screen.getByRole('button', { name: 'Ver detalle del piso' }))
  expect(screen.getByText('Mesas pequeñas libres').nextElementSibling).toHaveTextContent('7')
})
