'use client'

import { ExportMenu } from '@/components/kit/ExportMenu'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Modal } from '@/components/kit/Modal'
import { AddDishWizard } from '@/components/pantry/AddDishWizard'
import { AddIngredientWizard } from '@/components/pantry/AddIngredientWizard'
import { DishCard } from '@/components/pantry/DishCard'
import { FilterPanel, type FilterSection } from '@/components/pantry/FilterPanel'
import { IngredientRow } from '@/components/pantry/IngredientRow'
import { InventoryControl } from '@/components/pantry/InventoryControl'
import { MenuAdmin, type MenuAdminRequest } from '@/components/pantry/MenuAdmin'
import { PantryHeader } from '@/components/pantry/PantryHeader'
import { RecipeEditor } from '@/components/pantry/RecipeEditor'
import { RequestList } from '@/components/pantry/RequestList'
import { Button } from '@/components/ui/Button'
import {
PANTRY_CATEGORIES,STOCK_LEVELS,dishAvailable,filterDishes,filterIngredients,groupCounts,
type Dish,type Ingredient,type LevelFilter,type PantryCategory,
} from '@/lib/domain/pantry'
import { can, isOwner } from '@/lib/domain/roles'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { closedDishes, setDishAvailability } from '@/lib/services/masterCatalog'
import { archiveIngredient, requestIngredient } from '@/lib/services/pantry'
import { getRecipe } from '@/lib/services/restaurantInventory'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { usePantryStore } from '@/lib/stores/pantryStore'
import { toast } from '@/lib/stores/toastStore'

// Plan Y1: fechas del periodo de exportes, en la zona del equipo.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA')

type IngredientModal = { kind: 'add' } | { kind: 'edit'; ingredient: Ingredient } | { kind: 'delete'; ingredient: Ingredient } | null

