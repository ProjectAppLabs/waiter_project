import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { Modal } from '@/components/kit/Modal'
import { WizardSteps } from '@/components/kit/WizardSteps'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si el modal deja de cerrarse con Escape o con su botón, o si deja de anunciarse como diálogo.
it('modal is a dialog that closes with Escape and with its close button', async () => {
  const onClose = jest.fn()
  wrap(<Modal open onClose={onClose} title="Detalle del pedido">cuerpo</Modal>)
  expect(screen.getByRole('dialog', { name: 'Detalle del pedido' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})

// Falla si el modal cerrado sigue en el DOM como diálogo y tapa o confunde la pantalla.
it('modal renders nothing when closed', () => {
  wrap(<Modal open={false} onClose={() => undefined}>cuerpo</Modal>)
  expect(screen.queryByRole('dialog')).toBeNull()
})

// Falla si el paso actual deja de marcarse o los pasos hechos pierden el check.
it('wizard marks done, current and pending steps', () => {
  wrap(<WizardSteps steps={['Datos', 'Mesa', 'Menú']} current={1} />)
  expect(screen.getByText('Datos').closest('li')).toHaveAttribute('data-state', 'done')
  expect(screen.getByText('Mesa').closest('li')).toHaveAttribute('aria-current', 'step')
  expect(screen.getByText('Menú').closest('li')).toHaveAttribute('data-state', 'pending')
})
