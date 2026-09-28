# Traspaso O1 y O2 · 2026-09-28

Implementación en `codex/28092026-plan-o`. Se respetan los nombres, firmas y respuestas del «Contrato común» del
[Plan O](../planes/2026-09-28-plan-O-multirrestaurante.md). `projectapp_ops` queda en **19.0.2.5.0**; reservas,
notificaciones y despensa también suben a esa versión para cargar sus cambios de esquema y seguridad.

No se modificaron `pos/`, `diner/` ni `.env`. No se iniciaron, detuvieron o reiniciaron servicios ni se hicieron commits.
Las migraciones se probaron sobre copias: las bases de desarrollo originales no fueron modificadas.

## Resultado

- Odoo: identidad y ubicación por config, dueño/encargado y asignaciones explícitas, sincronización de PIN,
  aislamiento por reglas globales, alta de restaurantes con recursos propios y listado para la consola.
- Empresa: banners y beneficios compartidos con `configs` opcional; cupones globales por defecto; política de roles
  sin sufijo. Los ajustes operativos siguen en el config. La empresa conserva sus datos legales y marca.
- Operación: reservas y notificaciones con config; avisos por canal local; stock, compras y movimientos por almacén;
  semillas con contexto de restaurante; pasarelas administrativas con `config_id`.
- Registro: una organización comparte URL/base de Odoo; un config no puede duplicarse bajo dos slugs de esa
  organización; `add_venue` copia las credenciales cifradas y consulta exclusivamente las mesas del config indicado.
- Experience: cuenta, historial, favoritos, premios, diseño, decoraciones y MCP por organización. Misma dirección
  de correo admitida en organizaciones diferentes; cambios de restaurante del grupo conservan la cuenta y sus
  beneficios. Cambio de organización inicia una sesión sin la cuenta anterior.
- Portada: `GET /api/v1/<org>/` entrega las claves exactas del contrato, marca de la empresa del config y direcciones
  locales. El índice interno del registro exige `X-Internal-Key` y no entrega credenciales.

## Integración para Claude

1. Enviar el config seleccionado en `context.waiter_config_id` y en las pasarelas `/waiter/admin/*` mediante
   `config_id`. La identidad PIN admite `config_id`; el guardia del servidor comprueba también el alcance del empleado.
   Si hay varios restaurantes y falta la selección, se rechaza la operación ambigua. La compatibilidad sin selección
   solo se conserva cuando hay exactamente un config accesible.
2. `waiter_restaurants`, `waiter_create_restaurant` y ambos `waiter_set_restaurants` conservan las firmas acordadas.
   El dueño ignora su lista de asignaciones; el encargado opera sus restaurantes. Una reasignación invalida la caché
   de reglas de Odoo y sincroniza el empleado vinculado al usuario.
3. Banners, acciones y cupones aceptan `configs: []` para todos o una lista de ids para restringir. Las acciones
   exponen siempre esa lista en los ajustes. El valor efectivo de `config.signup_discount_percent` es cero cuando
   la acción de primera compra excluye ese restaurante; el porcentaje base permanece en la empresa.
4. Extensión para disponibilidad local, que el contrato no nombraba: `product.template.waiter_unavailable_config_ids`
   y `product.template.waiter_set_availability(config_id, available)`. Se invoca sobre los ids de plantilla, por
   ejemplo `args=[[template_id], config_id, false]`. El POS debe usarla para «agotado» del restaurante;
   `available_in_pos` sigue siendo la pertenencia al catálogo maestro. Experience ya la lee.
5. Extensión interna para precios: `pos.config.waiter_catalog_prices(product_ids)`, sobre un config, devuelve
   `{ "<product.product.id>": precio_unitario }` usando su lista nativa de Odoo. Experience la usa al cargar la carta;
   no exige una llamada nueva del POS.
6. Los premios concedidos por acciones restringidas incluyen opcionalmente `premio.configs`. Experience conserva
   esa restricción al compartir el premio dentro de la organización y filtra su presentación y consumo.
7. Las decoraciones nuevas se sirven en `/api/v1/<org>/decoraciones/<slug>/?v=...`; la ruta anterior con restaurante
   continúa funcionando. Los endpoints administrativos conservan sus URL anteriores y almacenan con `venue_slug=''`.
