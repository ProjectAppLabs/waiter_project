'use client'

import { create } from 'zustand'

import { byStation, type Comanda } from '@/lib/domain/comanda'
import { readPrintSettings } from '@/lib/print/settings'

// Plan U3: la cola de impresión de comandas. `PrintHost` pinta las hojas pendientes y abre el diálogo de impresión del
// navegador (o imprime directo si el navegador corre con --kiosk-printing).
interface PrintState {
  sheets: Comanda[] | null
  printComanda: (comanda: Comanda, opts?: { auto?: boolean }) => void
  done: () => void
}

export const usePrintStore = create<PrintState>((set) => ({
  sheets: null,
  printComanda: (comanda, opts) => {
    const settings = readPrintSettings()
    // La impresión automática respeta las estaciones de este equipo; el botón imprime la comanda completa.
    const sheets = byStation(comanda, opts?.auto ? settings.stations : [])
    if (sheets.length) set({ sheets })
  },
  done: () => set({ sheets: null }),
}))
