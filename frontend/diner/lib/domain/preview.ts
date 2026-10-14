// Resguardo compartido por el store y llamadas directas de formularios/chat/pagos.
let readOnly = false
export const PREVIEW_MESSAGE = 'Estás viendo un borrador. Abre el menú publicado para realizar esta acción.'
export function setPreviewReadOnly(value: boolean) { readOnly = value }
export function isPreviewReadOnly(): boolean {
  const search = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  return readOnly || !!search?.has('borrador') || !!search?.has('vista_previa')
}
