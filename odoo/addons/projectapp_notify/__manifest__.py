{
    "name": "ProjectApp — Notificaciones del kit",
    "summary": "waiter.notification (cocina / inventario / sistema) y sus generadores: plato listo desde el curso, stock bajo "
               "desde las reglas de reabastecimiento y solicitud de ingrediente al proveedor (purchase.order). Sin vistas.",
    "version": "19.0.2.6.0",
    "license": "LGPL-3",
    "author": "ProjectApp",
    "category": "Point of Sale",
    "depends": ["projectapp_ops", "projectapp_kitchen", "projectapp_bus", "stock", "purchase"],
    "data": [
        "security/ir.model.access.csv", "security/restaurants.xml",
        "security/rules.xml",
        "data/cron.xml",
    ],
    "installable": True,
    "auto_install": False,
}
