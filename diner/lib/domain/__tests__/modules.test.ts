import { accountScreen, dinerHas } from '@/lib/domain/modules'

// Falla si un servidor anterior (sin la lista de módulos) apaga funciones del menú, o si con la lista el menú muestra
// el chat, el pago en línea o la cuenta de un módulo apagado.
it('consulta los módulos del restaurante', () => {
  expect(dinerHas(null, 'asistente_menu')).toBe(true)
  expect(dinerHas({}, 'pagos_en_linea')).toBe(true)
  const entry = { modulos: ['menu_comensal', 'pagos_en_linea'] }
  expect(dinerHas(entry, 'pagos_en_linea')).toBe(true)
  expect(dinerHas(entry, 'asistente_menu')).toBe(false)
  expect(dinerHas(entry, 'fidelizacion')).toBe(false)
})

// Falla si alguna pantalla de la cuenta del comensal queda abierta sin fidelización, o si se cierran la carta o el pedido.
it('pantallas de la cuenta', () => {
  for (const s of ['cuenta', 'cuenta/registro', 'cuenta/entrar', 'recompensas', 'favoritos', 'historial']) expect(accountScreen(s)).toBe(true)
  for (const s of ['carta', 'pedido', 'pago', 'estado', 'la-cuenta', 'portada', 'ubicacion']) expect(accountScreen(s)).toBe(false)
})
