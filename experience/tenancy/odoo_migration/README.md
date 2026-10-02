# Migración T6 desde Odoo

El comando vive en `tenancy`; solo lee Odoo. Reutiliza `OdooClient.call_kw` y acepta otro cliente mediante
`Command.client_factory` o directamente `Migrator(client, organization, ...)`. Las pruebas usan respuestas por
`(modelo, método)` y no requieren Odoo, registro ni servidores.

Desde `experience/`, después de aplicar las migraciones de Django:

```bash
venv/bin/python manage.py migrate_from_odoo --org burger-house \
  --url http://odoo:8069 --db projectapp --login USUARIO --password CLAVE \
  --registry-tokens /ruta/tokens.json --no-invite
venv/bin/python manage.py migrate_from_odoo --org burger-house --remap-diner
```

`--remap-diner` también puede acompañar a la primera invocación. Como segundo paso solo necesita `--org` y los mapas
locales; no crea un cliente Odoo. `--company-id` es obligatorio si la base devuelve varias compañías. `--batch-size`
controla las páginas (1–1000, predeterminado 200). `fields_get` limita las lecturas a los campos disponibles y el informe
nombra los ausentes para que la integración pueda revisarlos. No se leen contraseñas, PIN ni secretos del origen.

El archivo del registro es una lista de objetos con estas cuatro claves:

```json
[{"venue":"poblado","odoo_table_id":62,"token":"QR1234","table_number":4}]
```

`venue` es el **slug de la sede**, no su id en la base del registro. Se comprueban sede, mesa, número, formato y unicidad
global del token del destino. Se rechazan entradas duplicadas o sin mesa correspondiente. Sin archivo se conservan los
tokens locales existentes y se generan los de las mesas nuevas; ese caso no conserva por sí mismo los QR del registro.

## Decisiones de importación

- `LegacySource` vincula la organización a URL, base y compañía. `LegacyMap` separa los ids por organización y modelo;
  distingue `product.template` de `product.product`. También reconoce los ids heredados de restaurantes, productos y
  cuentas que existieran antes del comando. Reutiliza el piso y el efectivo sembrados al crear una sede.
- La escritura es transaccional por organización. Un error revierte los datos y los archivos nuevos de esta ejecución.
  Las invitaciones usan el servicio de cuentas tras el commit; un fallo de correo se informa y puede reintentarse.
  `--no-invite` conserva las cuentas pendientes y no manda correos. Las cuentas ya activadas mantienen su contraseña.
- Se usan los servicios de productos, imágenes, recetas, marca, horarios, planos, promociones y validación de mesas de
  reservas. Las entidades archivadas del catálogo se habilitan dentro de la transacción para enlazar el histórico y
  recuperan su estado de origen antes del commit.
- Los históricos se guardan como copias validadas: ejecutar `pay`, `fire` o los servicios de apertura/cierre produciría
  ventas, stock, puntos o avisos nuevos. No se crean asientos ni documentos fiscales. Se conservan fechas UTC de Odoo;
  `date_order` es también la fecha de venta para informes, como en el informe anterior de Odoo.
- La propina se reconoce por `pos.config.tip_product_id` y queda fuera de las líneas de consumo. Los pagos negativos
  en efectivo se imputan como cambio a las entregas positivas del mismo pedido y método. Se exige conciliar líneas,
  propina y pagos con el total del pedido. Las devoluciones con cantidad negativa requieren resolver su representación
  antes de importar: el destino exige cantidades positivas.
- Se importan solo cajas cerradas y pedidos `paid`, `done` o `invoiced`. Un pedido pagado en caja abierta detiene la
  ejecución. Las reservas conservan anticipos y token; sus platos pendientes pasan a `ReservationLine`, sin importar
  el pedido en borrador. Se validan capacidad, medias horas y conflictos, sin reenviar correos de reservas ni cobrar.
- Se conservan NIT, DV si existe, dirección y contacto. El régimen se deduce de los impuestos de la carta. El origen
  anterior no define responsabilidades RUT; quedan para revisión del emisor y se señalan en el informe. No se inventan.
- Un código de tarjeta de más de ocho caracteres se convierte determinísticamente en ocho caracteres, evitando
  colisiones; el informe cuenta esas adaptaciones. `LegacyMap(model='loyalty.card')` permite localizar la tarjeta y su
  código nuevo. Los puntos no se vuelven a conceder como movimientos.
- Se rechazan conversiones desconocidas de unidades usadas, varias variantes por plantilla, varias recetas de kit
  activas por plato y pisos compartidos entre sedes: esos casos no tienen representación inequívoca en T0–T5.
- Las políticas de roles se leen de las claves concretas `waiter.role_permissions` y sus respaldos por terminal.
  El rol efectivo conserva el menor entre usuario y empleado. Los restaurantes de una cuenta se validan según el rol;
  las correspondencias nunca permiten referenciar otra organización.

## Revisión de integración

Revisar los campos ausentes indicados en el informe y, en particular, `warehouse_id`/`lot_stock_id`, unidades
`relative_uom_id`/`relative_factor`, `floor_background_image`, `waiter_plan.backgroundSize`, `images[].attachmentId`,
`waiter_zone_staff`, `waiter_zone_assignments`, `waiter_channel`, `tax_ids_after_fiscal_position` y `tip_product_id`.
Los banners usan `targetId`; las restricciones de promociones usan `configs`; los atributos del comensal usan
`extras`, `acompanamientos` y `combo[].producto` con ids de **variantes** Odoo. Los adjuntos del plano se leen por lotes,
se comprueba su pertenencia al piso y se convierten a WebP.

El remapeo cubre los seis campos del contrato y además el pedido histórico del comensal, las tarjetas de carrito y
los métodos guardados en intentos de pago. Lleva una marca por fila para que repetirlo no aplique una traducción sobre
otra; también admite ids que se intercambian entre favoritos. Una referencia sin mapa aborta todo el remapeo.

Ejecutar ambos pasos en una ventana sin escrituras de Odoo ni del comensal y verificar el informe antes de cambiar
`ODOO_ORGS` y `NEXT_PUBLIC_ODOO_ORGS`. El comando no cambia esas variables ni inicia/detiene servicios. Tras conmutar,
no usar la importación como sincronización con una base que ya recibe escrituras propias.

No se añaden rutas HTTP ni códigos de error de API. Los errores del comando son `CommandError` en español, con salida
no exitosa; los servicios conservan sus validaciones y códigos actuales. La tabla final cuenta leídos, creados,
actualizados y omitidos con motivo por dominio.
