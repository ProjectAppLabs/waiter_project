# Inventario multirrestaurante: qué es de la organización y qué es de cada restaurante

Base del [Plan O](../planes/2026-09-28-plan-O-multirrestaurante.md) y de la decisión
[una base de Odoo por organización](../decisiones/2026-09-28-una-base-por-organizacion.md).

Se levantó el 2026-09-28 leyendo todo el código: los ocho addons de Odoo, experience, el registro, el menú y el POS.
También se verificó el comportamiento de Odoo 19 en el código fuente del contenedor. Las referencias `archivo:línea`
de detalle están en los informes de esa sesión; aquí quedan las que deciden algo.

## Hallazgos que deciden la arquitectura

1. **Hoy hay una base de Odoo por restaurante** (ADR `docs/decisiones/2026-09-04-multi-tenant.md`). La razón era la
   multiempresa de Odoo: `restaurant.floor/table` no tienen `company_id` y se filtraban entre empresas.
2. **Dentro de una sola empresa, Odoo 19 separa restaurantes de forma nativa si cada uno es un `pos.config`**
   (verificado en el código de Odoo del contenedor). Cada uno tiene:
   - pisos y mesas propios (`pos.config.floor_ids`; el POS solo carga los suyos);
   - lista de empleados propia (`basic/advanced_employee_ids`);
   - almacén e inventario propios (`picking_type_id` → `warehouse_id`);
   - caja, sesiones, pedidos y numeración propios;
   - métodos de pago propios (el efectivo no se puede compartir);
   - listas de precios y posiciones fiscales propias;
   - programas de puntos y cupones que se pueden limitar a uno (`loyalty.program.pos_config_ids`);
   - informes por restaurante.

   El **catálogo es de la empresa y se comparte**: cada restaurante elige categorías (`limit_categories`) y precio
   (lista de precios). **Lo que Odoo no trae es restringir a un usuario a un solo restaurante**: se hace con un campo
   usuario ↔ `pos.config` y `ir.rule`.
3. **Por tanto: una base de Odoo por organización y un `pos.config` por restaurante.** El ADR sigue vigente entre
   organizaciones (fase 2); dentro de una organización se usa lo nativo. El catálogo maestro deja de ser una
   sincronización entre bases y pasa a ser el catálogo normal de la empresa.
4. **El registro ya lo modela:** `Restaurant` → `Venue(odoo_db, pos_config_id)`. Conceptualmente, `Restaurant` pasa a
   ser la **organización** (slug `burger-house`) y `Venue` el **restaurante** (slug `poblado`). Las URL del menú
   `/<org>/<restaurante>/` no cambian.
5. **Lo que hoy supone un solo restaurante** (hay que corregirlo, con archivo:línea en los informes):
   - **Odoo:**
     - 5 `ir.config_parameter` `projectapp.*` (una pareja de slugs por base, `controllers/admin.py:8-12`);
     - reservas: primer `pos.config` del piso (`reservation.py:144,516,569`);
     - notificaciones sin `config_id` que se difunden a todos (`notification.py:43,60`);
     - despensa y stock por empresa, no por almacén del restaurante (`product_template.py:248`,
       `restaurant_inventory.py`);
     - régimen de impuestos a nivel de empresa;
     - dirección y ubicación en `res.company` (`company.py:95`);
     - semillas del «primer config».
   - **POS:**
     - base fija en el build (`session.ts:12`);
     - `getOpenSession` toma la primera sesión abierta de cualquier punto de venta (`session.ts:41`);
     - `configs[0]` (`posData.ts:65`, `caja/page.tsx:36`);
     - unas 10 lecturas sin filtro de punto de venta: categorías, pisos, métodos de pago, sesiones, presets, almacén,
       notificaciones, ventas y ROI;
     - `res.company` con `limit 1`.
   - **Experience:**
     - la marca se lee con `res.company [] limit 1` (`adapters/odoo/pos.py:262`);
     - `DinerAccount` es global (`models/diner_account.py`);
     - diseño, decoraciones, claves MCP, favoritos y premios están por sede.

## Inventario: qué es de la organización y qué es de cada restaurante

Leyenda del **hoy**:
- **empresa** = `res.company`;
- **config** = `pos.config` / parámetro por punto de venta;
- **sede** = experience por `restaurant_slug` + `venue_slug`;
- **global** = sin alcance.

### A. De la organización, compartido en vivo por todos sus restaurantes

