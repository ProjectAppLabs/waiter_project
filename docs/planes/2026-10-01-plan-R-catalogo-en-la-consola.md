# Plan R · El catálogo completo en la consola del dueño

**Qué.** El plan Q dejó en manos del dueño crear platos, su ficha comercial, sus categorías, las recetas y el costo de
los ingredientes. Pero las herramientas seguían en Inventario del POS de cada restaurante: para cargar una receta, el
dueño tenía que entrar a un restaurante. Este plan las lleva a **Consola → Catálogo**, donde ya estaban el precio y los
agotados por restaurante.

Así se destapa Rentabilidad (plan Q4): 23 de los 24 platos de la base de desarrollo salen «Sin costo» porque no tienen
receta.

## Consola → Catálogo

Cuatro pestañas:

- **Platos:** todos los platos de la organización. Cada uno muestra:
  - categoría y precio de carta;
  - si tiene foto;
  - el estado de la receta: con costo, sin receta, o con ingredientes sin costo (con sus nombres);
  - el costo de la receta.

  Filtros: Todos, Sin receta y Sin costo. Acciones:
  - **Nuevo plato:** el asistente de Inventario (`AddDishWizard`).
  - **Ficha:** precio, foto, categoría, impuestos y visibilidad (`MenuAdmin` de un plato).
  - **Receta:** el editor de Inventario (`RecipeEditor`), con su costo.
- **Categorías:** las de la carta, y los platos fuera de la carta para devolverlos (`MenuAdmin` de categorías y de
  ocultos).
- **Ingredientes:** nombre, unidad, costo por unidad (editable en la misma fila), en cuántos platos se usa, y
  «Nuevo ingrediente» (`AddIngredientWizard`). El costo vale para toda la organización.
- **Precios por restaurante:** la vista actual (`CatalogView`), con el precio y el agotado de cada restaurante.

Desde **Rentabilidad**, «N platos sin costo» lleva a Catálogo → Platos con el filtro «Sin costo».

En el POS, Inventario sigue igual: el dueño también puede editar desde allí y el encargado solo opera.

## Contrato común

`projectapp_pantry` sube a 19.0.2.7.0. Dueño = `projectapp_ops.group_waiter_owner` o `base.group_system`; para los demás
es `AccessError` con mensaje en español.

### `product.template.waiter_catalog_overview()`

`@api.model`, solo el dueño. Una sola llamada para la consola, sin una lectura de receta por plato.

```json
{"currency": "COP",
 "dishes": [{"template_id": 42, "name": "Papas Trufadas", "categories": ["Para compartir"], "category_ids": [5],
             "list_price": 8900.0, "available_in_pos": true, "has_image": true,
             "has_recipe": true, "ingredients_count": 1, "recipe_cost": 1125.0, "missing_costs": []}],
 "ingredients": [{"template_id": 11, "name": "Papa criolla", "uom": "kg", "cost": 4500.0, "used_in": 1}]}
```

- **Platos:** los mismos que lista Inventario: no son ingredientes, tienen categoría del POS y están activos, incluidos
  los ocultos de la carta (`available_in_pos` en falso). Ordenados por nombre.
- **`recipe_cost`:** la suma de la receta, cantidad × `standard_price` (lo mismo que `waiter_recipe_detail`). Es `null`
  sin receta o si algún ingrediente tiene costo 0.
- **`missing_costs`:** los nombres de los ingredientes de la receta con costo 0.
- **Ingredientes:** los activos con `is_ingredient`. `used_in` cuenta los platos activos cuya receta los usa. Ordenados
  por nombre.

### `product.template.waiter_set_ingredient_cost(cost)`

- Sobre un ingrediente (`[[template_id], cost]`), solo el dueño.
- El costo debe ser un número finito ≥ 0, y el registro, un ingrediente; si no, `ValidationError`.
- Escribe `standard_price` y devuelve `{"template_id": 11, "cost": 4500.0}`.
- No necesita el turno ni el token: vale para toda la organización, no para un restaurante.

## Reparto

| Parte | Quién |
|---|---|
| Odoo: los dos métodos, con pruebas «Falla si…» | Codex |
| Consola → Catálogo con sus cuatro pestañas y el enlace desde Rentabilidad | Claude |
| Verificación en Docker y Chromium: cargar recetas y ver su margen en Rentabilidad | Claude |
