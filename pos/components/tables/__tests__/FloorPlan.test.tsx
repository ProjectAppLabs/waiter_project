import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { FloorPlan } from '@/components/tables/FloorPlan'
import type { TableView } from '@/lib/domain/tableState'
import { messages } from '@/lib/i18n/messages'

const geo = { floorId: 1, shape: 'square' as const, color: null, width: 110, height: 110 }
const view = (id: number, state: TableView['state'], orderId: number | null = null): TableView =>
  ({ table: { id, number: id, seats: 4, x: id * 150, y: 40, ...geo }, state, total: 0, tax: 0, orderId, startedAt: null, waiter: null, callSince: null })
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si la mesa libre pierde el estilo "disponible" del kit, si la ocupada no sale naranja con su Order#, o si el
// nombre accesible deja de decir el estado (los E2E y el lector de pantalla dependen de él).
it('paints available and unavailable tables with the kit colors, code and state pill', () => {
  wrap(<FloorPlan views={[view(1, 'free'), view(2, 'kitchen', 9)]} selectedId={null} onSelect={() => undefined} codeFor={() => 'DI104'} />)
  // Azul, no blanco: sobre el lienzo casi blanco una mesa libre no se distinguía del fondo.
  expect(screen.getByRole('button', { name: 'Mesa 1: Disponible' })).toHaveClass('bg-primary')
  const busy = screen.getByRole('button', { name: 'Mesa 2: En progreso' })
  expect(busy).toHaveClass('bg-progress')
  expect(busy).toHaveTextContent('DI104')
  expect(busy).toHaveTextContent('En progreso')
})

