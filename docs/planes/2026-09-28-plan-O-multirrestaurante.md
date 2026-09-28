# Plan O · Multirrestaurante: un dueño con muchos restaurantes

**Estado (2026-09-28): hecho, de O0 a O5.**
- **Catálogo maestro en la consola del dueño:** precio por restaurante (lista de precios propia creada al primer precio
  local con `pos.config.waiter_set_catalog_price`; vacío vuelve al de la organización) y disponibilidad por
  restaurante.
- **Inventario del POS:** el encargado agota o vuelve a ofrecer un plato solo en su restaurante.
- **POS y menú:** usan el precio del restaurante.

Pruebas:
- Odoo: 184/184 sobre una base con dos restaurantes.
- Experience: 706. Registro: 18. POS: 551. Menú: 506.
- Verificador de Chromium sin problemas en Poblado y en Laureles.

En desarrollo:
- **Organización:** `burger-house`.
- **Restaurantes:** «Poblado» (config 1) y «Laureles» (config 2, con 6 mesas).
- **Personal de Laureles:** «Mateo Mesero», PIN `222222`.
- **Dueño:** el empleado «Administrator», PIN `999999`, entra a la consola de la organización.

Al integrar se corrigieron varias cosas (detalles en los commits):
- la validación de restaurantes por rol;
- la exención del administrador de Odoo en las reglas;
- el piso y la sesión inicial del restaurante nuevo;
- los compromisos de stock por almacén;
- las pruebas antiguas con un solo restaurante activo.

- Inventario: [qué es de la organización y qué es de cada restaurante](../inventario/2026-09-28-inventario-multirrestaurante.md)
- Decisión: [una base de Odoo por organización y un `pos.config` por restaurante](../decisiones/2026-09-28-una-base-por-organizacion.md)

## Contexto

ProjectApp vende Waiter como licencia al **dueño** (una organización, p. ej. KFC), que administra **todos sus
restaurantes** (locales). Hoy el producto sirve **un solo restaurante por despliegue**. Este plan hace la **fase 1:
muchos restaurantes bajo un mismo dueño**. La **fase 2** (la plataforma con muchos dueños: KFC y Frisby, cada uno con
sus comensales) queda fuera, pero el diseño la prepara.

Decisiones del dueño (2026-09-28):
- **Capas:** un administrador por organización (el dueño) ve todos sus restaurantes y entra al POS de cualquiera. La
  plataforma se administra por fuera (scripts, Odoo).
- **Diseño del menú:** uno por organización, en vivo para todos sus restaurantes.
- **Catálogo:** maestro de la organización (se recomienda; ver abajo por qué sale casi nativo).
- **Comensal:** cuenta por organización. Un mismo correo se registra aparte en KFC y en Frisby.
- **Legal:** todos los restaurantes de un dueño facturan con la misma razón social y NIT, así que hay una sola empresa
  en Odoo por organización.
- **Premios:** los puntos, cupones y premios por acciones valen en toda la organización. Una promoción se puede
  limitar a algunos restaurantes.
- **Roles:**
  - **Dueño** (nuevo): la consola de la organización, con todos los restaurantes.
  - **Encargado** (antes «administrador»): uno o varios restaurantes.
  - **Mesero y cajero**: pertenecen a **un solo restaurante**, el que se les asignó, y solo operan ahí.

## Capas de administración

1. **Consola del dueño (nueva, fuera del POS).** Área propia en la misma app Next del POS (`pos/app/(organizacion)/`),
   con su propio armazón, para reutilizar sesión, servicios y kit. Solo el rol nuevo **dueño**. Vistas:
   - **Restaurantes:** lista con estado (caja abierta, ventas de hoy), **crear restaurante** con asistente (nombre,
     dirección, copiar ajustes de otro) y **«Entrar al POS de X»**.
   - **Resumen:** ventas e indicadores de todos, y por restaurante.
   - **Catálogo maestro:** con disponibilidad y precio por restaurante.
   - **Diseño del menú, Promociones e Integraciones IA:** se mudan desde Configuración.
   - **Equipo:** todas las personas del grupo, con su rol y su restaurante (meseros y cajeros en uno solo; encargados en
  uno o varios); crear, mover de restaurante, cambiar PIN. **Clientes** de la organización.
   - **Empresa:** datos legales e impuestos.
2. **POS del restaurante.** La operación de siempre, limitada al restaurante elegido. Su «Administración» se queda
   con lo local: ventas y caja del local, facturación, datos del local, métodos de pago, pantalla. El rol
   **administrador** pasa a significar *encargado* (solo sus restaurantes). Mesero y cajero ven y operan solo su
   restaurante.

## Fases

- **O0 · Documentos.**
  - ADR «una base de Odoo por organización, un `pos.config` por restaurante» (enmienda del de 2026-09-04).
  - Este inventario en `docs/inventario/2026-09-28-inventario-multirrestaurante.md`, enlazado desde `docs/README.md` y
    el traspaso.
