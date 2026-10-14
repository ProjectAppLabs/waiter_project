import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { NoteDialog } from '@/components/ui/NoteDialog'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si la nota no llega recortada o si cancelar la guarda igual.
it('saves the trimmed note and cancels without saving', () => {
  const onSave = jest.fn(); const onCancel = jest.fn()
  wrap(<NoteDialog title="Nota" initial="" onSave={onSave} onCancel={onCancel} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  sin cebolla  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(onSave).toHaveBeenCalledWith('sin cebolla')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onCancel).toHaveBeenCalled()
})
