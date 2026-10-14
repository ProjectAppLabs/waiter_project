import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel'
import { DepositPanel } from '@/components/reservations/DepositPanel'
import { SummaryStep } from '@/components/reservations/SummaryStep'
import { TableStep } from '@/components/reservations/TableStep'
import { emptyDraft, type ReservationDraft } from '@/lib/domain/reservations'
import { messages } from '@/lib/i18n/messages'
import { readPlan } from '@/lib/services/floorPlan'
import { markDepositPaid, setDeposit, type AvailableTable, type ReservationDetail } from '@/lib/services/reservations'

jest.mock('@/lib/services/floorPlan', () => ({ readPlan: jest.fn() }))
jest.mock('@/lib/services/reservations', () => ({ markDepositPaid: jest.fn(), setDeposit: jest.fn() }))
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const totals = { subtotal: 0, tax: 0, total: 0, taxNames: [] }
const draft = (patch: Partial<ReservationDraft> = {}): ReservationDraft => ({ ...emptyDraft(), customerName: 'Ana', date: '2030-10-15', timeStart: 19.5, tableIds: [1], ...patch })

// Falla si reservar vuelve a exigir platos, o si «Crear pedido» (que usa el mismo panel) deja de exigirlos.
it('lets a reservation continue without dishes while an order still needs them', () => {
  const onContinue = jest.fn()
  const panel = (emptyLabel?: string) => <OrderDetailsPanel lines={[]} totals={totals} onReset={jest.fn()} onQty={jest.fn()} onEdit={jest.fn()} onRemove={jest.fn()} onContinue={onContinue} emptyLabel={emptyLabel} />
  const view = wrap(panel())
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  view.rerender(<NextIntlClientProvider locale="es" messages={messages}>{panel('Continuar sin platos')}</NextIntlClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar sin platos' }))
  expect(onContinue).toHaveBeenCalled()
})

// Falla si el costo deja de venir activo, si se puede crear la reserva con el costo activo y vacío, o si quitarlo
// deja de ser una acción explícita que desbloquea el botón.
it('asks for the reservation cost by default and only skips it when removed on purpose', () => {
  const onChange = jest.fn()
  const view = wrap(<SummaryStep draft={draft()} tableNumbers={[4]} lines={[]} totals={totals} busy={false} onCreate={jest.fn()} onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Crear reserva' })).toBeDisabled()
  expect(screen.getByText('Escribe el valor del anticipo o quita el costo.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Valor del anticipo (COP)'), { target: { value: '50000' } })
  expect(onChange).toHaveBeenCalledWith({ depositAmount: 50000 })
  fireEvent.click(screen.getByRole('button', { name: 'Quitar el costo' }))
  expect(onChange).toHaveBeenCalledWith({ depositEnabled: false })
  view.rerender(<NextIntlClientProvider locale="es" messages={messages}><SummaryStep draft={draft({ depositEnabled: false })} tableNumbers={[4]} lines={[]} totals={totals} busy={false} onCreate={jest.fn()} onChange={onChange} /></NextIntlClientProvider>)
  expect(screen.getByText('Esta reserva no tiene costo.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Crear reserva' })).toBeEnabled()
})

// Falla si el paso de mesa deja de dibujar el plano real del piso, si una mesa reservada se puede elegir, si una mesa
// pequeña deja de poder sumarse a otra para sentar a un grupo grande, o si se puede continuar sin que el grupo quepa.
it('draws the real floor plan and joins free tables until the party fits', async () => {
  jest.mocked(readPlan).mockResolvedValue({ id: 2, name: 'Terraza', revision: 1, tables: [], walls: [{ id: 'w', x: 0, y: 300, width: 400, height: 20, color: '#9a3412' }], zones: [{ id: 'z', name: 'Jardín', color: '#10b981', x: 0, y: 0, width: 400, height: 280 }] })
  const table = (id: number, number: number, seats: number, x: number) => ({ id, number, floorId: 2, seats, x, y: 40, width: 110, height: 110, shape: 'square' as const, color: null })
  const available = (id: number, tableNumber: number, seats: number, status: AvailableTable['status'], reservedAt: string | false = false): AvailableTable => ({ id, tableNumber, name: `Mesa ${tableNumber}`, seats, floorId: 2, floorName: 'Terraza', shape: 'square', status, available: status === 'available', reservedAt })
  const onSelect = jest.fn(), onContinue = jest.fn()
  const floors = [{ id: 2, name: 'Terraza', tableIds: [1, 2, 3], hasBackground: false } as never]
  const floorTables = [table(1, 1, 4, 40), table(2, 2, 4, 200), table(3, 3, 2, 360)]
  // El servidor marca «unavailable» la mesa 3 porque sola no sienta a 6: aquí igual se puede sumar.
  const tables = [available(1, 1, 4, 'available'), available(2, 2, 4, 'reserved', '19:00'), available(3, 3, 2, 'unavailable')]
  const step = (selected: number[]) => <TableStep floors={floors} floorTables={floorTables} tables={tables} people={6} date="2030-10-15" time={19.5} selected={selected} onSelect={onSelect} onContinue={onContinue} />
  const { rerender } = wrap(step([]))
  expect(await screen.findByText('Jardín')).toBeInTheDocument()
  expect(screen.getByText(/Si el grupo de 6 no cabe en una, toca varias/)).toBeInTheDocument()
  // La mesa 3 no sienta sola a 6, pero está libre y se puede juntar: cuenta como libre (antes decía «1 mesa libre»).
  expect(screen.getByText('2 mesas libres en este piso')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Mesa 2/ }))
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^Mesa 1/ }))
  expect(onSelect).toHaveBeenLastCalledWith([1])

  rerender(<NextIntlClientProvider locale="es" messages={messages}>{step([1])}</NextIntlClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Faltan 2 puestos: van 4 de 6')
  expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /^Mesa 3/ }))
  expect(onSelect).toHaveBeenLastCalledWith([1, 3])

  rerender(<NextIntlClientProvider locale="es" messages={messages}>{step([1, 3])}</NextIntlClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('6 puestos para 6')
  fireEvent.click(screen.getByRole('button', { name: 'Quitar la mesa 3' }))
  expect(onSelect).toHaveBeenLastCalledWith([1])
  fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
  expect(onContinue).toHaveBeenCalled()
})