8. Recuperar/restablecer contraseña toma la organización de la cookie `waiter_diner`. El menú debe abrir la sesión
   del restaurante antes de esos formularios, también al entrar por un enlace de recuperación. Los slugs del cuerpo
   de la petición no eligen la organización.

No se renombraron claves ni métodos del contrato. Los puntos 4–6 son extensiones para cubrir disponibilidad,
precios y restricciones de premios compartidos; el punto 4 requiere integrar el control de agotado del POS.

## Decisiones donde faltaba detalle

- `Tenant` conserva `restaurant_slug/name` como alias históricos de organización y añade propiedades explícitas
  `organization_slug/name`; `venue_slug/name` identifica el restaurante. Esto conserva las llamadas existentes.
- Una clave MCP de organización resuelve el primer restaurante activo como representante para sus consultas a Odoo.
  El borrador conserva el restaurante de vista previa en `payload.preview_venue_slug`; su alcance persistido es la
  organización. La portada pública devuelve 404 si no existe un restaurante activo desde el cual resolverla.
- Si hay varios ajustes de diseño históricos, prevalece el más reciente. Favoritos se deduplican y un premio usado
  prevalece sobre uno disponible. Decoraciones de igual slug e igual contenido se deduplican; contenido divergente
  detiene la migración. Una cuenta histórica ligada a varias organizaciones también detiene la migración para evitar
  mezclar identidades. Cuentas sin vínculo histórico se atribuyen a `burger-house`, la organización de esta base.
- Las claves antiguas de descuento se vuelven a hashear con la organización, preservando los descuentos ya usados.
  La migración de datos de Django no restaura automáticamente el reparto anterior por restaurante al revertirla.
- Las acciones de beneficios antiguas conservan la fila más antigua por empresa/acción. Los cupones ya existentes
  pasan a todos los restaurantes. La migración 19.0.2.4.0 también admite los modelos actuales al saltar versiones.
- El listado de restaurantes considera abierta una sesión en `opening_control` u `opened`; ventas/pedidos del día
  incluyen estados `paid`, `done` e `invoiced` y usan los límites del día ya existentes en Odoo.
- La receta y el catálogo siguen compartidos. Modificar una receta verifica pedidos pendientes de toda la empresa;
  consultar cantidades, faltantes o movimientos usa el almacén seleccionado.

## Validación realizada

| Comprobación | Resultado |
|---|---|
| `cd experience && venv/bin/python -m pytest -q` | **706 passed, 7 deselected** |
| `cd registry && venv/bin/python -m pytest -q` | **18 passed** |
| `manage.py makemigrations --check --dry-run`, ambos servicios | Sin cambios pendientes |
| `py_compile`, cinco addons afectados | **83 archivos Python**, sin errores |
| XML de los addons y archivos de sus manifiestos | Válidos y presentes |
| `git diff --check` | Sin errores |

Los siete tests excluidos de experience son los marcados `contract`, excluidos por la configuración existente del
proyecto. En una ejecución intermedia apareció el bloqueo SQLite conocido del verificador; el reintento y las
ejecuciones completas finales pasaron. **No se ejecutaron pruebas de Odoo**: este sandbox no tiene Docker.

Pruebas nuevas: nueve métodos Odoo para reglas de pedidos/sesiones/pagos/configs, invalidación de reglas tras
reasignar, lista PIN, límites por rol, protección frente a `pos_hr`, alta/listado de restaurantes, disponibilidad
local y banners/beneficios compartidos; once funciones experience para cuentas/recuperación, diseño/MCP compartido,
portada, migración histórica, índice del registro, catálogo/precios/stock/efectivo y premio restringido; cuatro
funciones del registro para autorización del índice, aprovisionamiento idempotente, base única y filtro de mesas.
Las expectativas anteriores que suponían aislamiento por sede se trasladaron al aislamiento por organización.

Se crearon copias SQLite consistentes con los originales abiertos solo para lectura y se migraron en `/tmp`:

- Experience: `0029_organization_scope` aplicada; permanecen 1 cuenta, 1 premio, 1 ajuste de diseño, 3 claves MCP y
  15 borradores. El diseño cambia de `('burger-house', 'poblado')` a `('burger-house', '')`.
- Registro: `0004_organization_venues` aplicada; permanece `burger-house / poblado / config 1`.

Logs finales: `/tmp/plan-o-experience-final.log` y `/tmp/plan-o-registry-final.log`.

## Pendiente de ejecutar en el entorno de Claude

