import type { ComponentTemplate, MenuTheme, TemplateNode } from '@/lib/types'

// Plan K2: qué plantilla de componente aplica y cómo se leen sus datos. La validación de fondo la hizo experience
// (diseno/plantillas.py); aquí solo se comprueba lo que protege al comensal: versión del contrato, forma del árbol,
// etiquetas y clases admitidas. Cualquier duda vuelve al componente de fábrica.
export const COMPONENT_CONTRACTS = { plato: 1 } as const
export type TemplatableComponent = keyof typeof COMPONENT_CONTRACTS
export const TEMPLATE_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'strong', 'em', 'small', 'ul', 'ol', 'li', 'figure', 'figcaption'] as const
const UTILITY = /^ds-[a-z0-9-]+$/
const NODE_LIMIT = 150

export type TemplateData = Record<string, unknown>
// Una ranura es un nodo listo o, si es de envoltorio, una función que recibe el contenido dibujado.
export type TemplateSlot = React.ReactNode | ((children: React.ReactNode) => React.ReactNode)
export type TemplateSlots = Record<string, TemplateSlot>

function validNode(node: unknown, count: { n: number }): node is TemplateNode {
  if (!node || typeof node !== 'object' || ++count.n > NODE_LIMIT) return false
  const n = node as Record<string, unknown>
  const children = (key: string) => Array.isArray(n[key]) && (n[key] as unknown[]).every((child) => validNode(child, count))
  switch (n.tipo) {
    case 'elemento': return (TEMPLATE_TAGS as readonly string[]).includes(n.etiqueta as string) && Array.isArray(n.clases) && (n.clases as unknown[]).every((c) => typeof c === 'string' && UTILITY.test(c)) && children('hijos')
    case 'texto': return typeof n.texto === 'string'
    case 'dato': return typeof n.nombre === 'string' && (n.formato === undefined || ['texto', 'precio', 'numero'].includes(n.formato as string))
    case 'ranura': return typeof n.nombre === 'string' && children('hijos')
    case 'si': return typeof n.dato === 'string' && children('hijos')
    case 'cada': return typeof n.dato === 'string' && typeof n.como === 'string' && children('hijos')
    case 'decoracion': return typeof n.id === 'string' && /^[a-z0-9-]+$/.test(n.id as string) && typeof n.movimiento === 'string' && typeof n.posicion === 'string'
    default: return false
  }
}

// La plantilla guardada del componente, o null si no hay, no es de esta versión del contrato o su árbol no es fiable.
export function templateFor(theme: MenuTheme | undefined, component: TemplatableComponent): TemplateNode[] | null {
  const saved = theme?.version === 2 ? theme.componentes?.[component] : undefined
  if (!saved || typeof saved !== 'object') return null
  const { version, arbol } = saved as ComponentTemplate
  if (version !== COMPONENT_CONTRACTS[component] || !Array.isArray(arbol) || arbol.length === 0) return null
  const count = { n: 0 }
  return arbol.every((node) => validNode(node, count)) ? arbol : null
}

// Un dato es «verdadero» para <si> cuando existe y no está vacío: booleanos, números distintos de cero, textos y listas.
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return !!value
}

// Dentro de <cada dato="lineas" como="linea">, «linea.nombre» se lee del elemento actual; el resto, de los datos del componente.
export function resolveData(name: string, data: TemplateData, scope: Record<string, TemplateData>): unknown {
  const [head, ...rest] = name.split('.')
  if (head in scope) return rest.length ? scope[head][rest.join('.')] : scope[head]
  return data[name]
}
