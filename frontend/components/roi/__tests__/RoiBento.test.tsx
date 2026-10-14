import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { RoiBento } from '@/components/roi/RoiBento'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const current = { total: 128, autonomous: 86, autonomousRevenue: 3240000, hoursSaved: 312, laborSaving: 6240000, hoursPer100: 9.7, aiSales: 0, cost: 2740000, net: 3500000, roi: 2.3 }

// Falla si el bento pierde el multiplicador, el ahorro, la métrica norte o dice "sin medir" donde hay dato.
it('renders the ROI multiplier, savings, north-star bars and value sources', () => {
  wrap(<RoiBento current={current} history={[{ label: 'Julio', hoursPer100: 18.4 }, { label: 'Agosto', hoursPer100: 14.1 }, { label: 'Septiembre', hoursPer100: 9.7 }]} months={4} periodLabel="Septiembre 2026" laborChange={22} />)
  expect(screen.getByText('2,3×')).toHaveClass('text-primary')
  expect(screen.getByText('$ 6.240.000')).toBeInTheDocument()
  expect(screen.getByText('312 horas de atención que ya no se pagan')).toBeInTheDocument()
  expect(screen.getByText('9,7')).toHaveClass('text-primary')
  expect(screen.getByText('4 meses de uso')).toBeInTheDocument()
  expect(screen.getAllByText('sin medir')).toHaveLength(3)
})