- **O1 · Odoo por restaurante** (addon `projectapp_ops` y afines). Campos nuevos:
  - en `pos.config`: slug del restaurante, dirección, teléfono y ubicación;
  - `res.users.waiter_config_ids` e `ir.rule` sobre `pos.config`, `pos.session`, `pos.order`, `report.pos.order` y
    los modelos propios (`waiter.reservation`, `waiter.notification`).

  Corregir cada suposición de un solo config listada arriba:
  - pasarelas de `admin.py` según el config que llama;
  - reservas con `config_id`;
  - notificaciones con `config_id`;
  - despensa con el almacén del config;
  - semillas por config.

  Método `waiter_create_restaurant(nombre, copiar_de)` que crea:
  - `pos.config`;
  - almacén;
  - piso;
  - método de efectivo;
  - listas de empleados;
  - ajustes copiados.

  Migración de la base actual, con su punto de venta existente como primer restaurante.
- **O2 · Registro y experience por organización.**
  - Se mueven a la organización, con migración: diseño, decoraciones, claves MCP, banners/promociones (vía Odoo),
    cuentas de comensal (campo de organización y login por organización), favoritos y premios.
  - El registro da de alta sedes de la misma base.
  - `Tenant` lleva organización y restaurante.
  - La marca se lee de la empresa del config, no con `limit 1`.
- **O3 · POS por restaurante.**
  - Se elige el restaurante al entrar o al abrir caja, y todo se filtra por el config de la sesión: se eliminan
    `configs[0]`, «primera sesión abierta» y las lecturas sin dominio.
  - Rol **dueño** y consola de la organización.
  - «Entrar al POS de X».
- **O4 · Menú del comensal.**
  - Mismas URL.
  - Portada `/<org>/` para elegir restaurante.
  - Cuenta, historial y favoritos por organización.
  - Tema e intro por organización.
- **O5 · Verificación.**
  - Segundo restaurante en la base de desarrollo (p. ej. «Laureles»).
  - Pruebas de aislamiento:
    - un mesero de Laureles no aparece en la lista de PIN de Poblado ni ve sus pedidos, caja o stock;
    - un encargado de los dos ve ambos;
    - el dueño ve todos.
  - Pruebas de Odoo (`scripts/odoo-test.sh`), de experience, del POS y del menú.
  - Verificador de Chromium en los dos restaurantes.

Reparto sugerido, como en los planes anteriores: Codex hace O1 y O2 en un árbol aparte y Claude hace O0, O3, O4 y
O5 e integra.

## Verificación

- `sg docker -c "scripts/odoo-test.sh projectapp_ops"` (y los demás addons), con pruebas nuevas de `ir.rule` por
  usuario y restaurante.
- `experience`: `pytest` completo, con casos de alcance por organización (cuentas separadas, diseño compartido).
- `pos` y `diner`: `tsc` y `jest`.
- A mano en Chromium: el dueño crea «Laureles» copiando de Poblado, entra a su POS y ve su propio plano y caja; el
  menú `/burger-house/laureles/` muestra el mismo diseño y catálogo con sus precios.
- `verificar-borrador.cjs` sin problemas en ambos restaurantes.

## Contrato común

Lo construyen dos lados a la vez: **Codex** hace Odoo y experience (O1, O2) y **Claude** hace el POS y el menú (O3,
O4). Los nombres, las claves y los estados de aquí se respetan tal cual.

### Odoo (`projectapp_ops`, versión 19.0.2.5.0)

1. **Identidad del restaurante en `pos.config`.**
   - Campos:
     - `waiter_slug`: Char, único por empresa, `[a-z0-9-]`;
     - `waiter_street`, `waiter_city`, `waiter_phone`, `waiter_latitude`, `waiter_longitude`: Char.
   - `res.company` conserva los datos legales. Su `waiter_latitude/longitude` pasan al primer config en la migración.
   - La marca sigue en `res.company`.
2. **Roles.** `waiter_role` de `res.users` y de `hr.employee` gana `("owner", "Dueño")`. `admin` se sigue guardando
   igual pero se muestra como **Encargado**.
   - Grupo nuevo `projectapp_ops.group_waiter_owner`, que implica `point_of_sale.group_pos_manager`. El usuario
     técnico de experience (hoy `admin`) lo tiene.
3. **Restaurantes asignados.**
   - `res.users.waiter_config_ids` (m2m `pos.config`): los restaurantes que ese usuario opera.
   - `hr.employee.waiter_config_ids` (m2m `pos.config`):
     - mesero y cajero, **exactamente uno**;
     - encargado, uno o más;
     - dueño, se ignora (ve todos).
   - Una restricción valida el número según el rol.
   - Guardar sincroniza la lista de PIN: el empleado queda en `basic_employee_ids` solo de sus configs, y en
     `advanced_employee_ids` si es encargado.
   - Se anula el alta automática de `pos_hr`, que mete a los gerentes en todos los configs, salvo para el dueño.
