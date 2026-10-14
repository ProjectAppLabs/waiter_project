// Adaptador de datáfono. Hoy: MANUAL (decisión del usuario, 2026-09-05): el cajero digita el monto en el datáfono,
// el datáfono aprueba y el cajero lo confirma aquí. La interfaz queda fija para una semi-integración (Bold es la
// candidata con API): cambia la implementación, no la pantalla de cobro.
export interface TerminalResult { approved: boolean; reference: string }
export interface TerminalAdapter { name: 'manual' | 'bold'; charge: (amount: number) => Promise<TerminalResult> }

export function manualTerminal(ask: (amount: number) => Promise<TerminalResult>): TerminalAdapter {
  return { name: 'manual', charge: ask }
}
