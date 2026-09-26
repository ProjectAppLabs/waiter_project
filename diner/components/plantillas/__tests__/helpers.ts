import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TemplateNode } from '@/lib/types'

// Contratos por archivo (experience/diseno/componentes/<id>.json), como los carga plantillas.py.
const contractsDir = join(__dirname, '../../../../experience/experience_app/diseno/componentes')
export const contracts = { ...JSON.parse(readFileSync(join(contractsDir, '../componentes.json'), 'utf8')),
  componentes: Object.fromEntries(readdirSync(contractsDir).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(contractsDir, f), 'utf8'))])) } as {
    etiquetas: string[]; componentes: Record<string, { version: number; datos: Record<string, unknown>; ranuras: Record<string, unknown>; plantilla_fabrica: string }> }

// El HTML del lenguaje es XML bien formado: se convierte al mismo árbol que produce experience/diseno/plantillas.py.
function toTree(nodes: NodeListOf<ChildNode> | ChildNode[]): TemplateNode[] {
  const out: TemplateNode[] = []
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) { const text = node.textContent!.replace(/\s+/g, ' '); if (text.trim()) out.push({ tipo: 'texto', texto: text }); continue }
    const e = node as Element, attr = (name: string) => e.getAttribute(name) ?? undefined
    if (e.nodeName === 'dato') out.push({ tipo: 'dato', nombre: attr('nombre')!, ...(attr('formato') ? { formato: attr('formato') as 'precio' } : {}) })
    else if (e.nodeName === 'ranura') out.push({ tipo: 'ranura', nombre: attr('nombre')!, hijos: toTree(e.childNodes) })
    else if (e.nodeName === 'si') out.push({ tipo: 'si', dato: attr('dato')!, hijos: toTree(e.childNodes) })
    else if (e.nodeName === 'cada') out.push({ tipo: 'cada', dato: attr('dato')!, como: attr('como')!, hijos: toTree(e.childNodes) })
    else if (e.nodeName === 'decoracion') out.push({ tipo: 'decoracion', id: attr('id')!, movimiento: attr('movimiento') ?? 'ninguno', posicion: attr('posicion') ?? 'libre' })
    else out.push({ tipo: 'elemento', etiqueta: e.nodeName, clases: (attr('class') ?? '').split(/\s+/).filter(Boolean), hijos: toTree(e.childNodes) })
  }
  return out
}
export const parseTemplate = (html: string) => toTree(new DOMParser().parseFromString(`<r>${html}</r>`, 'application/xml').documentElement.childNodes)
export const factoryTree = (component: string) => parseTemplate(contracts.componentes[component].plantilla_fabrica)
