'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { CatalogView } from '@/components/organization/CatalogView'
import { AddDishWizard } from '@/components/pantry/AddDishWizard'
import { AddIngredientWizard } from '@/components/pantry/AddIngredientWizard'
import { MenuAdmin, type MenuAdminRequest } from '@/components/pantry/MenuAdmin'
import { RecipeEditor } from '@/components/pantry/RecipeEditor'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { formatCop } from '@/lib/domain/money'
import type { Ingredient } from '@/lib/domain/pantry'
import { catalogOverview, recipeState, setIngredientCost, type CatalogOverview, type OverviewDish, type OverviewIngredient, type RecipeState } from '@/lib/services/catalogOverview'
import { usePantryStore } from '@/lib/stores/pantryStore'
import { cn } from '@/lib/utils'

export type CatalogTab = 'dishes' | 'categories' | 'ingredients' | 'prices'
export type DishFilter = 'all' | RecipeState
const TABS: { value: CatalogTab; label: string }[] = [
  { value: 'dishes', label: 'Platos' }, { value: 'categories', label: 'Categorías' }, { value: 'ingredients', label: 'Ingredientes' }, { value: 'prices', label: 'Precios por restaurante' },
]
const FILTERS: [DishFilter, string][] = [['all', 'Todos'], ['noRecipe', 'Sin receta'], ['missingCost', 'Sin costo'], ['costed', 'Con costo']]
const STATE: Record<RecipeState, { label: string; tone: 'success' | 'neutral' | 'progress' }> = {
  costed: { label: 'Con costo', tone: 'success' }, noRecipe: { label: 'Sin receta', tone: 'neutral' }, missingCost: { label: 'Ingrediente sin costo', tone: 'progress' },
}
const money = (v: number) => `$\u00a0${formatCop(Math.round(v))}`
// «por kg», «por unidad»: Odoo nombra la unidad «Units» (en inglés).
const perUnit = (uom: string) => (uom === 'Units' ? 'unidad' : uom)
const INPUT = 'h-11 px-3 rounded-md border border-border bg-surface text-[15px] text-ink'

