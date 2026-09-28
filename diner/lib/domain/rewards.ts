import { formatCop } from '@/lib/domain/cart'
import type { RewardAction, RewardPrize } from '@/lib/types'

// Plan N: cómo se cuenta cada acción del menú que da un premio y a qué pantalla lleva para cumplirla.
export const REWARD_ACTIONS: Record<RewardAction, { titulo: string; origen: string; pantalla: 'cuenta/registro' | 'historial' | 'cuenta' | 'pedido' }> = {
  cuenta: { titulo: 'Crea y verifica tu cuenta', origen: 'crear tu cuenta', pantalla: 'cuenta/registro' },
  opinion: { titulo: 'Deja tu opinión de un pedido', origen: 'dejar tu opinión', pantalla: 'historial' },
  novedades: { titulo: 'Suscríbete a las novedades', origen: 'suscribirte a las novedades', pantalla: 'cuenta' },
  pago_en_linea: { titulo: 'Paga tu pedido en línea', origen: 'pagar en línea', pantalla: 'pedido' },
}

// El premio en una frase: «10 % de descuento en tu próxima compra», «el cupón HOLA10 de 10 %», «20 puntos».
export function prizeText(premio: RewardPrize): string {
  if (premio.tipo === 'descuento') return `${premio.porcentaje}% de descuento en tu próxima compra`
  if (premio.tipo === 'cupon') return `el cupón ${premio.codigo} de ${premio.porcentaje}%${premio.minimo > 0 ? ` desde $\u00a0${formatCop(premio.minimo)}` : ''}`
  return `${premio.puntos.toLocaleString('es-CO')} puntos`
}

// El premio como título corto de una fila: «10% en tu próxima compra», «Cupón HOLA10 · 10%», «+20 puntos».
export function prizeTitle(premio: RewardPrize): string {
  if (premio.tipo === 'descuento') return `${premio.porcentaje}% en tu próxima compra`
  if (premio.tipo === 'cupon') return `Cupón ${premio.codigo} · ${premio.porcentaje}%`
  return `+${premio.puntos.toLocaleString('es-CO')} puntos`
}