4. **Aislamiento (`ir.rule`, sin efecto para `group_waiter_owner`):**
   - `pos.config`: `id in user.waiter_config_ids`;
   - `pos.session`, `pos.order`, `pos.payment` y `report.pos.order`: `config_id in user.waiter_config_ids`;
   - `waiter.reservation` y `waiter.notification`: por su nuevo `config_id`.
   - `hr.employee.waiter_login_list(config_id)` devuelve solo los empleados de ese config. Se quita el caso que hoy
     devuelve a todos si no hay lista.
5. **Nivel organización.** Pasan a `res.company`, leyendo el valor anterior del config como respaldo:
   - `waiter_menu_banners`: cada banner con `configs: [ids]` opcional; vacío es todos;
   - `signup_discount_percent`;
   - la política de roles: parámetro `waiter.role_permissions`, sin sufijo de config;
   - el régimen tributario.

   `waiter.benefit.action` deja `config_id` opcional y pasa a ser único por empresa y acción. Los cupones se crean
   con `pos_config_ids` vacío (valen en todos) salvo restricción. **Sigue por config:**
   - umbrales;
   - cobrar antes de cocina;
   - supuestos del ROI;
   - horario de reservas;
   - listas de precios y categorías visibles.
6. **Suposiciones de un solo config que se corrigen:**
   - **Pasarelas de `controllers/admin.py`.** Reciben `config_id` del POS. El slug de la organización sale de
     `projectapp.restaurant_slug`; el del restaurante, de `config.waiter_slug`. Con eso:
     - diseño, decoraciones y claves MCP van por organización;
     - pasarelas de pago por restaurante.
   - **Reservas.** `waiter.reservation.config_id` (m2o, obligatorio), calculado desde la mesa al crear y usado en
     lugar de `floor_id.pos_config_ids[:1]`.
   - **Notificaciones.** `waiter.notification.config_id`; se difunden solo al canal de su config; stock bajo por
     almacén.
   - **Despensa e inventario.** Usan `config.warehouse_id` (el POS manda `config_id` en el contexto
     `waiter_config_id`).
   - **Semillas.** Van por config.
7. **Métodos nuevos:**
   - `pos.config.waiter_restaurants()` (dueño y encargado, solo sus configs). Devuelve
     `[{"id", "name", "slug", "street", "city", "phone", "open", "salesToday", "ordersToday"}]`.
   - `pos.config.waiter_create_restaurant(name, slug, copy_from_id=None)` (solo dueño). Crea:
     - el `pos.config` en modo restaurante;
     - almacén y tipo de operación propios;
     - un método de efectivo con su diario;
     - un piso vacío.

     Comparte los métodos de pago que no son efectivo. Copia de `copy_from_id`: umbrales, cobrar antes de cocina,
     ROI, horario de reservas, lista de precios y categorías visibles. Devuelve `{"id", "slug"}`.
   - `hr.employee.waiter_set_restaurants(employee_id, config_ids)` y `res.users.waiter_set_restaurants(user_id,
     config_ids)` (dueño; el encargado, solo dentro de sus configs).
8. **Migración 19.0.2.5.0.** Para el config existente:
   - `waiter_slug` = `projectapp.venue_slug`;
   - dirección desde la empresa;
   - todos los empleados y usuarios quedan asignados a él;
   - el usuario técnico `admin` pasa a dueño.

### Registro y experience

1. **Registro.**
   - `Restaurant` es la organización y `Venue` es el restaurante: misma base de Odoo, con su `pos_config_id`.
   - Comando `add_venue <org> <slug> <nombre> --pos-config-id N`: copia las credenciales de Odoo de la primera sede y
     crea los `TableToken` de las mesas de ese config.
   - Endpoint interno sin credenciales `GET /internal/v1/organizaciones/<org>/restaurantes/` →
     `[{"slug", "name"}]`.
2. **Alcance por organización** (filas con `venue_slug=''`, migrando las de hoy):
   - `VenueMenuSettings`, `MenuDecoration`, `McpKey` y `McpPendingChange`. Leer el tema de un restaurante es leer el
     de su organización.
   - `DinerAccount` gana `organization_slug`. El registro, el inicio de sesión, la recuperación, el historial y el
     perfil son de la organización de la sesión del comensal (la cookie). El mismo correo puede tener una cuenta en
     cada organización.
   - `DinerFavorite` y `DinerReward` pasan a ser por organización (sin sede).
   - `SignupDiscountClaim` incluye la organización en su clave.
3. **Público nuevo.** `GET /api/v1/<org>/` → `{"organizacion": {"slug", "nombre", "marca"}, "restaurantes": [{"slug",
   "nombre", "direccion"}]}`, para la portada del menú.
4. **Marca y ubicación.**
   - La marca se lee de `config.company_id`, no de `res.company [] limit 1`.
   - La ubicación del restaurante sale de su `pos.config` (`waiter_*`).
