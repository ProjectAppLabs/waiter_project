import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CustomerForm } from '@/components/customers/CustomerForm'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const EMPTY = { name: '', phone: '', email: '', vat: '', idTypeId: null, street: '', city: '' }

// Falla si un cliente nuevo se guarda sin nombre, o si el tipo de documento no viaja como número.
it('requires a name and saves the identification type as a number', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<CustomerForm initial={EMPTY} isNew idTypes={[{ id: 3, name: 'Cédula de ciudadanía' }]} onSave={onSave} onClose={jest.fn()} />)
  expect(screen.getByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: ' Ana Ruiz ' } })
  fireEvent.change(screen.getByLabelText('Tipo de documento'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '1020' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...EMPTY, name: 'Ana Ruiz', idTypeId: 3, vat: '1020' }))
})