- Actualizar conjuntamente `projectapp_ops`, `projectapp_reservations`, `projectapp_notify` y `projectapp_pantry`
  a 19.0.2.5.0, y cargar el código actualizado de `projectapp_bus`. Ejecutar las pruebas de Odoo en una base de prueba.
  Revisar especialmente instalación/actualización, reglas efectivas, contabilidad al crear efectivo y la interacción
  con los cómputos y altas automáticas de `pos_hr`; la compilación no comprueba esos comportamientos.
- Aplicar `manage.py migrate` en ambos servicios cuando se integre la rama. Las bases originales siguen pendientes
  de migrar; las pruebas anteriores solo validan copias.
- Crear el segundo config con `waiter_create_restaurant` y darlo de alta en el registro:
  `venv/bin/python manage.py add_venue burger-house laureles 'Laureles' --pos-config-id N`.
  El comando puede repetirse después de crear mesas para emitir los tokens nuevos sin duplicar los existentes.
- Completar O3/O4 contra estas firmas y ejecutar O5 con dos locales: pedidos, sesiones, caja/efectivo, stock,
  notificaciones, reservas, consola del dueño, agotado local y cambio de restaurante del comensal.

## Archivos tocados

El inventario siguiente incluye código, migraciones, reglas y pruebas; todas las rutas son relativas a la raíz.

### odoo (42 archivos)

- [odoo/addons/projectapp_bus/models/bus.py](../../odoo/addons/projectapp_bus/models/bus.py)
- [odoo/addons/projectapp_notify/__manifest__.py](../../odoo/addons/projectapp_notify/__manifest__.py)
- [odoo/addons/projectapp_notify/migrations/19.0.2.5.0/post-migrate.py](../../odoo/addons/projectapp_notify/migrations/19.0.2.5.0/post-migrate.py)
- [odoo/addons/projectapp_notify/models/line.py](../../odoo/addons/projectapp_notify/models/line.py)
- [odoo/addons/projectapp_notify/models/notification.py](../../odoo/addons/projectapp_notify/models/notification.py)
- [odoo/addons/projectapp_notify/security/restaurants.xml](../../odoo/addons/projectapp_notify/security/restaurants.xml)
- [odoo/addons/projectapp_ops/__init__.py](../../odoo/addons/projectapp_ops/__init__.py)
- [odoo/addons/projectapp_ops/__manifest__.py](../../odoo/addons/projectapp_ops/__manifest__.py)
- [odoo/addons/projectapp_ops/controllers/admin.py](../../odoo/addons/projectapp_ops/controllers/admin.py)
- [odoo/addons/projectapp_ops/controllers/role_permissions.py](../../odoo/addons/projectapp_ops/controllers/role_permissions.py)
- [odoo/addons/projectapp_ops/migrations/19.0.2.4.0/post-migrate.py](../../odoo/addons/projectapp_ops/migrations/19.0.2.4.0/post-migrate.py)
- [odoo/addons/projectapp_ops/migrations/19.0.2.5.0/post-migrate.py](../../odoo/addons/projectapp_ops/migrations/19.0.2.5.0/post-migrate.py)
- [odoo/addons/projectapp_ops/models/__init__.py](../../odoo/addons/projectapp_ops/models/__init__.py)
- [odoo/addons/projectapp_ops/models/benefit_actions.py](../../odoo/addons/projectapp_ops/models/benefit_actions.py)
- [odoo/addons/projectapp_ops/models/config.py](../../odoo/addons/projectapp_ops/models/config.py)
- [odoo/addons/projectapp_ops/models/employee.py](../../odoo/addons/projectapp_ops/models/employee.py)
- [odoo/addons/projectapp_ops/models/floor_plan.py](../../odoo/addons/projectapp_ops/models/floor_plan.py)
- [odoo/addons/projectapp_ops/models/gateway_payments.py](../../odoo/addons/projectapp_ops/models/gateway_payments.py)
- [odoo/addons/projectapp_ops/models/menu_banners.py](../../odoo/addons/projectapp_ops/models/menu_banners.py)
- [odoo/addons/projectapp_ops/models/menu_benefits.py](../../odoo/addons/projectapp_ops/models/menu_benefits.py)
- [odoo/addons/projectapp_ops/models/product.py](../../odoo/addons/projectapp_ops/models/product.py)
- [odoo/addons/projectapp_ops/models/restaurants.py](../../odoo/addons/projectapp_ops/models/restaurants.py)
- [odoo/addons/projectapp_ops/models/role_permissions.py](../../odoo/addons/projectapp_ops/models/role_permissions.py)
- [odoo/addons/projectapp_ops/models/seed.py](../../odoo/addons/projectapp_ops/models/seed.py)
- [odoo/addons/projectapp_ops/models/tax_regime.py](../../odoo/addons/projectapp_ops/models/tax_regime.py)
- [odoo/addons/projectapp_ops/models/users.py](../../odoo/addons/projectapp_ops/models/users.py)
- [odoo/addons/projectapp_ops/security/groups.xml](../../odoo/addons/projectapp_ops/security/groups.xml)
- [odoo/addons/projectapp_ops/security/restaurants.xml](../../odoo/addons/projectapp_ops/security/restaurants.xml)
- [odoo/addons/projectapp_ops/tests/__init__.py](../../odoo/addons/projectapp_ops/tests/__init__.py)
- [odoo/addons/projectapp_ops/tests/test_menu_benefits.py](../../odoo/addons/projectapp_ops/tests/test_menu_benefits.py)
- [odoo/addons/projectapp_ops/tests/test_restaurants.py](../../odoo/addons/projectapp_ops/tests/test_restaurants.py)
- [odoo/addons/projectapp_ops/tests/test_role_permissions.py](../../odoo/addons/projectapp_ops/tests/test_role_permissions.py)
- [odoo/addons/projectapp_pantry/__manifest__.py](../../odoo/addons/projectapp_pantry/__manifest__.py)
- [odoo/addons/projectapp_pantry/hooks.py](../../odoo/addons/projectapp_pantry/hooks.py)
- [odoo/addons/projectapp_pantry/models/catalog_combos.py](../../odoo/addons/projectapp_pantry/models/catalog_combos.py)
- [odoo/addons/projectapp_pantry/models/product_template.py](../../odoo/addons/projectapp_pantry/models/product_template.py)
- [odoo/addons/projectapp_pantry/models/restaurant_inventory.py](../../odoo/addons/projectapp_pantry/models/restaurant_inventory.py)
- [odoo/addons/projectapp_pantry/security/restaurants.xml](../../odoo/addons/projectapp_pantry/security/restaurants.xml)
- [odoo/addons/projectapp_reservations/__manifest__.py](../../odoo/addons/projectapp_reservations/__manifest__.py)
- [odoo/addons/projectapp_reservations/migrations/19.0.2.5.0/post-migrate.py](../../odoo/addons/projectapp_reservations/migrations/19.0.2.5.0/post-migrate.py)
- [odoo/addons/projectapp_reservations/models/reservation.py](../../odoo/addons/projectapp_reservations/models/reservation.py)
- [odoo/addons/projectapp_reservations/security/restaurants.xml](../../odoo/addons/projectapp_reservations/security/restaurants.xml)

