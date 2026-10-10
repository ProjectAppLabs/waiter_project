'use client'

import { create } from 'zustand'

import { byStation, type Comanda } from '@/lib/domain/comanda'
import type { DeliveryReceipt } from '@/lib/domain/delivery'
import { readPrintSettings } from '@/lib/print/settings'

// Plan U3: la cola de impresión de comandas. `PrintHost` pinta las hojas pendientes y abre el diálogo de impresión del
// navegador (o imprime directo si el navegador corre con --kiosk-printing).
interface PrintState {
  sheets: Comanda[] | null
  // Plan D: el recibo de domicilio, con los datos del cliente para el domiciliario.
  receipt: DeliveryReceipt | null
  printComanda: (comanda: Comanda, opts?: { auto?: boolean }) => void
  printDelivery: (receipt: DeliveryReceipt) => void
  done: () => void
}

export const usePrintStore = create<PrintState>((set) => ({
  sheets: null,
  receipt: null,
  printDelivery: (receipt) => set({ receipt }),
  printComanda: (comanda, opts) => {
    const settings = readPrintSettings()
    // La impresión automática respeta las estaciones de este equipo; el botón imprime la comanda completa.
    const sheets = byStation(comanda, opts?.auto ? settings.stations : [])
    if (sheets.length) set({ sheets })
  },
  done: () => set({ sheets: null, receipt: null }),
}))