// Falla si la mesa se pinta fuera de su posición de Odoo o si la seleccionada pierde el halo del kit.
it('places each table at its Odoo position and marks the selected one', async () => {
  const onSelect = jest.fn()
  wrap(<FloorPlan views={[view(1, 'free'), view(2, 'served', 9)]} selectedId={2} onSelect={onSelect} />)
  expect(screen.getByRole('button', { name: 'Mesa 1: Disponible' }).parentElement).toHaveStyle({ left: '150px', top: '40px', width: '110px' })
  expect(screen.getByRole('button', { name: 'Mesa 2: Servido' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Mesa 1: Disponible' }))
  expect(onSelect).toHaveBeenCalledWith(1)
})

// Falla si, al elegir la mesa nueva para mover un pedido, una mesa ocupada sigue pudiendo tocarse.
it('only lets available tables be picked while choosing a destination', () => {
  wrap(<FloorPlan views={[view(1, 'free'), view(2, 'occupied', 9)]} selectedId={null} onSelect={() => undefined} pickFree />)
  expect(screen.getByRole('button', { name: 'Mesa 1: Disponible' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Mesa 2: Sin enviar a cocina' })).toBeDisabled()
})

it('shows the kit empty state when the floor has no tables', () => {
  wrap(<FloorPlan views={[]} selectedId={null} onSelect={() => undefined} />)
  expect(screen.getByText('Este piso no tiene mesas')).toBeInTheDocument()
})

// Falla si una mesa libre con reserva deja de pintarse en tinta con su hora, o si esa mesa se puede elegir como
// destino al mover un pedido (una reserva la ocupa igual que un pedido).
it('paints a free table with a booking as reserved, with the hour of the kit', () => {
  const booking = { id: 5, name: 'Rv001', customerName: 'Eva', people: 2, babyChair: false, state: 'confirmed', date: '2026-09-07', timeStart: 17, timeEnd: 18.5, label: '17:00', timeLabel: '17:00 – 18:30', tableId: 1 }
  wrap(<FloorPlan views={[view(1, 'free')]} selectedId={null} onSelect={() => undefined} reserved={{ 1: booking }} pickFree />)
  const table = screen.getByRole('button', { name: 'Mesa 1: Reservada' })
  expect(table).toHaveClass('bg-reserved')
  expect(table).toHaveTextContent('17:00')
  expect(table).toBeDisabled()
})


it('labels an occupied table without kitchen dispatch as unsent', () => {
  wrap(<FloorPlan views={[view(2, 'occupied', 9)]} selectedId={null} onSelect={() => undefined} />)
  expect(screen.getByRole('button', { name: 'Mesa 2: Sin enviar a cocina' })).toBeEnabled()
  expect(screen.queryByText('En progreso')).not.toBeInTheDocument()
})


it('opens the table detail on double click and exposes simultaneous service notices', async () => {
  const onOpenTable = jest.fn()
  wrap(<FloorPlan views={[{ ...view(2, 'assist', 9), notices: ['ready', 'unsent', 'assist'] }]} selectedId={null} onSelect={jest.fn()} onOpenTable={onOpenTable} />)
  const table = screen.getByRole('button', { name: /Mesa 2: Pide mesero.*Listo para servir.*Sin enviar a cocina/ })
  expect(within(table).getByTitle('Pide mesero')).toBeInTheDocument()
  expect(within(table).getByTitle('Sin enviar a cocina')).toBeInTheDocument()
  await userEvent.dblClick(table)
  expect(onOpenTable).toHaveBeenCalledWith(2)
})

// Falla si arrastrar con el ratón no mueve el plano cuando cabe entero en pantalla (se veía la mano y nada se movía),
// si arrastrar desde una mesa la abre al soltar, o si la rueda pulsada no arrastra. Un clic corto sigue abriendo la mesa.
it('pans the plan with the mouse from a table or with the wheel pressed, without opening the table', async () => {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true })
  HTMLElement.prototype.setPointerCapture = jest.fn()
  HTMLElement.prototype.scrollTo = jest.fn()
  // jsdom no maqueta: el visor mide lo que mediría una tablet apaisada.
  const size = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  const onSelect = jest.fn()
  wrap(<FloorPlan views={[view(1, 'free')]} selectedId={null} onSelect={onSelect} />)
  const plan = screen.getByTestId('floor-plan'), canvas = screen.getByTestId('plan-canvas'), table = screen.getByRole('button', { name: 'Mesa 1: Disponible' })
  fireEvent.pointerDown(table, { button: 0, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(plan, { clientX: 150, clientY: 170 })
  expect(plan).toHaveClass('cursor-grabbing')
  fireEvent.pointerUp(plan)
  fireEvent.click(table)
  expect(onSelect).not.toHaveBeenCalled()
  const moved = canvas.style.transform
  expect(moved).toMatch(/^translate\(/)
  fireEvent.pointerDown(plan, { button: 1, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(plan, { clientX: 180, clientY: 200 })
  fireEvent.pointerUp(plan)
  expect(canvas.style.transform).not.toBe(moved)
  await userEvent.click(screen.getByRole('button', { name: /Ver todo/ }))
  expect(canvas.style.transform).toBe('')
  await userEvent.click(table)
  expect(onSelect).toHaveBeenCalledWith(1)
  size.mockRestore(); height.mockRestore()
})

// Falla si el salón no dibuja las piezas del plano o si una pieza tapa el clic de la mesa que tiene encima.
it('draws the decor pieces behind the tables without blocking them', async () => {
  const onSelect = jest.fn()
  const plan = { id: 1, name: 'Sala', revision: 0, tables: [], walls: [], zones: [], decor: [{ id: 'd', asset: 'plant' as const, rotation: 0 as const, x: 150, y: 40, width: 110, height: 110 }] }
  const { container } = wrap(<FloorPlan plan={plan} views={[view(1, 'free')]} selectedId={null} onSelect={onSelect} />)
  const piece = container.querySelector('svg[aria-hidden].pointer-events-none')
  expect(piece).toHaveStyle({ left: '150px', top: '40px', width: '110px' })
  await userEvent.click(screen.getByRole('button', { name: 'Mesa 1: Disponible' }))
  expect(onSelect).toHaveBeenCalledWith(1)
})
