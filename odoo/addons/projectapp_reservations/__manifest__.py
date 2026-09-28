{
    "name": "ProjectApp — Reservas de mesa",
    "summary": "Reservas por franja de 30 minutos con mesa, personas, silla de bebé, pre-pedido y correo de confirmación. Sin vistas: lo consume el POS propio.",
    "version": "19.0.2.5.0",
    "license": "LGPL-3",
    "author": "ProjectApp",
    "category": "Point of Sale",
    "depends": ["projectapp_ops", "pos_restaurant", "mail"],
    "data": [
        "security/ir.model.access.csv", "security/restaurants.xml",
        "data/sequence.xml",
        "data/mail_template.xml",
    ],
    "installable": True,
    "auto_install": False,
}
