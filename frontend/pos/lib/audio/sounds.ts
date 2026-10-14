// Sistema de sonido Waiter (documento "Waiter Sonidos"): ocho sonidos sintetizados con Web Audio,
// cero archivos. Reglas: un sonido a la vez (gana el más urgente, el otro espera 400 ms); solo
// "crítico" se repite; volumen por estación; silenciar es un botón visible, no un ajuste enterrado.
export type SoundId = 'tap' | 'ticket' | 'demora' | 'critico' | 'listo' | 'llama' | 'cobro' | 'error'
export type Station = 'kds' | 'tablet' | 'caja'

interface Note { hz: number; t: number; d: number; g: number; glide?: number }
const SOUNDS: Record<SoundId, { dur: number; notes: Note[] }> = {
  ticket: { dur: 0.98, notes: [{ hz: 660, t: 0, d: 0.16, g: 0.9 }, { hz: 990, t: 0.11, d: 0.24, g: 0.85 }, { hz: 660, t: 0.44, d: 0.16, g: 0.8 }, { hz: 990, t: 0.55, d: 0.34, g: 0.9 }] },
  listo: { dur: 1.16, notes: [{ hz: 523, t: 0, d: 0.14, g: 0.75 }, { hz: 659, t: 0.1, d: 0.14, g: 0.8 }, { hz: 880, t: 0.2, d: 0.2, g: 0.85 }, { hz: 1046, t: 0.32, d: 0.38, g: 0.9 }, { hz: 880, t: 0.66, d: 0.12, g: 0.4 }, { hz: 1046, t: 0.76, d: 0.4, g: 0.7 }] },
  demora: { dur: 0.9, notes: [{ hz: 233, t: 0, d: 0.24, g: 1 }, { hz: 349, t: 0.02, d: 0.14, g: 0.32 }, { hz: 233, t: 0.28, d: 0.24, g: 0.9 }, { hz: 349, t: 0.3, d: 0.14, g: 0.28 }, { hz: 233, t: 0.56, d: 0.3, g: 0.85 }] },
  critico: { dur: 1.4, notes: [{ hz: 220, t: 0, d: 0.2, g: 1 }, { hz: 330, t: 0.02, d: 0.12, g: 0.3 }, { hz: 165, t: 0.22, d: 0.3, g: 1 }, { hz: 220, t: 0.7, d: 0.2, g: 1 }, { hz: 330, t: 0.72, d: 0.12, g: 0.3 }, { hz: 165, t: 0.92, d: 0.42, g: 1 }] },
  llama: { dur: 0.64, notes: [{ hz: 784, t: 0, d: 0.28, g: 0.55 }, { hz: 1046, t: 0.02, d: 0.22, g: 0.28 }, { hz: 784, t: 0.28, d: 0.32, g: 0.5 }] },
  cobro: { dur: 0.54, notes: [{ hz: 988, t: 0, d: 0.12, g: 0.8 }, { hz: 1319, t: 0.08, d: 0.34, g: 0.85 }, { hz: 1976, t: 0.08, d: 0.18, g: 0.22 }] },
  error: { dur: 0.28, notes: [{ hz: 392, t: 0, d: 0.2, g: 0.9, glide: 196 }] },
  tap: { dur: 0.08, notes: [{ hz: 1400, t: 0, d: 0.045, g: 0.5 }] },
}
// Más urgente gana: crítico > demora > error > ticket > llama > listo > cobro > tap.
export const PRIORITY: Record<SoundId, number> = { critico: 8, demora: 7, error: 6, ticket: 5, llama: 4, listo: 3, cobro: 2, tap: 1 }
const VOLUME: Record<Station, number> = { kds: 0.8, tablet: 0.55, caja: 0.35 }
const GAP = 0.4

let ctx: AudioContext | null = null
let station: Station = 'tablet'
let muted = false
let busyUntil = 0
let current: SoundId | null = null

export function setStation(s: Station): void { station = s }
export function setMuted(m: boolean): void { muted = m }

function live(): AudioContext | null {
  try {
    ctx ??= new window.AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// Timbre "cálido": triángulo con un armónico senoidal suave, como en el documento de diseño.
function schedule(ac: AudioContext, id: SoundId, t0: number, master: number): void {
  SOUNDS[id].notes.forEach((n) => {
    const t = t0 + n.t
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(n.hz, t)
    if (n.glide) osc.frequency.exponentialRampToValueAtTime(n.glide, t + n.d)
    const peak = Math.max(0.0001, n.g * master * 0.6)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.d)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + n.d * 1.4 + 0.02)
    const h = ac.createOscillator()
    const hg = ac.createGain()
    h.type = 'sine'
    h.frequency.setValueAtTime(n.hz * 2, t)
    hg.gain.setValueAtTime(0.0001, t)
    hg.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.22), t + 0.006)
    hg.gain.exponentialRampToValueAtTime(0.0001, t + n.d * 0.7)
    h.connect(hg).connect(ac.destination)
    h.start(t)
    h.stop(t + n.d + 0.02)
  })
}

// Decide cuándo suena algo nuevo dado lo que ya suena: ahora si es más urgente, si no al terminar + 400 ms.
export function startTime(now: number, id: SoundId): number {
  if (now >= busyUntil || current === null || PRIORITY[id] > PRIORITY[current]) return now
  return busyUntil + GAP
}

export function play(id: SoundId): void {
  if (muted) return
  const ac = live()
  if (!ac) return
  const at = startTime(ac.currentTime, id)
  schedule(ac, id, at + 0.02, VOLUME[station])
  busyUntil = at + SOUNDS[id].dur
  current = id
}

// Solo para tests: estado limpio.
export function resetForTests(): void { busyUntil = 0; current = null; muted = false; station = 'tablet' }
