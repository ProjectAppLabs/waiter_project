export interface Size { width: number; height: number }
export const LOGO_MAX: Size = { width: 1024, height: 512 }
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const
export const JPEG_QUALITY = 0.85
export type LogoFileError = 'type' | 'size'

// Motivo por el que un logo no se pudo preparar: el formulario lo traduce a su mensaje.
export class LogoError extends Error {
  readonly reason: LogoFileError | 'decode'
  constructor(reason: LogoFileError | 'decode') { super(reason); this.name = 'LogoError'; this.reason = reason }
}

export interface DecodedImage { width: number; height: number; source: CanvasImageSource; release?: () => void }
export interface DrawingCanvas { getContext(kind: '2d'): { drawImage(source: CanvasImageSource, x: number, y: number, w: number, h: number): void } | null; toDataURL(type: string, quality?: number): string }
export interface ResizeDeps { decode(file: Blob): Promise<DecodedImage>; canvas(size: Size): DrawingCanvas; bytes(file: Blob): Promise<Uint8Array> }

export function validateLogoFile(file: { type: string; size: number }): LogoFileError | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > LOGO_MAX_BYTES) return 'size'
  return null
}

// Encaja sin deformar y sin agrandar: un logo pequeño se queda como está.
export function fitWithin(size: Size, max: Size): Size {
  const scale = Math.min(1, max.width / size.width, max.height / size.height)
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }
}

export const fitsWithin = (size: Size, max: Size): boolean => size.width <= max.width && size.height <= max.height

export function imageDataUrl(base64: string): string {
  const mime = base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('R0lGOD') ? 'image/gif' : 'image/png'
  return `data:${mime};base64,${base64}`
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

const browserDeps: ResizeDeps = {
  decode: (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, source: img, release: () => URL.revokeObjectURL(url) })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new LogoError('decode')) }
    img.src = url
  }),
  canvas: (size) => { const c = document.createElement('canvas'); c.width = size.width; c.height = size.height; return c },
  bytes: async (file) => new Uint8Array(await file.arrayBuffer()),
}

// Devuelve el logo en base64 sin el prefijo data:. Un JPEG sale JPEG (calidad 0.85) y un PNG sale PNG; si la imagen
// ya cabe en el máximo, los bytes originales sin recodificar. Si el resultado pasa de 1 MB, LogoError('size').
export async function resizeImage(file: Blob, max: Size = LOGO_MAX, deps: ResizeDeps = browserDeps): Promise<string> {
  const image = await deps.decode(file)
  try {
    const base64 = fitsWithin(image, max) ? bytesToBase64(await deps.bytes(file)) : draw(image, fitWithin(image, max), file.type, deps)
    if (base64Bytes(base64) > LOGO_MAX_BYTES) throw new LogoError('size')
    return base64
  } finally {
    image.release?.()
  }
}

function draw(image: DecodedImage, target: Size, type: string, deps: ResizeDeps): string {
  const canvas = deps.canvas(target)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new LogoError('decode')
  ctx.drawImage(image.source, 0, 0, target.width, target.height)
  const dataUrl = type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', JPEG_QUALITY) : canvas.toDataURL('image/png')
  return dataUrl.split(',')[1] ?? ''
}
