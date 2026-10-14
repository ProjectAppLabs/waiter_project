import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ThresholdsForm } from '@/components/settings/SettingsForms'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const SETTINGS = { configId: 1, configName: 'Salón', waiterCanCharge: true, waiterCanEditInventory: false, alertLateMinutes: 18, alertBillMinutes: 10, roiHourCost: 20000, roiMinutesPerOrder: 11, roiBaselineHoursPer100: 18.4, roiMonthlyCost: 2740000, roiStartDate: null, tipProductId: 1 }

// Falla si el umbral se guarda como texto o si la pantalla no confirma el guardado.
it('saves the late threshold as a number and confirms', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  wrap(<ThresholdsForm initial={SETTINGS} section="alerts" onSave={onSave} />)
  fireEvent.change(screen.getByLabelText(/demorado/), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...SETTINGS, alertLateMinutes: 20 }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
})