### registry (8 archivos)

- [registry/registry_app/management/commands/add_venue.py](../../registry/registry_app/management/commands/add_venue.py)
- [registry/registry_app/management/commands/seed_demo.py](../../registry/registry_app/management/commands/seed_demo.py)
- [registry/registry_app/migrations/0004_organization_venues.py](../../registry/registry_app/migrations/0004_organization_venues.py)
- [registry/registry_app/models/restaurant.py](../../registry/registry_app/models/restaurant.py)
- [registry/registry_app/models/venue.py](../../registry/registry_app/models/venue.py)
- [registry/registry_app/tests/test_organizations.py](../../registry/registry_app/tests/test_organizations.py)
- [registry/registry_app/urls/__init__.py](../../registry/registry_app/urls/__init__.py)
- [registry/registry_app/views/resolve.py](../../registry/registry_app/views/resolve.py)

### experience (44 archivos)

- [experience/experience_app/adapters/odoo/client.py](../../experience/experience_app/adapters/odoo/client.py)
- [experience/experience_app/adapters/odoo/pos.py](../../experience/experience_app/adapters/odoo/pos.py)
- [experience/experience_app/adapters/registry/client.py](../../experience/experience_app/adapters/registry/client.py)
- [experience/experience_app/diseno/borradores.py](../../experience/experience_app/diseno/borradores.py)
- [experience/experience_app/diseno/decoraciones.py](../../experience/experience_app/diseno/decoraciones.py)
- [experience/experience_app/diseno/models.py](../../experience/experience_app/diseno/models.py)
- [experience/experience_app/diseno/views.py](../../experience/experience_app/diseno/views.py)
- [experience/experience_app/mcp/keys.py](../../experience/experience_app/mcp/keys.py)
- [experience/experience_app/mcp/models.py](../../experience/experience_app/mcp/models.py)
- [experience/experience_app/mcp/tools.py](../../experience/experience_app/mcp/tools.py)
- [experience/experience_app/migrations/0029_organization_scope.py](../../experience/experience_app/migrations/0029_organization_scope.py)
- [experience/experience_app/models/diner_account.py](../../experience/experience_app/models/diner_account.py)
- [experience/experience_app/models/diner_favorite.py](../../experience/experience_app/models/diner_favorite.py)
- [experience/experience_app/models/diner_reward.py](../../experience/experience_app/models/diner_reward.py)
- [experience/experience_app/plantillas/models.py](../../experience/experience_app/plantillas/models.py)
- [experience/experience_app/plantillas/services.py](../../experience/experience_app/plantillas/services.py)
- [experience/experience_app/services/account.py](../../experience/experience_app/services/account.py)
- [experience/experience_app/services/banners.py](../../experience/experience_app/services/banners.py)
- [experience/experience_app/services/benefits.py](../../experience/experience_app/services/benefits.py)
- [experience/experience_app/services/brand.py](../../experience/experience_app/services/brand.py)
- [experience/experience_app/services/discount.py](../../experience/experience_app/services/discount.py)
- [experience/experience_app/services/orders.py](../../experience/experience_app/services/orders.py)
- [experience/experience_app/services/rewards.py](../../experience/experience_app/services/rewards.py)
- [experience/experience_app/services/sessions.py](../../experience/experience_app/services/sessions.py)
- [experience/experience_app/tests/adapters/test_odoo_brand.py](../../experience/experience_app/tests/adapters/test_odoo_brand.py)
- [experience/experience_app/tests/adapters/test_odoo_pos.py](../../experience/experience_app/tests/adapters/test_odoo_pos.py)
- [experience/experience_app/tests/adapters/test_registry_client.py](../../experience/experience_app/tests/adapters/test_registry_client.py)
- [experience/experience_app/tests/diseno/test_decoraciones.py](../../experience/experience_app/tests/diseno/test_decoraciones.py)
- [experience/experience_app/tests/diseno/test_drafts.py](../../experience/experience_app/tests/diseno/test_drafts.py)
- [experience/experience_app/tests/diseno/test_theme.py](../../experience/experience_app/tests/diseno/test_theme.py)
- [experience/experience_app/tests/diseno/test_variants.py](../../experience/experience_app/tests/diseno/test_variants.py)
- [experience/experience_app/tests/diseno/test_verificador_obligatorio.py](../../experience/experience_app/tests/diseno/test_verificador_obligatorio.py)
- [experience/experience_app/tests/mcp/test_mcp.py](../../experience/experience_app/tests/mcp/test_mcp.py)
- [experience/experience_app/tests/services/test_discount.py](../../experience/experience_app/tests/services/test_discount.py)
- [experience/experience_app/tests/services/test_rewards.py](../../experience/experience_app/tests/services/test_rewards.py)
- [experience/experience_app/tests/test_organization_migration.py](../../experience/experience_app/tests/test_organization_migration.py)
- [experience/experience_app/tests/test_organization_scope.py](../../experience/experience_app/tests/test_organization_scope.py)
- [experience/experience_app/tests/views/test_menu_benefits.py](../../experience/experience_app/tests/views/test_menu_benefits.py)
- [experience/experience_app/tests/views/test_smart_menu.py](../../experience/experience_app/tests/views/test_smart_menu.py)
- [experience/experience_app/urls/__init__.py](../../experience/experience_app/urls/__init__.py)
- [experience/experience_app/views/account.py](../../experience/experience_app/views/account.py)
- [experience/experience_app/views/benefits.py](../../experience/experience_app/views/benefits.py)
- [experience/experience_app/views/organization.py](../../experience/experience_app/views/organization.py)
- [experience/experience_app/views/password_reset.py](../../experience/experience_app/views/password_reset.py)

### docs (1 archivos)

- [docs/traspaso/2026-09-28-plan-o1-o2-codex.md](../../docs/traspaso/2026-09-28-plan-o1-o2-codex.md)
