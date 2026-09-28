"""Siembra demo de la despensa: categorías del kit, ocho ingredientes, dos proveedores y recetas de seis platos demo.

Idempotente: busca por nombre antes de crear. Corre en `post_init_hook` y puede repetirse con `seed_demo(env)`.
"""
SUPPLIERS = [
    ("Distribuidora La Finca", "compras@lafinca.example.com", ("produce", "dairy", "dry")),
    ("Carnes y Mares del Valle", "pedidos@carnesymares.example.com", ("meat", "seafood")),
]

# nombre, categoría, unidad (xml id de uom), costo, stock inicial, mínimo, máximo
INGREDIENTS = [
    ("Carne de res Angus", "meat", "uom.product_uom_kgm", 42000.0, 12.0, 5.0, 20.0),
    ("Pan brioche", "dry", "uom.product_uom_unit", 1800.0, 60.0, 20.0, 100.0),
    ("Queso cheddar", "dairy", "uom.product_uom_kgm", 28000.0, 3.0, 5.0, 20.0),
    ("Huevos", "dairy", "uom.product_uom_unit", 700.0, 0.0, 30.0, 120.0),
    ("Salmón fresco", "seafood", "uom.product_uom_kgm", 65000.0, 25.0, 5.0, 20.0),
    ("Papa criolla", "produce", "uom.product_uom_kgm", 4500.0, 8.0, 5.0, 20.0),
    ("Limón", "produce", "uom.product_uom_unit", 400.0, 40.0, 20.0, 100.0),
    ("Arroz", "dry", "uom.product_uom_kgm", 3800.0, 30.0, 5.0, 20.0),
]

# plato demo (búsqueda =ilike) → [(ingrediente, cantidad)]
RECIPES = {
    "Hamburguesa Angus": [("Carne de res Angus", 0.2), ("Pan brioche", 1.0), ("Queso cheddar", 0.03)],
    "Hamburguesa Clásica": [("Carne de res Angus", 0.15), ("Pan brioche", 1.0), ("Queso cheddar", 0.03)],
    "Arepa con huevo y queso": [("Huevos", 1.0), ("Queso cheddar", 0.05)],
    "Bowl de salmón": [("Salmón fresco", 0.18), ("Arroz", 0.15)],
    "Papas Trufadas": [("Papa criolla", 0.3)],
    "Limonada de Coco": [("Limón", 2.0)],
}


def post_init_hook(env):
    seed_demo(env)


def seed_demo(env, config_id=None):
    config = env['pos.config']._waiter_selected_config(config_id)
    env = env(context={**env.context, 'waiter_config_id': config.id})
    Template = env["product.template"]
    Partner = env["res.partner"]
    suppliers = {}
    for name, email, categories in SUPPLIERS:
        partner = Partner.search([("name", "=", name)], limit=1)
        if not partner:
            partner = Partner.create({"name": name, "email": email, "is_company": True, "supplier_rank": 1})
        for category in categories:
            suppliers[category] = partner

    ingredients = {}
    for name, category, uom_ref, cost, stock, min_qty, max_qty in INGREDIENTS:
        template = Template.search([("name", "=", name), ("is_ingredient", "=", True)], limit=1)
        if not template:
            template = Template.browse(Template.waiter_create_ingredient(
                {"name": name, "pantry_category": category, "uom_id": env.ref(uom_ref).id, "standard_price": cost,
                 "pantry_min": min_qty, "pantry_max": max_qty},
                initial_qty=stock, supplier_id=suppliers[category].id,
            )["id"])
        if not template._pantry_orderpoints().get(template.id):
            template.waiter_set_thresholds(min_qty, max_qty)
            template.waiter_set_stock(stock)
        ingredients[name] = template

    for dish_name, lines in RECIPES.items():
        dish = Template.search([("name", "=ilike", dish_name), ("is_ingredient", "=", False)], limit=1)
        if dish and not dish.has_recipe:
            dish.waiter_set_recipe([{"product_tmpl_id": ingredients[name].id, "qty": qty} for name, qty in lines])
    return ingredients
