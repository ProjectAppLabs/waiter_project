import { JPEG_QUALITY, LOGO_MAX, LogoError, base64Bytes, bytesToBase64, fitWithin, imageDataUrl, resizeImage, validateLogoFile, type ResizeDeps, type Size } from '@/lib/domain/image'

const source = {} as CanvasImageSource
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
function fakeDeps(width: number, height: number, out = 'QUJD') {
  const drawn: number[][] = []
  const sizes: Size[] = []
  const exported: [string, number | undefined][] = []
  const release = jest.fn()
  const bytes = jest.fn(async () => PNG_HEAD)
  const deps: ResizeDeps = {
    decode: async () => ({ width, height, source, release }),
    canvas: (size) => { sizes.push(size); return { getContext: () => ({ drawImage: (_s: CanvasImageSource, ...args: number[]) => { drawn.push(args) } }), toDataURL: (type, quality) => { exported.push([type, quality]); return `data:${type};base64,${out}` } } },
    bytes,
  }
  return { deps, drawn, sizes, exported, release, bytes }
}

// Falla si el logo se deforma, se agranda o se pasa del máximo 1024 × 512 del contrato.
it('fits inside 1024 × 512 keeping the aspect ratio and never upscales', () => {
  expect(fitWithin({ width: 3000, height: 1000 }, LOGO_MAX)).toEqual({ width: 1024, height: 341 })
  expect(fitWithin({ width: 800, height: 2000 }, LOGO_MAX)).toEqual({ width: 205, height: 512 })
  expect(fitWithin({ width: 300, height: 120 }, LOGO_MAX)).toEqual({ width: 300, height: 120 })
})

// Falla si el canvas no se crea al tamaño ajustado, si un PNG grande se exporta en otro formato o si el prefijo data: llega al servidor.
it('draws an oversized PNG at the fitted size and returns bare PNG base64', async () => {
  const { deps, drawn, sizes, exported, release, bytes } = fakeDeps(2048, 2048)
  await expect(resizeImage(new Blob([], { type: 'image/png' }), LOGO_MAX, deps)).resolves.toBe('QUJD')
  expect(sizes).toEqual([{ width: 512, height: 512 }])
  expect(drawn).toEqual([[0, 0, 512, 512]])
  expect(exported).toEqual([['image/png', undefined]])
  expect(bytes).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalled()
})

// Falla si un JPEG vuelve a salir como PNG RGBA (crece hasta 6× y pesa lo que el usuario quiso evitar) o cambia la calidad.
it('keeps a JPEG as JPEG at quality 0.85 when it has to shrink', async () => {
  const { deps, sizes, exported } = fakeDeps(3000, 1000)
  await expect(resizeImage(new Blob([], { type: 'image/jpeg' }), LOGO_MAX, deps)).resolves.toBe('QUJD')
  expect(sizes).toEqual([{ width: 1024, height: 341 }])
  expect(exported).toEqual([['image/jpeg', JPEG_QUALITY]])
})

// Falla si una imagen que ya cabe se recodifica por el canvas (pierde calidad y cambia de peso) en vez de viajar tal cual.
it('sends the original bytes untouched when the image already fits', async () => {
  const { deps, sizes, exported, release, bytes } = fakeDeps(1024, 512)
  const file = new Blob([PNG_HEAD], { type: 'image/png' })
  await expect(resizeImage(file, LOGO_MAX, deps)).resolves.toBe('iVBORw==')
  expect(bytes).toHaveBeenCalledWith(file)
  expect(sizes).toEqual([])
  expect(exported).toEqual([])
  expect(release).toHaveBeenCalled()
})

// Falla si el límite de 1 MB solo se mira en el archivo de entrada: un PNG recodificado puede pesar más que el original.
it('rejects a resized result heavier than 1 MB with a size error', async () => {
  const { deps } = fakeDeps(2048, 2048, 'A'.repeat(1_400_000))
  await expect(resizeImage(new Blob([], { type: 'image/png' }), LOGO_MAX, deps)).rejects.toMatchObject({ name: 'LogoError', reason: 'size' })
  await expect(resizeImage(new Blob([], { type: 'image/png' }), LOGO_MAX, deps)).rejects.toBeInstanceOf(LogoError)
})

// Falla si el base64 de los bytes originales sale mal (el servidor guardaría basura), si el trozo de 32 KiB rompe la
// codificación o si el peso calculado del base64 no cuenta el relleno.
it('encodes bytes to base64 in chunks and measures the decoded size', () => {
  expect(bytesToBase64(PNG_HEAD)).toBe('iVBORw==')
  expect(base64Bytes('iVBORw==')).toBe(4)
  expect(base64Bytes('QUJD')).toBe(3)
  const big = bytesToBase64(new Uint8Array(70_000))
  expect(big).toHaveLength(93_336)
  expect(base64Bytes(big)).toBe(70_000)
})

// Falla si un SVG o un archivo de más de 1 MB pasa el filtro (el bloque 3 solo sirve ráster).
it('rejects non-raster types and files over 1 MB', () => {
  expect(validateLogoFile({ type: 'image/svg+xml', size: 10 })).toBe('type')
  expect(validateLogoFile({ type: 'image/png', size: 1024 * 1024 + 1 })).toBe('size')
  expect(validateLogoFile({ type: 'image/jpeg', size: 1024 * 1024 })).toBeNull()
})

// Falla si la vista del logo guardado toma un JPEG por PNG (el navegador lo mostraría en blanco).
it('sniffs the mime type from the base64 head', () => {
  expect(imageDataUrl('/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ')
  expect(imageDataUrl('iVBORw0KGgo')).toBe('data:image/png;base64,iVBORw0KGgo')
  expect(imageDataUrl('R0lGODlh')).toBe('data:image/gif;base64,R0lGODlh')
})