// Plan R: el catálogo completo de la organización en la consola. Lo que el plan Q reservó al dueño (crear platos, su ficha
// comercial, sus categorías, la receta y el costo de los ingredientes) se hace aquí, sin entrar al POS de un restaurante.
// Los editores son los mismos de Inventario; el precio y el agotado de cada restaurante siguen en su pestaña.
export function CatalogConsole({ initialTab = 'dishes', initialFilter = 'all' }: { initialTab?: CatalogTab; initialFilter?: DishFilter }) {
  const [tab, setTab] = useState<CatalogTab>(initialTab)
  const pantry = usePantryStore()
  const [overview, setOverview] = useState<CatalogOverview | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(async () => { setVersion((v) => v + 1); await pantry.refresh().catch(() => undefined) }, [pantry])
  useEffect(() => { void pantry.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- una vez: unidades, categorías, proveedores e ingredientes de los asistentes
  useEffect(() => {
    let alive = true
    catalogOverview().then((o) => { if (alive) { setOverview(o); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el catálogo.') })
    return () => { alive = false }
  }, [version])
  return (
    <section className="flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Catálogo</h1>
        <p className="mt-1 text-soft">Los platos, sus recetas y los ingredientes son de toda la organización. El costo de cada receta alimenta Rentabilidad.</p></div>
      <Segmented label="Sección del catálogo" value={tab} onChange={setTab} options={TABS} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      {tab === 'prices' ? <CatalogView />
        : tab === 'categories' ? <CategoriesTab onChanged={() => void reload()} />
        : !overview ? !error && <p role="status" className="text-soft">Cargando el catálogo…</p>
        : tab === 'dishes' ? <DishesTab dishes={overview.dishes} initialFilter={initialFilter} onChanged={reload} />
        : <IngredientsTab ingredients={overview.ingredients} pantryIngredients={pantry.ingredients} onChanged={reload} />}
    </section>
  )
}

function DishesTab({ dishes, initialFilter, onChanged }: { dishes: OverviewDish[]; initialFilter: DishFilter; onChanged: () => Promise<void> }) {
  const pantry = usePantryStore()
  const [filter, setFilter] = useState<DishFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [sheet, setSheet] = useState<MenuAdminRequest | null>(null)
  const [recipe, setRecipe] = useState<{ id: number; name: string } | null>(null)
  const count = (f: DishFilter) => (f === 'all' ? dishes.length : dishes.filter((d) => recipeState(d) === f).length)
  const shown = useMemo(() => dishes.filter((d) => (filter === 'all' || recipeState(d) === filter) && `${d.name} ${d.categories.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())), [dishes, filter, query])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => <Chip key={f} label={label} count={count(f)} active={filter === f} onClick={() => setFilter(f)} />)}
        <input aria-label="Buscar plato" placeholder="Buscar plato" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(INPUT, 'ml-auto w-64')} />
        <Button variant="primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Nuevo plato</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table text-[15px]">
          <thead><tr className="text-left text-soft border-b border-border">
            {['Plato', 'Precio de carta', 'Receta', 'Costo', 'Food cost', ''].map((h, i) => <th key={i} className={cn('px-4 py-3 font-semibold', (i === 1 || i === 3 || i === 4) && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((d) => {
            const state = recipeState(d)
            return (
              <tr key={d.templateId} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><div className="font-semibold">{d.name}{!d.availableInPos && <span className="ml-2 text-[13px] font-normal text-dim">fuera de la carta</span>}</div>
                  <div className="text-[13px] text-dim">{d.categories.join(' · ') || 'Sin categoría'}{!d.hasImage && ' · sin foto'}</div></td>
                <td className="px-4 py-3 text-right tabular">{money(d.listPrice)}</td>
                <td className="px-4 py-3"><StatusPill tone={STATE[state].tone}>{STATE[state].label}</StatusPill>
                  {state === 'missingCost' && <div className="mt-1 text-[13px] text-soft whitespace-normal max-w-[22rem]">Falta el costo de {d.missingCosts.join(', ')}</div>}</td>
                <td className="px-4 py-3 text-right tabular">{d.recipeCost === null ? '—' : money(d.recipeCost)}</td>
                <td className="px-4 py-3 text-right tabular">{d.recipeCost === null || !d.listPrice ? '—' : `${((d.recipeCost / d.listPrice) * 100).toFixed(0)} %`}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <Button size="compact" onClick={() => setSheet({ kind: 'product', id: d.templateId })}>Ficha</Button>
                  <Button size="compact" onClick={() => setRecipe({ id: d.templateId, name: d.name })}>{d.hasRecipe ? 'Receta' : 'Crear receta'}</Button>
                </div></td>
              </tr>)
          })}</tbody>
        </table>
        {shown.length === 0 && <p className="p-6 text-center text-soft">No hay platos con este filtro.</p>}
      </div>
      <p className="text-[13px] text-dim">El food cost aquí es sobre el precio de carta con impuestos; Rentabilidad lo calcula sin impuestos y con las ventas de cada periodo.</p>
      <AddDishWizard open={adding} onClose={() => setAdding(false)} categories={pantry.posCategories} ingredients={pantry.ingredients} units={pantry.units} onSaved={onChanged} />
      {sheet && <MenuAdmin key={JSON.stringify(sheet)} request={sheet} onClose={() => setSheet(null)} onChanged={() => void onChanged()} />}
      {recipe && <RecipeEditor key={recipe.id} dish={recipe} ingredients={pantry.ingredients} units={pantry.units} mayEdit onClose={() => setRecipe(null)} onSaved={onChanged} />}
    </div>
  )
}

function CategoriesTab({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState<MenuAdminRequest | null>(null)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-border p-5 flex flex-col gap-3"><h2 className="text-[18px] font-semibold">Categorías de la carta</h2>
        <p className="text-soft">Créalas, renómbralas y ordénalas. Valen para todos los restaurantes; cada uno decide cuáles muestra.</p>
        <div><Button onClick={() => setOpen({ kind: 'categories' })}>Editar categorías</Button></div></section>
      <section className="rounded-lg border border-border p-5 flex flex-col gap-3"><h2 className="text-[18px] font-semibold">Fuera de la carta</h2>
        <p className="text-soft">Platos ocultos o sin categoría: revísalos y devuélvelos a la carta.</p>
        <div><Button onClick={() => setOpen({ kind: 'offMenu' })}>Ver platos fuera de la carta</Button></div></section>
      {open && <MenuAdmin key={JSON.stringify(open)} request={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  )
}

function IngredientsTab({ ingredients, pantryIngredients, onChanged }: { ingredients: OverviewIngredient[]; pantryIngredients: Ingredient[]; onChanged: () => Promise<void> }) {
  const pantry = usePantryStore()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const shown = ingredients.filter((i) => (!onlyMissing || i.cost <= 0) && i.name.toLowerCase().includes(query.trim().toLowerCase()))
  const save = async (i: OverviewIngredient) => {
    const value = Number(drafts[i.templateId])
    if (!Number.isFinite(value) || value < 0) { setError('Escribe un costo mayor o igual a cero.'); return }
    setError(''); setNotice('')
    try { await setIngredientCost(i.templateId, value); setNotice(`Costo de ${i.name} guardado: ${money(value)} por ${perUnit(i.uom)}.`); setDrafts((d) => { const next = { ...d }; delete next[i.templateId]; return next }); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el costo.') }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="w-5 h-5 accent-primary" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />Solo sin costo</label>
        <input aria-label="Buscar ingrediente" placeholder="Buscar ingrediente" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(INPUT, 'ml-auto w-64')} />
        <Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Nuevo ingrediente</Button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table text-[15px]">
          <thead><tr className="text-left text-soft border-b border-border">
            {['Ingrediente', 'Costo por unidad', 'En platos', ''].map((h, i) => <th key={i} className={cn('px-4 py-3 font-semibold', i === 2 && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((i) => {
            const draft = drafts[i.templateId]
            const full = pantryIngredients.find((p) => p.id === i.templateId)
            return (
              <tr key={i.templateId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">{i.name}{i.cost <= 0 && <span className="ml-2"><StatusPill tone="progress">Sin costo</StatusPill></span>}</td>
                <td className="px-4 py-3">
                  <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(i) }}>
                    <input aria-label={`Costo de ${i.name} por ${perUnit(i.uom)}`} type="number" min={0} step="any" className={cn(INPUT, 'w-36 tabular')}
                      value={draft ?? String(i.cost)} onChange={(e) => setDrafts((d) => ({ ...d, [i.templateId]: e.target.value }))} />
                    <span className="text-[14px] text-soft">por {perUnit(i.uom)}</span>
                    {draft !== undefined && draft !== String(i.cost) && <Button size="compact" type="submit">Guardar</Button>}
                  </form></td>
                <td className="px-4 py-3 text-right tabular">{i.usedIn}</td>
                <td className="px-4 py-3 text-right">{full && <Button size="compact" variant="ghost" onClick={() => setEditing(full)}>Editar</Button>}</td>
              </tr>)
          })}</tbody>
        </table>
        {shown.length === 0 && <p className="p-6 text-center text-soft">No hay ingredientes con este filtro.</p>}
      </div>
      {editing && <AddIngredientWizard open onClose={() => setEditing(null)} initial={editing === 'new' ? null : editing} units={pantry.units} suppliers={pantry.suppliers}
        onSaved={async () => { setEditing(null); await onChanged() }} />}
    </div>
  )
}
