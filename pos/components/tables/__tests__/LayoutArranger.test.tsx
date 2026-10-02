import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'

import { LayoutArranger, type EditorTable } from '@/components/tables/LayoutArranger'
import { messages } from '@/lib/i18n/messages'

function Host({ initial = [] as EditorTable[] }) {
  const [tables, setTables] = useState<EditorTable[]>(initial)
  return <NextIntlClientProvider locale="es" messages={messages}><LayoutArranger tables={tables} onChange={setTables} /></NextIntlClientProvider>
}
const rect = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => undefined })
function mount(initial?: EditorTable[]) {
  if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: MouseEvent })
  render(<Host initial={initial} />)
  screen.getByTestId('layout-canvas').getBoundingClientRect = () => rect(300, 100, 800, 600)
}
const drop = (from: HTMLElement, x: number, y: number) => { fireEvent.pointerDown(from, { clientX: 50, clientY: 50 }); fireEvent.pointerMove(window, { clientX: x, clientY: y }); fireEvent.pointerUp(window, { clientX: x, clientY: y }) }

// Falla si soltar una plantilla en el plano no pide el nombre, o si la mesa no aparece en la cuadrícula con ese número.
it('dropping a palette template on the canvas asks for the name and places the table snapped to the grid', async () => {
  mount()
  drop(screen.getByRole('button', { name: 'Mesa pequeña' }), 300 + 60 + 165, 100 + 60 + 125)
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la mesa' }), { target: { value: '7' } })
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  expect(screen.getByRole('button', { name: 'Mover mesa 7' }).parentElement).toHaveStyle({ left: '160px', top: '120px', width: '120px', height: '120px' })
})

// Falla si "Mesa A12" no se traduce al número 12 con el aviso del servidor, o si un nombre sin número puede confirmarse.
it('reads the number out of a free-text name and refuses names without one', async () => {
  mount()
  drop(screen.getByRole('button', { name: 'Mesa grande (H)' }), 700, 300)
  const input = screen.getByRole('textbox', { name: 'Nombre de la mesa' })
  fireEvent.change(input, { target: { value: 'Ventana' } })
  expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  fireEvent.change(input, { target: { value: 'Mesa A12' } })
  expect(screen.getByText('Solo se guarda el número de mesa: se usará 12.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  expect(screen.getByRole('button', { name: 'Mover mesa 12' })).toBeInTheDocument()
})

// Falla si rotar no intercambia ancho y alto, o si arrastrar a "borrar" no quita la mesa.
it('rotates a table by 90 degrees and deletes it when dropped on the bin', async () => {
  mount([{ key: 'a', id: 5, number: 3, seats: 6, x: 40, y: 40, width: 240, height: 120 }])
  await userEvent.click(screen.getByRole('button', { name: 'Rotar mesa 3' }))
  const table = screen.getByRole('button', { name: 'Mover mesa 3' })
  expect(table.parentElement).toHaveStyle({ width: '120px', height: '240px' })
  screen.getByText('Arrastra aquí para borrar').getBoundingClientRect = () => rect(1000, 600, 130, 60)
  drop(table, 1050, 630)
  expect(screen.queryByRole('button', { name: 'Mover mesa 3' })).toBeNull()
})
