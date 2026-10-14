import { fireEvent, render, screen } from '@testing-library/react'

import { DataTable } from '@/components/ui/DataTable'
import { Segmented } from '@/components/ui/Segmented'

const rows = [{ id: 1, name: 'Angus', total: 36900 }, { id: 2, name: 'Limonada', total: 9900 }]

// Falla si la tabla pierde la cabecera, una fila o el clic con la fila correcta.
it('renders header and rows and reports the clicked row', () => {
  const onRow = jest.fn()
  render(<DataTable columns={[{ key: 'n', header: 'Producto', render: (r) => r.name }, { key: 't', header: 'Total', align: 'right', render: (r) => r.total }]}
    rows={rows} rowKey={(r) => r.id} emptyText="Nada" onRowClick={onRow} />)
  expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('row', { name: /Limonada/ }))
  expect(onRow).toHaveBeenCalledWith(rows[1])
})

// Falla si el segmento activo no se anuncia o el cambio no llega.
it('segmented control marks the selected tab and emits changes', () => {
  const onChange = jest.fn()
  render(<Segmented label="Periodo" options={[{ value: 'w', label: 'Semana' }, { value: 'm', label: 'Mes' }]} value="m" onChange={onChange} />)
  expect(screen.getByRole('tab', { name: 'Mes' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Semana' }))
  expect(onChange).toHaveBeenCalledWith('w')
})
