import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { InfoStep } from '@/components/reservations/InfoStep'
import { emptyDraft, type ReservationDraft } from '@/lib/domain/reservations'
import { messages } from '@/lib/i18n/messages'

const draft = (patch: Partial<ReservationDraft> = {}): ReservationDraft => ({ ...emptyDraft(), ...patch })
const mount = (d: ReservationDraft, handlers: Partial<{ onChange: jest.Mock; onPickMoment: jest.Mock; onContinue: jest.Mock }> = {}) => {
  const props = { onChange: jest.fn(), onPickMoment: jest.fn(), onContinue: jest.fn(), ...handlers }
  render(<NextIntlClientProvider locale="es" messages={messages}><InfoStep draft={d} {...props} /></NextIntlClientProvider>)
  return props
}

// Falla si sin fecha el botón no invita a elegirla, si ya elegida no muestra el día y la hora, o si tocarlo no abre
// el selector de fecha y hora.
it('el botón de fecha y hora invita a elegir y, ya elegida, muestra el día y la hora', () => {
  const { onPickMoment } = mount(draft())
  fireEvent.click(screen.getByText('Elige fecha y hora').closest('button')!)
  expect(onPickMoment).toHaveBeenCalled()
  expect(screen.getByText(/Ese margen es para preparar la mesa/)).toBeInTheDocument()
})

// Falla si con fecha elegida el botón sigue diciendo «Elige fecha y hora», o si la ayuda del margen no dice de qué hora
// a qué hora se aparta la mesa con el margen elegido.
it('con la fecha elegida muestra el momento y la ventana en que se aparta la mesa', () => {
  mount(draft({ date: '2030-10-15', timeStart: 20, prepMinutes: '60' }))
  expect(screen.getByText(/15 de octubre · 20:00/).closest('button')).toBeInTheDocument()
  expect(screen.queryByText('Elige fecha y hora')).not.toBeInTheDocument()
  expect(screen.getByText(/La mesa deja de ofrecerse de 19:00 a 20:00/)).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '1 hora antes' })).toHaveAttribute('aria-checked', 'true')
})

// Falla si escribir nombre, correo, teléfono o notas no llega al borrador con el campo correcto, o si las personas,
// la silla de bebé o el margen elegido no se envían como cambio.
it('cada campo cambia su parte del borrador', () => {
  const { onChange } = mount(draft({ people: 2 }))
  fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@x.co' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '300' } })
  fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Cumpleaños' } })
  fireEvent.click(screen.getByRole('button', { name: 'Una persona más' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Sí' }))
  fireEvent.click(screen.getByRole('radio', { name: '2 horas antes' }))
  expect(onChange.mock.calls).toEqual([
    [{ customerName: 'Ana' }], [{ customerEmail: 'ana@x.co' }], [{ customerPhone: '300' }], [{ notes: 'Cumpleaños' }],
    [{ people: 3 }], [{ babyChair: true }], [{ prepMinutes: '120' }],
  ])
})

// Falla si se puede continuar sin nombre o sin fecha, o con un correo que no parece correo, o si con todo listo el
// botón no avanza.
it('solo deja continuar con nombre, fecha y un correo válido', () => {
  const listo = { customerName: 'Ana', date: '2030-10-15', timeStart: 20 }
  const { unmount } = render(<NextIntlClientProvider locale="es" messages={messages}><InfoStep draft={draft({ ...listo, customerEmail: 'ana@' })} onChange={jest.fn()} onPickMoment={jest.fn()} onContinue={jest.fn()} /></NextIntlClientProvider>)
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  unmount()
  const { onContinue } = mount(draft(listo))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(onContinue).toHaveBeenCalled()
})
