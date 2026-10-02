# Plan T · El sistema propio: Waiter sin Odoo

**Qué.** Reemplazar Odoo por un backend propio en Django, con una sola base de datos, preparado para muchos dueños desde
el primer día. Decisión: [sistema propio sin Odoo](../decisiones/2026-10-01-sistema-propio-sin-odoo.md).

**Cómo se trabaja.** Cada fase empieza con un **contrato** escrito en este documento (modelos, endpoints con sus JSON y
reglas). Codex (`gpt-6-astra`) construye el backend con sus pruebas en un árbol aparte; Claude hace en paralelo el POS,
el menú y la consola contra ese contrato, integra el parche, corre las pruebas y verifica en Chromium. Odoo sigue
encendido para Burger House hasta el corte final (T6).

## Arquitectura

- **Un proyecto Django** (`experience/`, Django 6.1 y DRF 3.18), que crece por apps de dominio. El nombre de la
  carpeta se conserva; el producto es «el sistema propio».
- **Una base de datos.** Toda fila lleva su organización (`organization_id`). En desarrollo, PostgreSQL del compose
  (`waiter_core`); las pruebas corren en SQLite como hoy.
- **Apps:**
  - `tenancy`: organizaciones (los clientes de ProjectApp), restaurantes, plan y estado, gente de ProjectApp, auditoría.
  - `accounts`: las personas de cada organización, roles, invitaciones, turnos y acceso por horario.
  - `notifications`: avisos (cocina, inventario, sistema, acceso, caja).
  - `catalog`: platos, categorías, combos, variantes, fotos, precios por restaurante, recetas e ingredientes.
  - `inventory`: existencias por restaurante, movimientos, conteos, mermas, solicitudes de compra.
  - `sales`: pedidos, líneas, cursos de cocina, pagos, turnos de caja, cierres.
  - `tables`: pisos, mesas, plano, zonas, códigos QR (hoy `TableToken`).
  - `loyalty`: puntos, cupones, acciones con premio, banners.
  - `reservations`, `kitchen`, `reports` (resumen, cuadres, rentabilidad, ROI), `billing` (documentos y proveedor
    externo de factura electrónica).
  - `experience_app` (lo del comensal) se queda y deja de hablar con Odoo.
- **Acceso:**
  - **POS y consola del dueño:** cookie de sesión propia (`waiter_sid`), una organización por subdominio
    (`burger-house.waiter.projectapp.co`; en desarrollo `burger-house.localhost:3000` o `DEFAULT_ORG`). El POS envía la
    organización en la cabecera `X-Waiter-Org` en cada petición; el servidor comprueba que la cuenta sea de esa
    organización.
  - **Consola de ProjectApp:** cookie propia (`waiter_platform_sid`), gente de ProjectApp.
  - **Menú del comensal:** como hoy, cookie del comensal y rutas `/<org>/<restaurante>/`.
- **Tiempo real:** eventos por SSE desde Django (reemplaza al bus de Odoo). **Correo:** backend de correo de Django.
  **Tareas programadas:** comandos de Django en cron.
- **El registro (`registry`)** se funde en `tenancy`; el menú deja de resolver credenciales.

## Fases

