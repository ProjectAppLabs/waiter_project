import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { KdsHeader } from '@/components/kds/KdsHeader'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si las pestañas pierden su conteo o el tiempo medio no se formatea como cronómetro.
it('renders station tabs with counts and the average preparation time', () => {
  const onTab = jest.fn()
  wrap(<KdsHeader tabs={['all', 'Parrilla', 'late']} counts={{ all: 7, Parrilla: 3, late: 2 }} active="all" onTab={onTab} avgSeconds={680} now={Date.now()} />)
  expect(screen.getByRole('button', { name: /Todas 7/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /Demorados 2/ })).toBeInTheDocument()
  expect(screen.getByText('11:20')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Parrilla 3/ }))
  expect(onTab).toHaveBeenCalledWith('Parrilla')
})
