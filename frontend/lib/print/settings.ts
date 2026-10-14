// Plan U3: ajustes de impresión de ESTE equipo. Cada equipo tiene su impresora (la caja, la de cocina, la de la barra),
// así que se guardan en el navegador y no en el servidor.
export type Paper = '80' | '58'
export interface PrintSettings {
  paper: Paper
  // Imprimir la comanda en el acto al enviar a cocina.
  autoComanda: boolean
  // Estaciones que imprime este equipo; vacío: todas.
  stations: string[]
  receiptCopies: number
}

export const DEFAULT_PRINT: PrintSettings = { paper: '80', autoComanda: false, stations: [], receiptCopies: 1 }
const KEY = 'waiter.print'

export function readPrintSettings(): PrintSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PrintSettings>
    return {
      paper: raw.paper === '58' ? '58' : '80',
      autoComanda: raw.autoComanda === true,
      stations: Array.isArray(raw.stations) ? raw.stations.filter((s): s is string => typeof s === 'string') : [],
      receiptCopies: Number.isInteger(raw.receiptCopies) && raw.receiptCopies! >= 1 && raw.receiptCopies! <= 3 ? raw.receiptCopies! : 1,
    }
  } catch { return DEFAULT_PRINT }
}

export function writePrintSettings(settings: PrintSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* sin almacenamiento: quedan los de siempre */ }
}

// El recibo con las copias de este equipo. Con --kiosk-printing cada copia sale directo; sin él, el navegador pregunta
// una vez por copia.
export function printReceipt(): void {
  for (let i = 0; i < readPrintSettings().receiptCopies; i++) window.print()
}
