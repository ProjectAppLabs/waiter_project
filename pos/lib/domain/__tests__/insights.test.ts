import { attentionItems, dishStats, forecastNextMonth, generalKpis, peakHours, weekdayAverages, type DailySales, type SalesHistory } from '@/lib/domain/insights'

// Historial sintético: `weeks` semanas completas hasta el domingo 2026-09-13; hoy es lunes 2026-09-14.
function history(weeks: number, perWeekday: number[], scale: (week: number) => number = () => 1): SalesHistory {
  const daily: DailySales[] = []
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const date = new Date(2026, 8, 13 - (weeks - 1 - w) * 7 - (6 - d)), total = perWeekday[d] * scale(w)
    if (total > 0) daily.push({ date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, total, orders: total / 50 })
  }
  return { today: '2026-09-14', windowDays: 28, historyDays: 84, daily, hourly: [], products: [] }
}
const FLAT = [100, 100, 100, 100, 200, 300, 0] // lun–sáb; domingo cerrado

// Falla si la predicción deja de respetar el día de la semana: octubre de 2026 tiene 5 jueves, 5 viernes y 5 sábados,
// así que con semanas idénticas la cifra exacta es 4·(100·3) + 5·100 + 5·200 + 5·300 + 0 = 4200... se cuenta a mano:
// lun×4, mar×4, mié×4 =1200; jue×5=500; vie×5=1000; sáb×5=1500; dom×4=0 → 4200.
it('forecasts next month weekday by weekday when every week looks the same', () => {
  const f = forecastNextMonth(history(8, FLAT))
  expect(f).toMatchObject({ ready: true, month: '2026-10-01', total: 4200, trend: 1, orders: 84 })
  expect(f.low).toBe(Math.round(4200 * 0.9)) // semanas idénticas: el rango mínimo es ±10 %, nunca una cifra «exacta»
  expect(f.weekly).toHaveLength(8)
})

// Falla si con poco historial se inventa una cifra en vez de decir que falta.
it('refuses to predict with less than two weeks of sales', () => {
  const f = forecastNextMonth(history(2, [100, 0, 100, 0, 100, 100, 0]))
  expect(f).toMatchObject({ ready: false, salesDays: 8, total: 0 })
})

// Falla si la tendencia deja de contar o deja de estar acotada: un negocio que dobló ventas no se proyecta al doble.
it('follows the recent trend but caps it at thirty percent', () => {
  const growing = forecastNextMonth(history(8, FLAT, (w) => (w >= 4 ? 1.1 : 1)))
  expect(growing.trend).toBeCloseTo(1.1, 5)
  const doubled = forecastNextMonth(history(8, FLAT, (w) => (w >= 4 ? 2 : 1)))
  expect(doubled.trend).toBe(1.3)
  expect(forecastNextMonth(history(8, FLAT, (w) => (w >= 4 ? 0.2 : 1))).trend).toBe(0.7)
})

// Falla si los días sin ventas dejan de contar como cero: un local que abre un día sí y otro no vendería «el doble».
it('counts closed days as zero instead of ignoring them', () => {
  const f = forecastNextMonth(history(8, [0, 0, 0, 0, 0, 700, 0], () => 1))
  expect(f.ready).toBe(false) // 8 sábados: no alcanza
  const busy = forecastNextMonth(history(12, [0, 0, 0, 0, 700, 700, 0]))
  expect(busy.total).toBe(7000) // 5 viernes + 5 sábados de octubre, no 31 días × 700
})

// Falla si «menos pedidos» deja de incluir los platos de la carta con cero ventas, si incluye platos ya retirados de la
// carta, o si el cambio frente a la ventana anterior se calcula mal.
it('ranks dishes from the current menu, including the ones nobody ordered', () => {
  const h: SalesHistory = { ...history(8, FLAT), products: [
    { productId: 1, templateId: 11, name: 'Hamburguesa', qty: 56, amount: 1000, prevQty: 28 },
    { productId: 2, templateId: 12, name: 'Limonada', qty: 14, amount: 100, prevQty: 0 },
    { productId: 9, templateId: 19, name: 'Plato retirado', qty: 3, amount: 50, prevQty: 9 },
  ] }
  const menu = [{ id: 1, templateId: 11, name: 'Hamburguesa' }, { id: 2, templateId: 12, name: 'Limonada' }, { id: 3, templateId: 13, name: 'Ensalada' }]
  const stats = dishStats(h, menu, 2)
  expect(stats.top.map((d) => [d.name, d.change, d.nextMonth])).toEqual([['Hamburguesa', 1, 62], ['Limonada', null, 16]])
  expect(stats.bottom.map((d) => [d.name, d.qty])).toEqual([['Ensalada', 0]])
  expect(stats.totalQty).toBe(73)
})