| Fase | Entrega | Backend (Codex) | Claude |
|---|---|---|---|
| **T0 · Plataforma y acceso** | ProjectApp da de alta clientes; cada persona entra con su cuenta propia (plan P) contra el sistema propio | `tenancy`, `accounts`, `notifications` mínimo, API de plataforma y de acceso, correo de invitación, comando para el primer admin de ProjectApp | Consola de ProjectApp (`/plataforma`), transporte del POS al sistema propio, resolución de la organización por subdominio, servicios tipados del contrato |
| **T1 · Catálogo e inventario** | Platos, categorías, combos, variantes, fotos, precios y agotados por restaurante, recetas, ingredientes y costos; existencias, movimientos, conteos, solicitudes | `catalog`, `inventory`, migración de fotos | Consola → Catálogo e Inventario del POS contra el sistema propio |
| **T2 · Salón, pedidos y caja** | Pisos, mesas y plano; pedidos con cursos de cocina; pagos; turnos de caja con apertura, cierre, diferencia y nota | `tables`, `sales`, `kitchen`, SSE | El POS entero conmuta al sistema propio (Odoo deja de ser necesario para el POS) |
| **T3 · Clientes, fidelización, reservas y avisos** | Clientes, puntos, cupones, acciones, banners, reservas con anticipo, campana | `loyalty`, `reservations`, `notifications` completo | Consola y POS |
| **T4 · Informes y documentos** | Resumen, cuadres, rentabilidad, ROI, ventas; documentos de venta con impuestos de Colombia y la interfaz del proveedor de factura electrónica | `reports`, `billing`, impuestos | Consola, exportaciones |
| **T5 · El comensal** | `experience_app` lee y escribe en el sistema propio; el MCP del diseño igual | adaptador interno | Menú del comensal verificado con el verificador de Chromium |
| **T6 · Migración y corte** | Burger House migrado desde Odoo; Odoo apagado | script de migración por dominio | Corte, verificación completa, retirar `odoo/`, `registry` y las llamadas a Odoo |

Cada fase cierra con: pruebas del backend (`pytest`), del POS (`tsc`, `jest`), recorrido en Chromium y una nota de
estado en este documento.

## Contrato T0

Reglas comunes:

- JSON en todas las respuestas. Error: `{"error": "<codigo>", "message": "<texto en español para la pantalla>"}` con el
  estado HTTP que corresponda (`400` datos, `401` sin sesión, `403` sin permiso, `404` no existe, `409` conflicto).
- Fechas y horas en ISO 8601 UTC con `Z`; horas de turno en decimales (`14.5` = 14:30), hora local de la organización
  (`timezone`, por omisión `America/Bogota`).
- Dinero en pesos como número (`monthly_price: 450000`).
- Las cookies de sesión son HttpOnly, `SameSite=Lax`. Expiran a las 16 h (POS) y 12 h (plataforma), o antes si el
  turno termina.

### Modelos