export default function InventarioPage() {
  const t = useTranslations('pantry')
  const s = usePantryStore()
  const { role } = useIdentity()
  const canEditSetting = useCatalogStore((c) => c.catalog?.settings.waiterCanEditInventory ?? false)
  const policy = useCatalogStore((c) => c.catalog?.settings.rolePermissions)
  const mayEdit = can.editInventory(role, canEditSetting, policy)
  // Plan Q: el plato es de toda la organización. Crearlo, su ficha comercial, sus categorías y su receta son del dueño; el
  // encargado opera existencias, solicitudes y agotados de su restaurante.
  const owner = useAuthStore((a) => isOwner(a.user?.role, a.employee?.role))
  const [detail, setDetail] = useState<{id:number;name:string} | null>(null)
  const [control, setControl] = useState<Ingredient | null>(null)
  const [addDish, setAddDish] = useState(false)
  const [ingredientModal, setIngredientModal] = useState<IngredientModal>(null)
  const [menuAdmin, setMenuAdmin] = useState<MenuAdminRequest | null>(null)
  const session = useAuthStore((a) => a.session)
  const reloadCatalog = useCatalogStore((c) => c.load) // la carta del POS (precios, agotados) se relee tras editar una ficha
  const refresh = s.refresh
  const load = s.load
  useEffect(() => { void load() }, [load])

  const openDetail = useCallback(async (dish: Dish) => { setDetail(dish) }, [])
  // Plan O: los platos que este restaurante tiene agotados (el catálogo es de la organización). Solo el encargado los cambia.
  const configId = currentRestaurantId()
  const [closedHere, setClosedHere] = useState<Set<number>>(new Set())
  const dishIds = s.dishes.map((d) => d.id).join(',')
  useEffect(() => {
    if (configId === null || !dishIds) return
    let alive = true
    closedDishes(dishIds.split(',').map(Number), configId).then((ids) => { if (alive) setClosedHere(ids) }).catch(() => undefined)
    return () => { alive = false }
  }, [configId, dishIds])
  const toggleHere = async (dish: Dish) => {
    if (configId === null) return
    const closed = closedHere.has(dish.id)
    try {
      await setDishAvailability(dish.id, configId, closed)
      setClosedHere((v) => { const next = new Set(v); if (closed) next.delete(dish.id); else next.add(dish.id); return next })
      void reloadCatalog(session?.id ?? null)
    } catch (e) { toast({ title: e instanceof Error ? e.message : String(e), tone: 'danger' }) }
  }
  useEffect(()=>{const id=Number(new URLSearchParams(window.location.search).get('plato'));if(!id)return;let alive=true;getRecipe(id).then(d=>{if(alive){setDetail({id,name:d.name});window.history.replaceState(null,'','/inventario')}}).catch(e=>{if(alive)toast({title:e.message,tone:'danger'})});return()=>{alive=false}},[])
  useEffect(()=>{const timer=setInterval(()=>{void refresh().catch(()=>{})},15000);return()=>clearInterval(timer)},[refresh])

  const posCategoryName = (ids: number[]) => s.posCategories.find((c) => c.id === ids[0])?.name ?? '—'
  const dishes = filterDishes(s.dishes, s.dishFilters)
  const ingredients = filterIngredients(s.ingredients, s.ingredientFilters)

  const levelSection = <T extends { level: string | null }>(rows: T[], active: LevelFilter, pick: (l: LevelFilter) => void): FilterSection => {
    const counts = groupCounts(rows, STOCK_LEVELS, (r) => r.level)
    return { title: t('filters.stockLevel'), options: [
      { key: 'all', label: t('filters.all'), count: counts.all, active: active === 'all', onClick: () => pick('all') },
      ...STOCK_LEVELS.map((l) => ({ key: l, label: t(`levels.${l}`), count: counts[l], active: active === l, onClick: () => pick(l) })),
    ] }
  }

  const dishStatus = groupCounts(s.dishes, ['available', 'unavailable'], (d) => (dishAvailable(d) ? 'available' : 'unavailable'))
  const dishCategories = groupCounts(s.dishes, s.posCategories.map((c) => String(c.id)), () => null)
  for (const c of s.posCategories) dishCategories[String(c.id)] = s.dishes.filter((d) => d.categoryIds.includes(c.id)).length
  const menuSections: FilterSection[] = [
    { title: t('filters.dishStatus'), options: [
      { key: 'all', label: t('filters.all'), count: dishStatus.all, active: s.dishFilters.status === 'all', onClick: () => s.setDishFilters({ status: 'all' }) },
      { key: 'available', label: t('filters.available'), count: dishStatus.available, active: s.dishFilters.status === 'available', onClick: () => s.setDishFilters({ status: 'available' }) },
      { key: 'unavailable', label: t('filters.unavailable'), count: dishStatus.unavailable, active: s.dishFilters.status === 'unavailable', onClick: () => s.setDishFilters({ status: 'unavailable' }) },
    ] },
    levelSection(s.dishes, s.dishFilters.level, (level) => s.setDishFilters({ level })),
    { title: t('filters.category'), options: [
      { key: 'all', label: t('filters.all'), count: dishCategories.all, active: s.dishFilters.categoryId === null, onClick: () => s.setDishFilters({ categoryId: null }) },
      ...s.posCategories.map((c) => ({ key: String(c.id), label: c.name, count: dishCategories[String(c.id)], active: s.dishFilters.categoryId === c.id, onClick: () => s.setDishFilters({ categoryId: c.id }) })),
    ] },
  ]
  const ingredientCounts = groupCounts(s.ingredients, PANTRY_CATEGORIES.map((c) => c.key), (i) => i.category)
  const ingredientSections: FilterSection[] = [
    levelSection(s.ingredients, s.ingredientFilters.level, (level) => s.setIngredientFilters({ level })),
    { title: t('filters.category'), columns: 1, options: [
      { key: 'all', label: t('filters.all'), count: ingredientCounts.all, active: s.ingredientFilters.category === null, onClick: () => s.setIngredientFilters({ category: null }) },
      ...PANTRY_CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${t(`categories.${c.key}`)}`, count: ingredientCounts[c.key], active: s.ingredientFilters.category === c.key, onClick: () => s.setIngredientFilters({ category: c.key as PantryCategory }) })),
    ] },
  ]

  async function request(i: Ingredient) {
    try {
      await requestIngredient(i.id)
      toast({ title: t('request.successTitle'), body: t('request.successBody') })
      await s.refresh()
    } catch (e) { toast({ title: t('error'), body: e instanceof Error ? e.message : String(e), tone: 'danger' }) }
  }
  async function remove(i: Ingredient) {
    setIngredientModal(null)
    try {
      await archiveIngredient(i.id)
      toast({ title: t('request.deletedTitle'), body: t('request.deletedBody', { name: i.name }) })
      await s.refresh()
    } catch (e) { toast({ title: t('error'), body: e instanceof Error ? e.message : String(e), tone: 'danger' }) }
  }

  // Ver el inventario lo hace cualquiera; crear, editar o borrar es un permiso que da el restaurante.
  // El ingrediente, como el plato, es de toda la organización: el servidor reserva crearlo, editarlo y archivarlo al dueño
  // (save_product y archive exigen owner). El encargado conserva existencias, movimientos y solicitudes al proveedor.
  const mayEditIngredients = mayEdit && owner
  const header = s.tab === 'menu'
    ? { query: s.dishFilters.query, onQuery: (query: string) => s.setDishFilters({ query }), placeholder: t('search.dish'), action: mayEdit && owner ? t('actions.addDish') : undefined, onAction: mayEdit && owner ? () => setAddDish(true) : undefined }
    : s.tab === 'ingredients'
      ? { query: s.ingredientFilters.query, onQuery: (query: string) => s.setIngredientFilters({ query }), placeholder: t('search.ingredient'), action: mayEditIngredients ? t('actions.addIngredient') : undefined, onAction: mayEditIngredients ? () => setIngredientModal({ kind: 'add' }) : undefined }
      : { query: s.requestQuery, onQuery: s.setRequestQuery, placeholder: t('search.request'), action: undefined, onAction: undefined }
  const listTitle = t(s.tab === 'menu' ? 'menu.listTitle' : s.tab === 'ingredients' ? 'ingredients.listTitle' : 'requests.listTitle')

  return (
    <>
      <PantryHeader tab={s.tab} onTab={s.setTab} query={header.query} onQuery={header.onQuery} searchPlaceholder={header.placeholder} action={header.action} onAction={header.onAction} />
      {/* Desde lg, la disposición de siempre: filtros de 352 px a la izquierda y la lista en tres columnas. Por debajo
          (tableta vertical, celular) los filtros van encima, plegables, y la lista usa todo el ancho en una o dos columnas. */}
      <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col lg:flex-row gap-4">
        {s.tab === 'menu' && <FilterPanel sections={menuSections} onReset={s.resetFilters} />}
        {s.tab === 'ingredients' && <FilterPanel sections={ingredientSections} onReset={s.resetFilters} />}
        <section aria-label={listTitle} className="flex-1 min-w-0 min-h-0 ambient-panel border border-border rounded-lg flex flex-col">
          <header className="min-h-14 lg:h-14 px-4 py-2 lg:py-0 flex flex-wrap lg:flex-nowrap items-center gap-y-2 border-b border-border shrink-0"><h2 className="text-[16px] font-semibold text-ink">{listTitle}</h2>
            {/* Lo que antes era Administración → Catálogo: categorías de la carta y platos ocultos o sin categoría. */}
            {s.tab === 'menu' && owner && <span className="ml-4 flex gap-2">
              <Button size="compact" onClick={() => setMenuAdmin({ kind: 'categories' })}>{t('menuAdmin.categories')}</Button>
              <Button size="compact" onClick={() => setMenuAdmin({ kind: 'offMenu' })}>{t('menuAdmin.offMenu')}</Button>
            </span>}<span className="ml-auto flex items-center gap-3">
              {/* Plan Y1: existencias de hoy y movimientos de los últimos 30 días, del servidor. */}
              <ExportMenu options={[{ kind: 'inventario', label: 'Existencias de hoy' }, { kind: 'movimientos', label: 'Movimientos (últimos 30 días)' }]}
                params={configId === null ? null : { restaurant_id: configId, from: daysAgo(30), to: daysAgo(0) }} />
              <button className="text-sm text-primary" onClick={()=>void s.refresh().catch(e=>toast({title:String(e),tone:'danger'}))}>Actualizar</button></span></header>
          <div className="flex-1 min-h-0 overflow-auto flex flex-col">
            {s.error && <p role="alert" className="m-4 p-3 rounded-md bg-danger-soft text-danger-ink text-[14px]">{s.error}</p>}
            {s.tab === 'menu' && (dishes.length === 0 && !s.loading
              ? <KitEmptyState icon="inventory" title={t('menu.empty')} body={t('menu.emptyBody')} />
              : <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 content-start">{dishes.map((d) => <DishCard key={d.id} dish={d} category={posCategoryName(d.categoryIds)} onOpen={() => void openDetail(d)} onEdit={owner ? () => setMenuAdmin({ kind: 'product', id: d.id }) : undefined} closedHere={closedHere.has(d.id)} onToggleHere={role === 'admin' && configId !== null ? () => void toggleHere(d) : undefined} />)}</div>)}
            {s.tab === 'ingredients' && (ingredients.length === 0 && !s.loading
              ? <KitEmptyState icon="inventory" title={t('ingredients.empty')} body={t('ingredients.emptyBody')} />
              : <ul className="p-2.5 flex flex-col gap-2">{ingredients.map((i) => <IngredientRow key={i.id} ingredient={i} onEdit={() => setIngredientModal({ kind: 'edit', ingredient: i })} onRequest={() => void request(i)} onDelete={() => setIngredientModal({ kind: 'delete', ingredient: i })} mayEdit={mayEditIngredients} onControl={()=>setControl(i)} />)}</ul>)}
            {s.tab === 'requests' && <RequestList requests={s.requests} query={s.requestQuery} />}
          </div>
        </section>
      </div>
      {menuAdmin && <MenuAdmin key={JSON.stringify(menuAdmin)} request={menuAdmin} onClose={() => setMenuAdmin(null)} onChanged={() => { void s.refresh(); void reloadCatalog(session?.id ?? null) }} />}
      {detail&&<RecipeEditor key={detail.id} dish={detail} ingredients={s.ingredients} units={s.units} mayEdit={owner} onClose={()=>setDetail(null)} onSaved={s.refresh}/>}
      {control&&<InventoryControl key={control.id} ingredient={control} mayEdit={role==='admin'} mayEditCost={owner} onClose={()=>setControl(null)} onSaved={s.refresh}/>}
      <AddDishWizard open={addDish} onClose={() => setAddDish(false)} categories={s.posCategories} ingredients={s.ingredients} units={s.units} onSaved={s.refresh} />
      {(ingredientModal?.kind === 'add' || ingredientModal?.kind === 'edit') && (
        <AddIngredientWizard open onClose={() => setIngredientModal(null)} initial={ingredientModal.kind === 'edit' ? ingredientModal.ingredient : null}
          units={s.units} suppliers={s.suppliers} onSaved={s.refresh} />
      )}
      <Modal open={ingredientModal?.kind === 'delete'} onClose={() => setIngredientModal(null)} footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setIngredientModal(null)}>{t('request.deleteNo')}</Button>
          <Button variant="destructive" onClick={() => ingredientModal?.kind === 'delete' && void remove(ingredientModal.ingredient)}>{t('request.deleteYes')}</Button>
        </div>}>
        <div className="p-6 flex flex-col gap-2">
          <p className="text-[20px] font-semibold text-ink">{t('request.deleteTitle')}</p>
          <p className="text-soft">{ingredientModal?.kind === 'delete' ? t('request.deleteBody', { name: ingredientModal.ingredient.name }) : ''}</p>
        </div>
      </Modal>
    </>
  )
}
