import type { OptionChoice, OptionGroup, TaxRate } from '@/lib/domain/orderWizard'
import { parseDinerAttributes } from '@/lib/domain/dinerAttributes'
import * as coreCatalog from '@/lib/services/core/catalog'

// Adiciones del modal «Agregar al pedido», a partir de los atributos de cada plato en el catálogo del sistema propio:
// los tamaños son un grupo obligatorio de una opción (el precio de cada tamaño sobre el precio base), y las adiciones y
// los acompañamientos son grupos opcionales de varias opciones al precio de cada producto. Los componentes de un combo
// no se eligen: los arma el pedido (ver `withComboChildren`).
export interface MenuExtras { options: Map<number, OptionGroup[]>; descriptions: Map<number, string> }

// Los ids de grupo son negativos y estables por plato: no chocan con ids de producto y el carrito los distingue.
const SIZE_GROUP = -1, EXTRA_GROUP = -2, SIDE_GROUP = -3

// La carta se lee una vez por minuto: abrir el asistente varias veces seguidas no repite la lectura, y un cambio del
// catálogo llega al siguiente minuto.
const TTL = 60_000
let dishes: { at: number; list: Promise<coreCatalog.CoreDish[]> } | null = null
function loadDishes() {
  if (!dishes || Date.now() - dishes.at > TTL) {
    const list = coreCatalog.listProducts('dish').then((all) => all.filter((p): p is coreCatalog.CoreDish => p.kind === 'dish'))
    list.catch(() => { dishes = null })
    dishes = { at: Date.now(), list }
  }
  return dishes.list
}
// Solo para las pruebas: la próxima lectura vuelve al servidor.
export const resetMenuExtras = () => { dishes = null }

export async function loadMenuExtras(templateIds: number[]): Promise<MenuExtras> {
  const options = new Map<number, OptionGroup[]>()
  const descriptions = new Map<number, string>()
  if (templateIds.length === 0) return { options, descriptions }
  const all = await loadDishes()
  const byId = new Map(all.map((p) => [p.id, p]))
  for (const id of templateIds) {
    const dish = byId.get(id)
    if (!dish) continue
    if (dish.description) descriptions.set(id, dish.description)
    const attrs = parseDinerAttributes(JSON.stringify(dish.diner_attributes ?? {}))
    const groups: OptionGroup[] = []
    const sizes = attrs.tamanos ?? []
    if (sizes.length) {
      groups.push({ id: SIZE_GROUP, name: 'Tamaño', kind: 'attribute', required: true, multiple: false,
        choices: sizes.map((s, i): OptionChoice => ({ id: -(i + 1), name: s.nombre, priceExtra: s.precio - dish.price, kind: 'attribute', groupId: SIZE_GROUP, productId: null, taxIds: [] })) })
    }
    for (const [groupId, name, ids] of [[EXTRA_GROUP, 'Adiciones', attrs.extras ?? []], [SIDE_GROUP, 'Acompañamientos', attrs.acompanamientos ?? []]] as const) {
      const choices = ids.flatMap((pid): OptionChoice[] => {
        const p = byId.get(pid)
        return p ? [{ id: p.id, name: p.name, priceExtra: p.price, kind: 'attribute', groupId, productId: null, taxIds: [] }] : []
      })
      if (choices.length) groups.push({ id: groupId, name, kind: 'attribute', required: false, multiple: true, choices })
    }
    if (groups.length) options.set(id, groups)
  }
  return { options, descriptions }
}

// El uuid de un componente sale del de su línea y del producto: reintentar el mismo pedido manda los mismos uuid.
export const comboChildUuid = (parentUuid: string, productId: number) => parentUuid.slice(0, 24) + productId.toString(16).padStart(12, '0')

// Componentes de los combos para el pedido: el servidor exige cada componente con su cantidad (la del combo por las
// unidades pedidas). Las líneas que no son combo salen sin componentes.
export interface ComboChild { uuid: string; product_id: number; qty: number }
export async function withComboChildren<L extends ComboChild>(lines: L[]): Promise<(L & { children?: ComboChild[] })[]> {
  const byId = new Map((await loadDishes()).map((p) => [p.id, p]))
  return lines.map((l) => {
    const combo = parseDinerAttributes(JSON.stringify(byId.get(l.product_id)?.diner_attributes ?? {})).combo ?? []
    return combo.length ? { ...l, children: combo.map((c) => ({ uuid: comboChildUuid(l.uuid, c.producto), product_id: c.producto, qty: c.cantidad * l.qty })) } : l
  })
}

// Tasas de los impuestos de la carta para calcular el carrito antes de que el servidor lo recalcule al guardar.
export async function loadTaxes(ids: number[]): Promise<TaxRate[]> {
  if (ids.length === 0) return []
  const { taxes } = await coreCatalog.listTaxes()
  return taxes.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, name: t.name, amount: t.amount, amountType: 'percent', priceInclude: t.included }))
}
