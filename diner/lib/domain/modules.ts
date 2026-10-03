import type { Entry } from '@/lib/types'

// Plan W: lo que el restaurante tiene activo en el menú. El servidor manda solo los módulos que afectan al comensal;
// sin la lista (versión anterior del servidor), todo sigue como antes.
export type DinerModule = 'menu_comensal' | 'pagos_en_linea' | 'fidelizacion' | 'asistente_menu'
export const dinerHas = (entry: Pick<Entry, 'modulos'> | null | undefined, key: DinerModule) => !entry?.modulos || entry.modulos.includes(key)

// Las pantallas de la cuenta del comensal: sin fidelización no se abren.
export const accountScreen = (screen: string) => screen === 'cuenta' || screen.startsWith('cuenta/') || ['recompensas', 'favoritos', 'historial', 'opinion'].includes(screen)
