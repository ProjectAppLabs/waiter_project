{
    "name": "ProjectApp — Operación (origen del pedido, umbrales, kit CloudPos)",
    "summary": "Campos sin interfaz para el backoffice propio: quién originó cada pedido, umbrales de alerta, supuestos del ROI, "
               "marca del restaurante, origen de cada foto y los datos que el kit CloudPos necesita (silla de bebé, prefijo y "
               "número del pedido, PIN de empleado con bloqueo, turno, preferencias de notificación, presets y fidelización).",
    "version": "19.0.2.1.0",
    "license": "LGPL-3",
    "author": "ProjectApp",
    "category": "Point of Sale",
    "depends": ["pos_restaurant", "pos_self_order", "pos_hr", "hr_attendance", "pos_loyalty", "account", "product", "stock", "mail", "projectapp_kitchen"],
    "data": ["security/groups.xml", "data/sequence.xml"],
    "post_init_hook": "post_init_hook",
    "installable": True,
    "auto_install": False,
}