// Falla si cambia el orden de urgencia o qué cuenta como «cerca»: a las 18:00, la reserva de las 19:30 entra (faltan
// 90 min), la de las 21:00 no, y la de las 17:45 que no se ha sentado sigue avisando.
it('lists what needs attention now, most urgent first', () => {
  const reservation = (id: number, timeStart: number, depositPending = false) => ({ id, name: `RV${id}`, customer: `Cliente ${id}`, timeStart, label: '', people: 4, tables: '2', depositPending })
  const items = attentionItems({ nowHour: 18, ready: 2, soldOut: [{ id: 7, name: 'Brownie' }],
    reservations: [reservation(1, 21), reservation(2, 19.5, true), reservation(3, 17.75), reservation(4, 17)],
    ingredients: [{ id: 1, name: 'Queso', level: 'low', stock: 4, min: 5, uom: 'kg' }, { id: 2, name: 'Pan', level: 'low', stock: 1, min: 10, uom: 'und' },
      { id: 3, name: 'Tomate', level: 'empty', stock: 0, min: 5, uom: 'kg' }, { id: 4, name: 'Sal', level: 'high', stock: 50, min: 1, uom: 'kg' }] })
  expect(items.map((i) => i.key)).toEqual(['ready', 'res-3', 'res-2', 'dep-2', 'empty-3', 'out-7', 'low-2', 'low-1'])
  expect(items.find((i) => i.key === 'res-3')).toMatchObject({ tone: 'danger', values: { late: 1, minutes: 0 } })
  expect(items.find((i) => i.key === 'res-2')).toMatchObject({ tone: 'warning', values: { minutes: 90 } })
})