| Qué | Dónde vive hoy | Cambio |
|---|---|---|
| Marca: logo, colores, fuentes, saludo, nombre del mesero, bienvenida | empresa (`company.py:67-74`) + registro | Ninguno (ya es por empresa) |
| Diseño del menú: tema v2, plantillas de componentes | sede (`VenueMenuSettings`) | Pasa a organización |
| Decoraciones del menú | sede (`MenuDecoration`) | Pasa a organización |
| Claves MCP y borradores (la IA diseña el menú del grupo) | sede (`McpKey`, `McpPendingChange`) | Pasa a organización |
| Catálogo maestro: productos, categorías, fotos y galería, datos del comensal (descripción, ingredientes, nutrición), combos | empresa (productos) | Ninguno en Odoo |
| Recetas | empresa, BoM sin empresa | Ninguno en Odoo |
| Estación de cocina por categoría | global (`pos.category.kitchen_station`) | Ninguno |
| Impuestos y régimen tributario | empresa (`tax_regime.py` reescribe todos los productos) | Se mueve al nivel organización (hoy lo cambia un POS para todos) |
| Datos legales: razón social, NIT, correo de facturación | empresa | Ninguno (mismo NIT para todos) |
| Cuentas de comensales, historial, favoritos | global / sede | Pasan a organización: KFC y Frisby no se ven |
| Programa de puntos (se gana en uno y se canjea en cualquiera) | empresa, programa sembrado global | Ninguno |
| Cupones y acciones con premio (plan N) | config (`waiter.benefit.action`) | Pasan a organización, con restricción opcional por restaurante |
| Banners del menú | config (`waiter_menu_banners`) | Pasan a organización (el catálogo es común) |
| Roles y permisos por rol | parámetro por config (`waiter.role_permissions.<id>`) | Pasa a organización |
| Consumidor final genérico, cuenta de propinas | empresa (`billing.py`) | Ninguno |

### B. Propio de cada restaurante

| Qué | Dónde vive hoy | Cambio |
|---|---|---|
| Identidad del local: nombre, dirección, teléfono, ubicación en el mapa | empresa (`company.py:95`, `settings.ts:16`) | Pasa a `pos.config` |
| Horario del local | — | Nuevo, opcional |
| Pisos, mesas, plano, zonas, meseros por zona | piso y mesa ligados a config | Ninguno (ya por config) |
| Códigos QR de mesa | registro (`TableToken` por sede) | Ninguno |
| Meseros y cajeros: cada uno pertenece a **un solo restaurante** (el que se le asignó) y solo opera ahí | empresa (`hr.employee` y `res.users` sin restaurante) + lista de PIN por config | `hr.employee` gana su restaurante (un config); solo sale en la lista de PIN de ese config; una `ir.rule` se lo impone |
| Encargado (antes «administrador»): uno o varios restaurantes asignados | empresa | `res.users` con sus restaurantes asignados |
| Qué restaurantes puede ver cada usuario | — | Nuevo: usuario ↔ config + `ir.rule` |
| Caja, sesiones, pedidos, pagos, propinas, numeración, diario de facturación | config (nativo) | Ninguno |
| Inventario y stock, compras, alertas de stock bajo | empresa (primer almacén) | Pasa al almacén del config |
| Notificaciones (plato listo, stock bajo) | global (`waiter.notification` sin config) | Llevan `config_id` |
| Disponibilidad y precio en la carta: categorías visibles, lista de precios, agotados | config (categorías y lista de precios) | Agotados por restaurante (hoy `available_in_pos` es global) |
| Reservas, su horario y anticipos | config (horario); reserva vía primer config del piso | La reserva lleva su config |
| Métodos de pago (efectivo propio) | config (nativo) | Ninguno |
| Umbrales de alerta, cobrar antes de cocina, supuestos del ROI | config | Ninguno |
| Mesa y pedido del comensal: sesión, carrito, pedido, pago, opinión | sede | Ninguno |
| Chat del mesero y pedidos por WhatsApp | sede | Ninguno |
| Pantalla y sonido | dispositivo (`localStorage`) | Ninguno |

### C. De la organización, con ajuste por restaurante

| Qué | Por defecto | Ajuste por restaurante |
|---|---|---|
| Precio de cada plato | Lista de precios de la organización | Lista de precios propia |
| Qué categorías y platos se ofrecen | Todos | Categorías visibles y agotados |
| Cupones, puntos, acciones, banners | Todos los restaurantes | Limitar a algunos (`pos_config_ids`) |
| Pasarela de pago (Wompi, Bold) | Credenciales de la organización | Credenciales propias (se define en el sprint de integraciones) |
| Plantillas nuevas de restaurante | — | Al crear uno se copian umbrales, horario y métodos de otro |

### D. Plataforma ProjectApp (fase 2, fuera de este plan)

- Catálogo de plantillas (`MenuTemplate`).
- El producto en sí: menú, POS, sistema de diseño, verificador.
- Alta de organizaciones (una base de Odoo por organización).
- Licencias y facturación de ProjectApp.
- **Aislamiento entre organizaciones.** Hoy `resolve` entrega credenciales de `admin` con una sola clave compartida
  (`docs/arquitectura/2026-09-21-…`); en la fase 2 hacen falta un usuario de servicio y una clave por organización.
