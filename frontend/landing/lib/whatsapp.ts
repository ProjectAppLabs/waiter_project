// El número de la demo (el mismo valor por defecto del diseño) y el enlace a WhatsApp con el mensaje inicial.
export const WHATSAPP = '573238122373'

export function enlaceWhatsApp(numero?: string) {
  const digits = String(numero || WHATSAPP).replace(/\D/g, '')
  return digits ? 'https://wa.me/' + (digits.length === 10 ? '57' + digits : digits) + '?text=' + encodeURIComponent('Hola, quiero agendar una demo de Waiter.') : '#demo'
}