const reservation = (patch: Partial<ReservationDetail> = {}): ReservationDetail => ({
  id: 7, name: 'R-0007', customerName: 'Ana Ruiz', people: 4, babyChair: false, state: 'confirmed', date: '2030-10-15', timeStart: 19.5, timeEnd: 21, label: '19:30', timeLabel: '19:30 – 21:00',
  tableId: 1, tableNumber: 4, tableNumbers: [4], tableIds: [1], prepMinutes: '30', floorId: 2, floorName: 'Terraza', customerEmail: 'ana@example.com', customerPhone: '3001234567', notes: '', amountTotal: 0, lines: [],
  depositAmount: 50000, depositState: 'pending', depositReference: '', depositPaidAt: '', payToken: 'tok', payUrl: 'https://menu.test/burger-house/poblado/reserva/tok', restaurantName: 'Burger House', ...patch,
})

// Falla si el enlace de pago no se puede copiar ni enviar por WhatsApp o correo con el mensaje armado, si el panel
// aparece en reservas sin costo, o si un anticipo pagado sigue ofreciendo cobrar.
it('shares the payment link three ways, settles it by hand and hides once paid or free', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  const onChanged = jest.fn()
  jest.mocked(markDepositPaid).mockResolvedValue(reservation({ depositState: 'paid', depositReference: 'Registrado en el POS', depositPaidAt: '2030-10-01 15:00:00' }))
  jest.mocked(setDeposit).mockResolvedValue(reservation({ depositState: 'none', depositAmount: 0 }))
  const view = wrap(<DepositPanel reservation={reservation()} onChanged={onChanged} />)
  const panel = screen.getByRole('region', { name: 'Anticipo' })
  expect(within(panel).getByText('Pendiente de pago')).toBeInTheDocument()
  fireEvent.click(within(panel).getByRole('button', { name: 'Copiar enlace' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://menu.test/burger-house/poblado/reserva/tok'))
  const whatsapp = within(panel).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!
  expect(whatsapp.startsWith('https://wa.me/573001234567?text=')).toBe(true)
  expect(decodeURIComponent(whatsapp)).toContain('https://menu.test/burger-house/poblado/reserva/tok')
  expect(within(panel).getByRole('link', { name: 'Correo' }).getAttribute('href')).toMatch(/^mailto:ana%40example\.com\?subject=/)
  fireEvent.click(within(panel).getByRole('button', { name: 'Registrar pago por fuera' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago por fuera' }))
  await waitFor(() => expect(markDepositPaid).toHaveBeenCalledWith(7))
  expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ depositState: 'paid' }))
  view.rerender(<NextIntlClientProvider locale="es" messages={messages}><DepositPanel reservation={reservation({ depositState: 'paid', depositReference: 'waiter-abc', depositPaidAt: '2030-10-01 15:00:00' })} onChanged={onChanged} /></NextIntlClientProvider>)
  expect(screen.getByText('Referencia: waiter-abc')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument()
  view.rerender(<NextIntlClientProvider locale="es" messages={messages}><DepositPanel reservation={reservation({ depositState: 'none', depositAmount: 0 })} onChanged={onChanged} /></NextIntlClientProvider>)
  expect(screen.queryByRole('region', { name: 'Anticipo' })).not.toBeInTheDocument()
})
