{
    "name": "ProjectApp — Despensa (ingredientes, recetas y solicitudes al proveedor)",
    "summary": "Ingredientes con categoría y niveles Low / Medium / High / Empty, receta por plato (mrp.bom kit), raciones servibles y solicitud de compra al proveedor. Sin vistas: lo consume el POS propio.",
    "version": "19.0.2.5.0",
    "license": "LGPL-3",
    "author": "ProjectApp",
    "category": "Point of Sale",
    "depends": ["mrp", "purchase", "stock", "uom", "point_of_sale", "pos_mrp", "projectapp_ops"],
    "data": ["security/restaurants.xml", "data/precision.xml"],
    "post_init_hook": "post_init_hook",
    "installable": True,
    "auto_install": False,
}