**`tenancy.Organization`** (el cliente de ProjectApp): `id` (UUID), `slug` (único, `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–40,
no reservado: `plataforma`, `www`, `api`, `menu`, `admin`, `app`), `name`, `legal_name`, `tax_id` (NIT), `billing_email`,
`billing_contact`, `plan` (texto, p. ej. `basico`, `pro`), `monthly_price`, `status` (`trial` | `active` | `suspended`),
`trial_ends` (fecha o null), `max_restaurants` (≥ 1), `cash_tolerance` (0 por omisión), `timezone`, marca (`brand_color`,
`brand_font`, `brand_radius`, `tagline`, `logo_url`, `greeting`, `waiter_name`, `welcome`, como hoy en
`registry.Restaurant`), `suspended_at`, `suspended_reason`, `created_at`.

**`tenancy.Restaurant`**: `id`, `organization`, `slug` (único por organización), `name`, `street`, `city`, `phone`,
`latitude`, `longitude`, `access_margin_minutes` (30), `active`, `legacy_odoo_config_id` (null), `created_at`.

**`tenancy.PlatformUser`** (gente de ProjectApp): `id`, `name`, `username` (único, `^[a-z0-9.]{3,32}$`), `email`
(único sin distinguir mayúsculas), `password` (hash de Django), `role` (`admin` | `operator`), `active`, `activated`,
invitación (`invite_code_hash`, `invite_expires`, `invite_attempts`, `invite_sent_at`), `last_login`.

**`tenancy.PlatformAudit`**: `id`, `actor` (PlatformUser o null), `organization` (o null), `action`
(`organization.created`, `organization.updated`, `organization.suspended`, `organization.reactivated`,
`organization.invite_resent`, `platform_user.invited`, `platform_user.deactivated`), `detail` (JSON), `at`.

**`accounts.Account`** (una persona de una organización): `id`, `organization`, `username` (único por organización,
`^[a-z0-9.]{3,32}$`), `email` (null o único por organización sin distinguir mayúsculas), `name`, `role`
(`owner` | `admin` | `cashier` | `waiter`), `password`, `active`, `activated`, invitación (igual que arriba),
`shift_start` y `shift_end` (decimales o null = sin turno), `restaurants` (muchos a muchos; dueño: ninguno), `last_login`,
`legacy_odoo_employee_id`, `legacy_odoo_user_id`.

**`accounts.Attendance`**: `account`, `restaurant` (o null), `check_in`, `check_out` (null mientras dura).

**`accounts.Session`**: `account`, `token_hash`, `restaurant` elegido (o null), `expires`, `created_at`. Es lo que lleva
la cookie `waiter_sid`.

**`notifications.Notification`**: `organization`, `restaurant` (o null), `recipient` (Account o null = general del
restaurante), `kind` (`kitchen` | `inventory` | `system` | `access` | `cash`), `title`, `body`, `res_model`, `res_id`,
`action`, `action_done`, `read`, `created_at`.

### Reglas (las del plan P, ahora en el sistema propio)

- **Invitación:** código de 6 dígitos, guardado como hash; vence a las 48 h (alta) o 30 min (olvidé mi contraseña); 5
  intentos y se invalida; 60 s mínimo entre envíos (se ignora en silencio). El correo lleva el usuario, el código y un
  botón a `{POS_URL}/login?codigo=<usuario>` (plataforma: `{PLATFORM_URL}/plataforma/login?codigo=<usuario>`). Textos en
  español, como los de `odoo/addons/projectapp_ops/models/users.py`.
- **Acceso por horario** para `waiter` y `cashier`: ventana = turno ± `access_margin_minutes` del restaurante, en la
  zona de la organización; cruza medianoche; sin turno no hay restricción. Fuera de la ventana el login responde `403`
  `{"error": "outside_hours", "message": "...", "window": "14:00–22:00"}` y crea un `Notification` de tipo `access` para
  el dueño y los `admin` de ese restaurante: «Mateo intentó entrar a las 23:40, fuera de su turno (14:00–22:00)».
- **Sesión del POS:** `expires` = fin de la ventana para `waiter`/`cashier`; 16 h para `admin`/`owner`.
- **Restaurantes por rol:** `waiter` y `cashier` exactamente uno; `admin` uno o más; `owner` ninguno (opera todos).
- **Quién administra personas:** `owner` todo; `admin` solo sus restaurantes y sin conceder `owner`.
- **Organización suspendida:** login `403` `{"error": "organization_suspended", "message": "La cuenta de tu organización
  está suspendida. Escribe a ProjectApp."}`; las sesiones vivas se invalidan al suspender.
- **Límite de restaurantes:** crear uno por encima de `max_restaurants` responde `409` `{"error": "restaurant_limit"}`.
- **Usuario propuesto:** desde el nombre (`Sofía Mesera` → `sofia.mesera`, sufijo `.2` si existe), igual que
  `suggestUsername` del POS.

### API de la plataforma (`/api/platform/v1`, cookie `waiter_platform_sid`)

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `POST /auth/login` | — | `{login, password}` → `{"user": {id, name, username, email, role}}` y cookie |
| `POST /auth/logout` | sesión | → `{"ok": true}` |
| `GET /auth/me` | sesión | → `{"user": {...}}` |
| `POST /auth/request_code` | — | `{login}` → `{"ok": true}` siempre |
| `POST /auth/activate` | — | `{login, code, password}` → `{"ok": true}` o `400 invalid_code` |
| `GET /organizations` | sesión | → `{"organizations": [Organization + {"owner": {name, email, username, status: "pending"\|"active"}, "restaurants_count"}]}` |
| `POST /organizations` | sesión | `{name, slug, legal_name, tax_id, billing_email, billing_contact, plan, monthly_price, max_restaurants, trial_ends, timezone, owner: {name, email, username?}}` → `{"organization": {...}}` (`201`). Crea el dueño y le envía la invitación en la misma transacción |
| `GET /organizations/{slug}` | sesión | → `{"organization": {...}, "owner": {...}, "restaurants": [...], "audit": [últimos 50]}` |
| `PATCH /organizations/{slug}` | sesión | cualquier campo de la organización salvo `slug` y `status` → `{"organization": {...}}` |
| `POST /organizations/{slug}/suspend` | `admin` | `{reason}` → `{"organization": {...}}` |
| `POST /organizations/{slug}/reactivate` | `admin` | → `{"organization": {...}}` |
| `POST /organizations/{slug}/resend_invite` | sesión | → `{"ok": true, "sent": bool}` |
| `GET /team` | sesión | → `{"users": [PlatformUser sin password ni hash, con `status`]}` |
| `POST /team` | `admin` | `{name, email, username?, role}` → `{"user": {...}}` e invitación |
| `POST /team/{id}/deactivate` · `/resend_invite` | `admin` | → `{"ok": true}` |

### API de acceso del POS (`/api/pos/v1`, cabecera `X-Waiter-Org`, cookie `waiter_sid`)

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `GET /org` | — | → `{"organization": {slug, name, status, brand: {...}}}`; `404 unknown_organization` |
| `POST /auth/login` | — | `{login, password, restaurant_id?}` → `{"account": {id, name, username, email, role, restaurant_ids, shift: {from, to}\|null}, "attendance_id", "session_ends", "restaurants": [{id, name}]}` y cookie. `401 invalid_credentials`, `403 outside_hours`, `403 organization_suspended` |
| `POST /auth/logout` | sesión | cierra asistencia y sesión → `{"ok": true, "worked_hours"}` |
| `GET /auth/me` | sesión | → lo mismo que el login, sin abrir asistencia |
| `POST /auth/request_code` · `/activate` | — | como en la plataforma |
| `POST /auth/change_password` | sesión | `{current, next}` → `{"ok": true}` o `403 wrong_password` |
| `GET /restaurants` | sesión | → `{"restaurants": [{id, slug, name, street, city, phone, latitude, longitude, access_margin_minutes}]}` (los de la cuenta; dueño: todos) |
| `POST /restaurants` | `owner` | `{name, slug, street?, city?, phone?}` → `201` o `409 restaurant_limit` |
| `PATCH /restaurants/{id}` | `owner` o `admin` del restaurante | datos y `access_margin_minutes` |
| `GET /team` | `owner`, `admin` | → `{"people": [{id, name, username, email, role, restaurant_ids, shift, status: "active"\|"pending"}]}` |
| `POST /team` | `owner`, `admin` | `{name, username?, email, role, restaurant_ids, shift_start?, shift_end?}` → `201 {"person": {...}, "invite_sent": bool}` |
| `PATCH /team/{id}` | `owner`, `admin` | todo salvo `username` |
| `POST /team/{id}/resend_invite` · `/deactivate` | `owner`, `admin` | → `{"ok": true}` |
| `GET /notifications?limit=50` | sesión | → `{"notifications": [...]}` (las propias y las generales de sus restaurantes) |
| `POST /notifications/read_all` · `/notifications/{id}/read` | sesión | → `{"ok": true}` |

### Comandos de Django

- `create_platform_admin --name --email --username [--password]`: el primer admin de ProjectApp (si no hay contraseña,
  envía la invitación).
- Correo: `EMAIL_BACKEND` por entorno; en desarrollo `filebased` en `experience/mail/` para poder leer los códigos.

## Contrato T1 · Catálogo e inventario

Lo que hoy usan Inventario del POS, Consola → Catálogo, Rentabilidad y el menú del comensal (inventario del
2026-10-02, con `pos/lib/services/{pantry,catalogAdmin,masterCatalog,restaurantInventory,catalogOverview,productOptions}.ts`
y `experience/experience_app/adapters/odoo/pos.py`). Mismas reglas comunes que T0; rutas bajo `/api/pos/v1`, con
`X-Waiter-Org` y la cookie `waiter_sid`. **Quién escribe:** `owner` todo; `admin` solo existencias, movimientos,
solicitudes y agotados de sus restaurantes; `waiter`/`cashier` leen. Los ids son enteros.

### Modelos (`catalog`)

- **`Category`**: `organization`, `name`, `sequence`, `station` (texto libre de hasta 40 caracteres: el nombre de la estación del KDS; vacía, solo sale en «Todas»), `active`.
- **`Tax`**: `organization`, `name`, `amount` (porcentaje), `included` (incluido en el precio; Colombia: INC 8 % e IVA 19 %
  incluidos), `active`. Se siembran `INC 8 %` e `IVA 19 %` al crear la organización (T0 ya existe: añadir en el
  servicio de alta).
- **`Unit`**: `organization`, `name` (`kg`, `g`, `L`, `ml`, `Unidades`, `Manojo`, `Diente`, `Rebanada`), `root` (`weight` |
  `volume` | `count`), `factor` (a la unidad base del root: g→0.001 kg, ml→0.001 L). Se siembran las ocho al crear la
  organización.
- **`Product`** (plato, bebida, ingrediente o extra; `kind`: `dish` | `ingredient`):
  - comunes: `organization`, `name`, `kind`, `active`, `created_at`, `legacy_odoo_template_id`;
  - plato: `categories` (M2M), `price` (de carta, con impuestos incluidos), `taxes` (M2M), `available_in_pos`,
    `favorite`, `description`, `diner_attributes` (JSON con las claves de `pos/lib/domain/dinerAttributes.ts`:
    `combo[{producto, cantidad, nombre?}]`, `ingredientes[]`, `extras[]`, `acompanamientos[]`, `nutricion{...}`,
    `piezas`, `picante`, `etiquetas[]`, `alergenos[]`, `abv`, `ibu`, `tamanos[{nombre, precio}]`, `soloHoy`,
    `tiempoPreparacion`, `precioAntes`), `image` (WebP, ver fotos), `image_origin` (`real` | `ai` | `placeholder` | null),
    `preparation_minutes`;
  - ingrediente: `unit`, `pantry_category` (`produce` | `meat` | `seafood` | `dairy` | `dry`), `cost` (por unidad, de la
    organización), `supplier` (`Supplier` o null), `track_stock` (true).
- **`Supplier`**: `organization`, `name`, `phone`, `email`, `active`.
- **`ProductPhoto`** (galería, máximo 4): `product`, `sequence`, `image`, `width`, `height`, `file_size`.
- **`RestaurantPrice`**: `restaurant`, `product`, `price` (único por par; sin fila = precio de la organización).
- **`RestaurantUnavailable`**: `restaurant`, `product` (agotado en ese restaurante).
- **`Recipe`**: `product` (uno a uno), `yield_qty` (porciones que produce), `updated_at`; **`RecipeLine`**: `recipe`,
  `ingredient`, `qty`, `unit` (mismo `root` que la unidad del ingrediente).
- **Combo:** `diner_attributes.combo` (2–12 componentes, cantidad 1–20, sin combos anidados, un plato con receta no es
  combo). Sus ingredientes se resuelven recursivamente para la disponibilidad.

### Modelos (`inventory`)

- **`Stock`**: `restaurant`, `ingredient`, `qty` (en la unidad del ingrediente), `min` (5), `max` (20; si `max <= min`,
  `max = min + 15`).
- **`StockMove`**: `restaurant`, `ingredient`, `kind` (`receipt` | `waste` | `count` | `sale` | `adjust`), `qty` (con
  signo), `reason`, `request_key` (único por organización, 16–80 caracteres: idempotencia), `account`, `created_at`.
- **`PurchaseRequest`**: `restaurant`, `supplier`, `state` (`draft` | `sent` | `received` | `cancelled`), `created_at`,
  `account`; **`PurchaseRequestLine`**: `request`, `ingredient`, `qty`, `unit`, `price_unit`.
- **Nivel** (`level_for`): `qty <= 0` → `empty`; `< min` → `low`; `< max` → `medium`; si no `high`. **Estado:**
  `empty`/`low` → `request`, `medium` → `normal`, `high` → `good`.
- **Porciones de un plato** en un restaurante: mínimo sobre las líneas de la receta de `floor(stock / (qty_por_porción))`,
  con `qty_por_porción = line.qty / yield_qty` convertida a la unidad del ingrediente. Sin receta: null. Los pedidos
  pendientes se descuentan desde T2 (campo reservado `pending`, 0 por ahora).
- **Agotado** de un plato en un restaurante = `RestaurantUnavailable` o (con receta) porciones ≤ 0 o (combo) algún
  componente agotado.

### API

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `GET /catalog?restaurant_id=` | sesión | La carta del restaurante para el POS y el menú: `{"categories": [{id, name, sequence, station}], "taxes": [{id, name, amount, included}], "products": [{id, name, kind: "dish", category_ids, tax_ids, price (de carta de la organización), restaurant_price (o null), final_price (la que rige, con impuestos), favorite, available_in_pos, sold_out, has_image, image_version, image_origin, description, diner_attributes, servings (o null), preparation_minutes}]}` |
| `GET /products?kind=dish\|ingredient&q=` | sesión | `{"products": [...]}` completos (plato: lo de arriba sin `sold_out`; ingrediente: `{id, name, kind, unit: {id, name}, pantry_category, cost, supplier: {id, name}\|null, has_image}`) |
| `POST /products` | `owner` | plato: `{name, kind: "dish", category_ids, price, tax_ids, description?, diner_attributes?, favorite?, available_in_pos?, recipe?: {yield_qty, lines: [{ingredient_id, qty, unit_id}]}, image? (base64)}`; ingrediente: `{name, kind: "ingredient", unit_id, pantry_category, cost?, supplier_id?, initial_stock?: [{restaurant_id, qty}], min?, max?, image?}` → `201 {"product": {...}}` |
| `PATCH /products/{id}` | `owner` | cualquier campo del plato o del ingrediente (incluido `cost`), `image` (base64 o null) → `{"product": {...}}` |
| `POST /products/{id}/archive` | `owner` | → `{"ok": true}`; `409 in_recipe` si un ingrediente está en una receta activa |
| `GET /products/{id}/photos` · `PUT /products/{id}/photos` | sesión · `owner` | `PUT [{id}\|{image}]` (máx. 4, png/jpeg/webp, 12 MB; se convierten a WebP) → `{"photos": [{id, sequence, width, height}]}` |
| `GET /products/{id}/recipe` | sesión | `{"recipe": {yield_qty, lines: [{ingredient_id, name, qty, unit: {id, name}}], cost (null si algún costo es 0), missing_costs: [nombres]}, "by_restaurant": [{restaurant_id, servings, limiting: [nombres], ingredients: [{ingredient_id, name, per_serving, stock, pending, free, servings}]}]}` |
| `PUT /products/{id}/recipe` | `owner` | `{yield_qty, lines: [...]}` (vacío = sin receta; máx. 100 líneas, sin repetidos, unidad del mismo `root`) → como el GET |
| `GET /catalog/overview` | `owner`, `admin` | lo de `waiter_catalog_overview`: `{"dishes": [{id, name, categories, category_ids, price, available_in_pos, has_image, has_recipe, ingredients_count, recipe_cost, missing_costs}], "ingredients": [{id, name, unit, cost, used_in}]}` |
| `GET /catalog/restaurants` | `owner` | precios y agotados por restaurante: `{"dishes": [{id, name, category, price}], "prices": {restaurant_id: {product_id: price}}, "unavailable": {restaurant_id: [product_id]}}` |
| `PUT /catalog/restaurants/{restaurant_id}/products/{id}` | `owner` · `admin` del restaurante (solo `unavailable`) | `{price?: number\|null, unavailable?: bool}` → `{"ok": true}` |
| `GET /categories` · `POST /categories` · `PATCH /categories/{id}` | sesión · `owner` | `{name, sequence?, station?}` |
| `GET /taxes` · `PUT /taxes/regime` | sesión · `owner` | `PUT {regime: "inc"\|"iva"\|"none"}` reasigna el impuesto de todos los platos → `{"regime", "taxes"}`; `GET /taxes` → `{"taxes": [...], "regime": "inc"\|"iva"\|"none"\|"mixed"}` |
| `GET /units` · `GET /suppliers` · `POST /suppliers` | sesión · `owner` | |
| `GET /inventory?restaurant_id=` | sesión | `{"ingredients": [{id, name, pantry_category, unit: {id, name}, qty, min, max, level, status, supplier, has_image, cost}]}`; `GET /inventory?restaurant_id=&dishes=1` añade `"dishes": [{id, name, category_ids, has_image, price, available_in_pos, has_recipe, servings, level, sold_out}]` |
| `GET /inventory/{ingredient_id}?restaurant_id=` | sesión | `{"stock", "pending", "cost", "min", "max", "unit", "history": [últimos 100 {id, date, qty, reason, kind, account_name}]}` |
| `POST /inventory/{ingredient_id}/moves` | `owner`, `admin` | `{restaurant_id, kind: "receipt"\|"waste"\|"count", qty, reason (1–300), request_key (16–80), expected_stock? (obligatorio en `count`)}` → `{"stock", "move": {...}}`; `409 stock_changed` si `expected_stock` no coincide; `400 insufficient_stock` en `waste` |
| `PUT /inventory/{ingredient_id}/settings` | `owner` (`cost`), `admin` (`min`, `max`) | `{restaurant_id, min?, max?, cost?}` → como el GET |
| `GET /inventory/requests?restaurant_id=` | sesión | `{"requests": [{id, state, state_label, supplier_name, date, lines: [{id, ingredient_id, name, qty, unit_name, price_unit}]}]}` |
| `POST /inventory/requests` | `owner`, `admin` | `{restaurant_id, ingredient_id, qty?}` → crea o amplía la solicitud en borrador de ese proveedor (`qty` por omisión `max(max − stock, 1)`); `409 no_supplier` |
| `POST /inventory/requests/{id}/mark` | `owner`, `admin` | `{state: "sent"\|"received"\|"cancelled"}`; `received` crea un `receipt` por línea |
| `GET /photos/{product_id}?org=&size=card\|dish&v=` · `GET /photos/gallery/{photo_id}?org=` | público (la organización va en `org`, porque `<img>` no manda cabeceras; también vale `X-Waiter-Org`) | la imagen WebP (`card` 512, `dish` 1024), `Cache-Control: public, max-age=86400, immutable` |

### Reglas

- **Imágenes:** todo se convierte a WebP (calidad 80, lado máximo 1600, sin EXIF, 12 MB) con Pillow; se guardan en
  `MEDIA_ROOT/<org>/products/` con miniaturas 128/256/512/1024. `image_version` = marca de tiempo de la última foto.
- **Precio que rige** en un restaurante: `RestaurantPrice` si existe; si no, el de la organización. `final_price` =
  precio con impuestos incluidos (los `Tax.included`), y `price_before_taxes` para informes = `price / (1 + suma)`.
- **Archivar** un plato lo quita de la carta; un ingrediente en receta activa no se archiva (`409 in_recipe`).
- **Movimientos:** `receipt` suma; `waste` resta (sin dejar negativo); `count` fija (`qty − actual` con signo) y exige
  `expected_stock` igual al actual. `request_key` repetido devuelve el mismo movimiento sin repetirlo.
- **Caché del menú:** `GET /catalog` responde con `ETag` por organización y restaurante; cambia con cualquier escritura.
- **Siembra al crear la organización** (ampliar T0): unidades, impuestos INC/IVA, un supplier vacío no; categorías no.

## Estado

- 2026-10-01: decisión tomada y plan escrito.
- **T0 hecha** (2026-10-02), rama `feat/01102026-plan-t-sistema-propio`.
  - Backend (Codex, `gpt-6-astra`): apps `tenancy`, `accounts` y `notifications`, las dos APIs del contrato, correo de
    invitación y `create_platform_admin`. Django: 816 pruebas (110 nuevas). POS: `tsc` y 597 pruebas.
  - POS (Claude): organización por subdominio, transporte al sistema propio, consola de ProjectApp en `/plataforma`.
  - **Recorrido en Chromium y por la API:** ProjectApp entra a su consola y da de alta «Frisby» en tres pasos; a la
    dueña le llega el correo con su usuario, el código y el enlace; activa su cuenta y entra por correo (sin distinguir
    mayúsculas); su cookie no sirve para otra organización; crea dos restaurantes y el tercero se rechaza por el
    límite; al suspender, el login responde `organization_suspended` y la sesión vigente deja de valer; al reactivar,
    vuelve a entrar.
  - **Decisiones tomadas al integrar:** sin fecha de prueba la organización nace activa; al reactivar vuelve a prueba
    solo si su fecha sigue vigente; una sesión vigente por cuenta del POS; contraseña mínima de 8; turno con las dos
    horas iguales = sin restricción.
  - **Desarrollo:** el sistema propio usa el SQLite de `experience` hasta T2 (PostgreSQL llega con los pedidos). Los
    correos se escriben en `experience/mail/`. Admin de ProjectApp de prueba: `ana.projectapp` / `Plataforma-2026`.
    El cliente de prueba `frisby-74312` queda en la base, con su dueña `maria.lopez` (`Frisby-2026!`).
  - Los subdominios del POS (`*.localhost:3000` y los del dominio base) valen como origen de escritura desde T1.
- **T1 hecha** (2026-10-02), misma rama.
  - Backend (Codex, `gpt-6-astra`): apps `catalog` e `inventory` con el contrato T1 completo: productos (plato e
    ingrediente), categorías, impuestos y régimen, unidades, proveedores, fotos WebP con miniaturas, recetas con
    porciones por restaurante, precios y agotados por sede, existencias con movimientos idempotentes, umbrales y
    solicitudes de compra. Siembra de unidades e impuestos para las organizaciones nuevas y las anteriores.
    Django: 197 pruebas de `catalog`, `inventory`, `tenancy` y `accounts` (90 nuevas).
  - POS (Claude): `core/catalog.ts`, `core/inventory.ts` y `core/catalogBridge.ts` traducen el sistema propio a las
    formas de Inventario, Consola → Catálogo y la carta del POS; `pantry`, `catalogAdmin`, `masterCatalog`,
    `restaurantInventory`, `catalogOverview` y `posData` bifurcan con `onCore()`. El asistente de ingrediente crea
    proveedores (la organización nace sin ninguno). `tsc` y 603 pruebas.
  - **Recorrido en Chromium** (`frisby-74312.localhost:3000`, dueña): Consola → Catálogo crea un ingrediente con
    proveedor nuevo y existencias iniciales, fija su costo, crea una categoría con estación, un plato con receta
    (costo por plato y porciones por sede) y lo ve en Precios por restaurante; el POS en Inventario lista el plato con
    sus porciones, el ingrediente con su nivel y permite «Agotar aquí». Burger House sigue en Odoo sin cambios.
  - **Decisiones tomadas al integrar:** la estación de una categoría es texto libre (el nombre de la estación del
    KDS), no una lista cerrada; la organización de una foto viaja en la URL (`?org=`) porque `<img>` no manda
    cabeceras; el inventario devuelve la unidad como `{id, name}`; las solicitudes responden `{request, created}`;
    reutilizar un `request_key` para otro movimiento da `409 request_key_conflict`; cambiar la unidad de un
    ingrediente por otra compatible convierte existencias, umbrales y costo.
  - **Pendiente:** la carta del POS en el sistema propio trae pisos, mesas, métodos de pago y ajustes por omisión
    hasta T2 (el botón «Abrir caja» aún no hace nada allí); «Entrar al POS» desde la consola sigue oculto; las
    fotos de proveedor no existen en el sistema propio.