// Falla si el inventario vuelve a inundar la lista: con 20 ingredientes bajos se ven los 3 más críticos y un resumen, y
// la reserva que está por llegar sigue arriba.
it('shows the three most critical stock items of each kind and sums up the rest', () => {
  const low = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Ingrediente ${i + 1}`, level: 'low' as const, stock: i + 1, min: 40, uom: 'kg' }))
  const items = attentionItems({ nowHour: 18, ready: 0, soldOut: [], ingredients: low,
    reservations: [{ id: 9, name: 'RV9', customer: 'Camila', timeStart: 18.5, label: '18:30', people: 2, tables: '4', depositPending: false }] })
  expect(items.map((i) => i.key)).toEqual(['res-9', 'low-1', 'low-2', 'low-3', 'stockLowMore'])
  expect(items[4].values).toEqual({ count: 17 })
})

// Falla si una semana que el historial trae a medias vuelve a contar: con ventas idénticas cada semana el rango debe ser
// el mínimo (±10 %), no uno inflado por una primera semana «mala» que en realidad está incompleta.
it('ignores the partial first week when measuring how much weeks vary', () => {
  const h = history(10, FLAT)
  h.daily = h.daily.filter((d) => d.date >= '2026-07-10') // la primera venta registrada es un viernes: esa semana llega incompleta
  const f = forecastNextMonth(h)
  expect(f.weekly[0].week).toBe('2026-07-13')
  expect([f.low, f.high]).toEqual([Math.round(f.total * 0.9), Math.round(f.total * 1.1)])
})

// Falla si la semana o el mes en curso vuelven a compararse contra el periodo anterior COMPLETO (medio mes contra un mes
// entero siempre da «vas mal»), o si el ticket promedio deja de salir de ventas ÷ pedidos.
it('compares the week and the month in progress with the previous ones at the same point', () => {
  const day = (date: string, total: number, orders = 1) => ({ date, total, orders })
  const h = { today: '2026-09-16', windowDays: 28, historyDays: 84, hourly: [], products: [], daily: [ // miércoles 16
    day('2026-08-03', 500), day('2026-08-14', 300), day('2026-08-16', 200), day('2026-08-17', 9999), // agosto: del 1 al 16 = 1000; el 17 ya no cuenta
    day('2026-09-07', 100), day('2026-09-09', 100), day('2026-09-12', 9999),                        // semana pasada: lunes a miércoles = 200; el sábado no cuenta
    day('2026-09-14', 150, 3), day('2026-09-16', 150, 2)] }
  const k = generalKpis(h)
  expect(k.week).toEqual({ value: 300, previous: 200, change: 0.5 })
  expect(k.month.previous).toBe(1000)
  expect(k.month.value).toBe(100 + 100 + 9999 + 150 + 150)
  expect(k.monthOrders).toMatchObject({ value: 8, previous: 3 })
  expect(generalKpis({ ...h, daily: [day('2026-09-16', 150, 2)] }).week).toEqual({ value: 150, previous: 0, change: null })
})

// Falla si el promedio por día de la semana deja de contar los días cerrados como cero o incluye el día de hoy a medias,
// o si las horas pico dejan de expresarse como parte del total.
it('averages each weekday and finds the peak hours', () => {
  const averages = weekdayAverages(history(8, FLAT))
  expect(averages.map((a) => a.total)).toEqual([100, 100, 100, 100, 200, 300, 0])
  expect(averages[6].days).toBe(8)
  const h = { ...history(8, FLAT), hourly: [{ hour: 13, total: 300, orders: 6 }, { hour: 20, total: 700, orders: 9 }] }
  expect(peakHours(h)).toEqual([{ hour: 13, share: 0.3, orders: 6 }, { hour: 20, share: 0.7, orders: 9 }])
  expect(peakHours(history(8, FLAT))).toEqual([])
})

// Hallazgos de la revisión con Codex.
// Falla si un restaurante que dejó de vender en las últimas cuatro semanas no recibe la tendencia a la baja: con
// «recent > 0» como condición la tendencia quedaba neutra (1) en vez de caer a su tope de −30 %.
it('drops the trend to its floor when the last four weeks had no sales', () => {
  const h = history(8, FLAT)
  h.daily = h.daily.filter((d) => d.date < '2026-08-17') // solo el tramo de los 28 días anteriores
  expect(forecastNextMonth(h).trend).toBe(0.7)
})

// Falla si una semana entera sin ventas deja de contar como cero: se perdía, las semanas parecían idénticas y el
// rango salía en el mínimo ±10 % en vez de reflejar que una semana no se vendió nada.
it('counts a whole week without sales as a zero week', () => {
  const f = forecastNextMonth(history(8, FLAT, (w) => (w === 3 ? 0 : 1)))
  expect(f.weekly).toHaveLength(8)
  expect(f.weekly.map((w) => w.total)).toContain(0)
  expect(f.high / f.total).toBeGreaterThan(1.1)
})

// Falla si un plato que dejó de venderse queda fuera de «menos pedidos» detrás de los que nunca se vendieron (con
// varios en cero, el orden alfabético lo sacaba de la lista de 5 aunque trajera su −100 %).
it('ranks a dish that stopped selling ahead of dishes that never sold', () => {
  const h: SalesHistory = { ...history(8, FLAT), products: [{ productId: 9, templateId: 19, name: 'Zanahoria glaseada', qty: 0, amount: 0, prevQty: 12 }] }
  const menu = ['Arepa', 'Bebida', 'Crema', 'Dulce', 'Ensalada', 'Zanahoria glaseada'].map((name, i) => ({ id: i === 5 ? 9 : i + 1, templateId: i + 10, name }))
  const bottom = dishStats(h, menu, 5).bottom
  expect(bottom[0]).toMatchObject({ name: 'Zanahoria glaseada', qty: 0, change: -1 })
  expect(bottom).toHaveLength(5)
})

// Falla si un intento de entrada fuera de turno no sale primero en «Para atender ahora» con el texto de Odoo (plan P).
it('el intento de entrada fuera de turno va antes que todo', () => {
  const items = attentionItems({ nowHour: 23.5, ready: 2, reservations: [], ingredients: [], soldOut: [],
    access: [{ id: 41, body: 'Mateo intentó entrar a las 23:40, fuera de su turno (14:00–22:00).' }], accessHref: '/organizacion/equipo' })
  expect(items[0]).toEqual({ key: 'access-41', kind: 'accessDenied', tone: 'danger', href: '/organizacion/equipo', values: { body: 'Mateo intentó entrar a las 23:40, fuera de su turno (14:00–22:00).' } })
  expect(items[1].kind).toBe('ready')
})

// Falla si un cierre de caja que superó la tolerancia no sale en «Para atender ahora» o no lleva a los cuadres (plan Q3).
it('el cierre de caja con diferencia sale arriba y lleva a los cuadres', () => {
  const items = attentionItems({ nowHour: 20, ready: 0, reservations: [], ingredients: [], soldOut: [],
    cash: [{ id: 9, body: 'Caja de Poblado cerró con $ 12.000 de diferencia (Laura Encargada)' }], cashHref: '/cuadres' })
  expect(items[0]).toMatchObject({ kind: 'cashDifference', tone: 'danger', href: '/cuadres' })
})
