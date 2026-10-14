import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { AttentionFeed } from '@/components/dashboard/AttentionFeed'
import { DishStatsCard } from '@/components/dashboard/DishStatsCard'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { attentionItems, type Forecast } from '@/lib/domain/insights'
import { messages } from '@/lib/i18n/messages'

const onError = jest.fn()
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages} onError={onError}>{ui}</NextIntlClientProvider>)
afterEach(() => expect(onError).not.toHaveBeenCalled()) // next-intl no lanza por un texto que falta: pinta la clave

// Falla si algún tipo de aviso se queda sin texto, si deja de llevar a la pantalla donde se resuelve, o si el tablero
// vacío deja de decir que todo está en orden.
it('writes every kind of attention item in plain words and links it to where it is solved', () => {
  const items = attentionItems({ nowHour: 18, ready: 2, soldOut: [{ id: 7, name: 'Brownie' }],
    reservations: [{ id: 2, name: 'RV102', customer: 'Camila', timeStart: 19.5, label: '19:30', people: 7, tables: '2 y 6', depositPending: true },
      { id: 3, name: 'RV103', customer: 'Andrés', timeStart: 17.75, label: '17:45', people: 2, tables: '4', depositPending: false }],
    ingredients: [{ id: 1, name: 'Queso', level: 'low', stock: 4, min: 5, uom: 'kg' }, { id: 3, name: 'Tomate', level: 'empty', stock: 0, min: 5, uom: 'kg' }] })
  const view = wrap(<AttentionFeed items={items} loaded />)
  const feed = within(screen.getByRole('region', { name: 'Para atender ahora' }))
  expect(feed.getByText('2 platos listos sin entregar').closest('a')).toHaveAttribute('href', '/pedidos')
  expect(feed.getByText('Ya debería haber llegado: Andrés')).toBeInTheDocument()
  expect(feed.getByText('Reserva en 90 min: Camila').closest('a')).toHaveAttribute('href', '/reservas')
  expect(feed.getByText('19:30 · 7 personas · mesa 2 y 6')).toBeInTheDocument()
  expect(feed.getByText('Anticipo sin pagar: Camila')).toBeInTheDocument()
  expect(feed.getByText('Se acabó: Tomate').closest('a')).toHaveAttribute('href', '/inventario')
  expect(feed.getByText('Quedan 4 kg; el mínimo es 5.')).toBeInTheDocument()
  expect(feed.getByText('Agotado en la carta: Brownie')).toBeInTheDocument()
  view.unmount()
  wrap(<AttentionFeed items={[]} loaded />)
  expect(screen.getByText('Todo en orden')).toBeInTheDocument()
})

const forecast = (patch: Partial<Forecast>): Forecast => ({ ready: true, salesDays: 40, month: '2026-10-01', total: 4200000, low: 3780000, high: 4620000, orders: 84, trend: 1.1,
  weekly: [{ week: '2026-08-31', total: 900000 }, { week: '2026-09-07', total: 1000000 }], ...patch })

// Falla si la predicción se muestra como una cifra exacta (sin rango ni de dónde sale), o si con poco historial se
// inventa un número en vez de decir cuánto falta.
it('shows the forecast with its range and method, and asks for more history when there is not enough', () => {
  const view = wrap(<ForecastCard forecast={forecast({})} loaded />)
  const card = within(screen.getByRole('region', { name: 'Venta esperada en octubre' }))
  expect(card.getByText('$ 4.200.000')).toBeInTheDocument()
  expect(card.getByText('Entre $ 3.780.000 y $ 4.620.000')).toBeInTheDocument()
  expect(card.getByText('Vienes 10 % arriba de las cuatro semanas anteriores')).toBeInTheDocument()
  expect(card.getByText(/Es una estimación, no una meta/)).toBeInTheDocument()
  view.unmount()
  wrap(<ForecastCard forecast={forecast({ ready: false, salesDays: 8, total: 0 })} loaded />)
  expect(screen.getByText('Todavía no hay historial suficiente')).toBeInTheDocument()
  expect(screen.getByText(/Llevas 8 días con ventas registradas. Con 14/)).toBeInTheDocument()
  expect(screen.queryByText(/\$ 0/)).not.toBeInTheDocument()
})

// Falla si un plato sin ventas deja de decirse con palabras, o si la subida frente al periodo anterior no se muestra.
it('lists the most and least ordered dishes', () => {
  const dish = (productId: number, name: string, qty: number, change: number | null) => ({ productId, templateId: productId, name, qty, amount: qty * 1000, change, nextMonth: Math.round(qty * 31 / 28) })
  wrap(<DishStatsCard loaded windowDays={28} stats={{ totalQty: 70, top: [dish(1, 'Hamburguesa', 56, 1)], bottom: [dish(3, 'Ensalada', 0, null)] }} />)
  const top = within(screen.getByText('Más pedidos').closest('div')!.parentElement!)
  expect(top.getByText('56 und')).toBeInTheDocument()
  expect(top.getByText('100 %')).toBeInTheDocument()
  expect(top.getByText('≈ 62 el mes que viene, al ritmo actual')).toBeInTheDocument()
  expect(screen.getByText('Ninguno')).toBeInTheDocument()
})
