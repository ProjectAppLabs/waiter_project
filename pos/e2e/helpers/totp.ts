import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Plan Y3: la cuenta de ProjectApp de las pruebas tiene doble factor (es administradora y la plataforma lo exige). El
// secreto se guarda fuera del repositorio, en e2e/.estado (ignorado), la primera vez que una prueba lo activa.
const DIR = join(__dirname, '..', '.estado')
const FILE = join(DIR, 'totp.json')
interface Saved { secret: string; lastStep: number }

function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)))
}
const codeAt = (secret: string, step: number) => {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

export const savedSecret = (): Saved | null => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) as Saved : null)
export function saveSecret(secret: string) { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify({ secret, lastStep: 0 })) }

// El servidor no acepta dos veces el mismo intervalo de 30 s: si ya se usó, se espera al siguiente.
export async function nextCode(): Promise<string> {
  const saved = savedSecret()
  if (!saved) throw new Error('No hay secreto de doble factor guardado en e2e/.estado/totp.json')
  let step = Math.floor(Date.now() / 30_000)
  if (step <= saved.lastStep) { await new Promise((r) => setTimeout(r, (saved.lastStep + 1) * 30_000 - Date.now() + 500)); step = saved.lastStep + 1 }
  writeFileSync(FILE, JSON.stringify({ ...saved, lastStep: step }))
  return codeAt(saved.secret, step)
}
