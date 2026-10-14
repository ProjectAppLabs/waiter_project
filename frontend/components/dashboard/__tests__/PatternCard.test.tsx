import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { PatternCard } from '@/components/dashboard/PatternCard'
import type { WeekdayAverage } from '@/lib/domain/insights'
import { messages } from '@/lib/i18n/messages'

const days = (totals: number[]): WeekdayAverage[] => totals.map((total, weekday) => ({ weekday, total, orders: total ? 10 : 0, days: 4 }))
const mount = (props: Partial<React.ComponentProps<typeof PatternCard>> = {}) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><PatternCard weekdays={days([0, 0, 0, 0, 0, 0, 0])} hours={[]} loaded {...props} /></NextIntlClientProvider>)

// Falla si mientras se suman las ventas no se anuncia que está cargando.
it('anuncia que está sumando ventas', () => {
  mount({ loaded: false })
  expect(screen.getByRole('region', { name: 'Cuándo se vende' })).toHaveTextContent('Sumando ventas…')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

// Falla si sin ventas se pintan barras vacías en lugar de decirlo.
it('sin ventas lo dice', () => {
  mount()
  expect(screen.getByText('Aún no hay ventas para ver un patrón.')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

// Falla si el gráfico de días no nombra el día más fuerte, si no lo resalta, o si una barra no lleva su venta.
it('resalta el día más fuerte de la semana', () => {
  mount({ weekdays: days([100000, 80000, 90000, 120000, 300000, 450000, 0]) })
  const chart = screen.getByRole('img', { name: 'Venta promedio por día de la semana; el día más fuerte es sábado' })
  const bars = chart.querySelectorAll('span')
  expect(bars).toHaveLength(7)
  expect(bars[5]).toHaveClass('bg-primary'); expect(bars[0]).toHaveClass('bg-primary/35')
  expect(bars[5]).toHaveAttribute('title', '$ 450.000')
  expect(bars[5]).toHaveStyle({ height: '100%' })
  // Un día sin venta conserva una barra mínima visible.
  expect(bars[6]).toHaveStyle({ height: '3%' })
  expect(screen.queryByText('Horas pico')).not.toBeInTheDocument()
})

// Falla si las horas pico no cubren el tramo completo entre la primera y la última hora, si no resaltan la más fuerte,
// o si una hora sin ventas recibe un porcentaje.
it('pinta las horas pico con el tramo completo y la hora más fuerte', () => {
  mount({ weekdays: days([1, 0, 0, 0, 0, 0, 0]), hours: [{ hour: 12, share: 0.3, orders: 30 }, { hour: 13, share: 0.5, orders: 50 }, { hour: 15, share: 0.2, orders: 20 }] })
  const chart = screen.getByRole('img', { name: 'Ventas por hora del día; la hora más fuerte son las 13' })
  const bars = chart.querySelectorAll('span')
  expect(bars).toHaveLength(4)
  expect(bars[1]).toHaveClass('bg-primary'); expect(bars[1]).toHaveAttribute('title', '13:00 · 50 % de la venta')
  expect(bars[2]).not.toHaveAttribute('title'); expect(bars[2]).toHaveStyle({ height: '2%' })
  // Las etiquetas van una hora sí y otra no, empezando por la primera.
  expect(screen.getByText('12')).toBeInTheDocument(); expect(screen.getByText('14')).toBeInTheDocument()
  expect(screen.queryByText('13')).not.toBeInTheDocument()
})
