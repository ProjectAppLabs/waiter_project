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

## Contrato T2 · Salón, pedidos y caja

Lo que hoy usan Mesas, Pedidos, el asistente de pedido, la ronda, el cobro, Cocina, Operación, Historial, Ventas, la
caja, Inicio y Cuadres (inventario del 2026-10-02 sobre `pos/lib/services/{orders,ordersKit,orderCreate,kitchen,tables,
floorPlan,cashRegister,sales,ops,paymentKit,insights,business,settings,bus,notifications}.ts` y los métodos
`waiter_*` de `odoo/addons/projectapp_{ops,kitchen,bus,notify,pantry}`). Mismas reglas comunes que T0 y T1; rutas bajo
`/api/pos/v1`, sin barra final, con `X-Waiter-Org` y la cookie `waiter_sid`. Los importes son decimales de dos cifras
en COP y viajan como números; las horas son ISO 8601 UTC puestas **siempre por el servidor**. Los ids son enteros.

**Quién hace qué (política de roles, `Organization.role_policy`):** la política es la de
`pos/lib/domain/permissions.ts` (`DEFAULT_ROLE_POLICY`: vistas `dashboard | tables | orders | reservations | history |
inventory | kitchen | sales | customers | billing` y acciones `create_orders | charge_orders | serve_orders |
edit_inventory`). `admin` y `owner` tienen todo. El servidor aplica la política en cada ruta (tabla abajo); una ruta sin
permiso responde `403 forbidden`. Un `waiter` o `cashier` solo opera el restaurante de su cuenta; `admin`, los suyos;
`owner`, todos (`restaurant_for`). Las lecturas de salón, pedidos y cocina las puede hacer cualquier rol con sesión.

### Modelos (`tables`)

- **`Floor`**: `restaurant`, `name` (1–100), `sequence`, `active`, `plan` (JSON: `walls`, `zones`, `decor`, `images`,
  `background_size`), `background` (FileField WebP, opcional), `revision` (entero, +1 por guardado), `zone_staff`
  (JSON `{zone_id: [account_id]}`: el reparto habitual de meseros por zona). `images` del plan guardan el archivo como
  `{id, x, y, width, height, file}`; el POS las pide por `GET /floors/{id}/images/{image_id}`.
- **`Table`**: `floor`, `number` (1–9999, único por piso), `seats` (1–100), `x`, `y`, `width`, `height` (múltiplos de
  20, mínimo 20), `shape` (`square` | `round`), `color` (hex o vacío), `zone_id` (texto, vacío = sin zona), `active`,
  `call` (`none` | `ordering` | `assist` | `bill`), `call_at`, `token` (el código del QR del comensal; 32 caracteres
  aleatorios; único). Las mesas de un piso se derivan del plano al guardarlo: se emparejan por `id` (las que traen id)
  o se crean (`id: null`); las que no vienen se retiran (`removed`) o, si tienen pedidos pagados, se archivan.

### Modelos (`sales`)

- **`PaymentMethod`**: `organization`, `name`, `type` (`cash` | `bank` | `pay_later`), `active`, `restaurants`
  (M2M; vacío = todos. El efectivo de cada sede es propio: la siembra crea «Efectivo» por restaurante al crearlo y
  «Datáfono» y «QR» de tipo `bank` compartidos).
- **`RestaurantSettings`** (1:1 con `Restaurant`, se crea con él): `alert_late_minutes` (18), `alert_bill_minutes` (10),
  `roi_hour_cost` (20000), `roi_minutes_per_order` (11), `roi_baseline_hours_per_100` (18.4), `roi_monthly_cost`
  (2740000), `roi_start_date` (null), `kitchen_prepay_roles` (JSON lista de roles que deben cobrar antes de cocina;
  vacía por omisión). Se copian al crear un restaurante «como otro».
- **`Organization`** (ampliar): `role_policy` (JSON, por omisión `DEFAULT_ROLE_POLICY`), `cash_tolerance` ya existe.
- **`CashShift`** (turno de caja): `restaurant`, `state` (`open` | `closed`), `opened_by`, `opened_at`, `opening_cash`,
  `opening_notes`, `closed_by`, `closed_at`, `expected_cash`, `counted_cash`, `difference` (= contado − esperado),
  `closing_notes`, `zone_staff` (JSON `{floor_id: {zone_id: [account_id]}}` del turno; vacío = el habitual del piso).
  **Un solo turno abierto por restaurante** (restricción única parcial y bloqueo del restaurante al abrir).
- **`CashMove`**: `shift`, `kind` (`in` | `out`), `amount` (> 0), `reason` (1–200), `account`, `created_at`.
- **`Order`**: `organization`, `restaurant`, `shift`, `uuid` (del cliente; único por organización: idempotencia del
  alta), `service` (`dine_in` | `takeout` | `delivery`), `prefix` (`DI` | `TA` | `DE`), `tracking` (secuencia del día
  por restaurante y prefijo, con bloqueo del restaurante), `number` (texto `DI-007`), `table` (obligatoria en `dine_in`,
  null en los demás), `guests`, `baby_chair`, `customer_name`, `delivery_address`, `delivery_phone`, `note`, `origin`
  (`waiter` | `diner` | `ai`), `channel` (`pos` | `menu` | `whatsapp`), `state` (`draft` | `paid` | `cancelled`),
  `billing` (bool: «esperando pago», compartido entre tablets) y `billing_at`, `created_by`, `created_at`, `paid_at`,
  `paid_by`, `subtotal`, `tax`, `tip`, `total` (= suma de líneas con impuestos + propina), `paid` (suma de pagos),
  `change`. **Los totales los calcula el servidor** en cada escritura; el cliente nunca los manda.
- **`OrderLine`**: `order`, `uuid` (único por pedido), `product`, `name` (copia), `qty` (> 0, hasta 999), `unit_price`
  (copia del precio que rige en la sede, con impuestos incluidos, más `price_extra` de las opciones), `taxes` (JSON
  `[{id, name, amount, included}]` copiado al crear), `options` (JSON `[{group, name, price_extra}]`), `parent`
  (FK a la línea del combo, null si no es componente), `discount_pct` (0–100), `note` (≤ 500), `course` (null = sin
  enviar), `ready_at`, `served_at`, `cancelled`, `subtotal` (sin impuestos), `total` (con impuestos).
- **`Course`** (curso de cocina): `order`, `index` (1, 2, 3…), `fired_at`, `preparation_at`, `ready_at`, `served_at`.
- **`Payment`**: `order`, `method`, `amount` (> 0), `received` (efectivo entregado, opcional), `reference` (voucher,
  ≤ 60), `request_key` (16–80, único por organización: un reintento devuelve el mismo pago), `account`, `created_at`.
- **`SalesEvent`** (app `realtime`): `organization`, `restaurant`, `kind` (`orders` | `kitchen` | `tables` | `cash` |
  `notify`), `created_at`. Lo escribe toda escritura relevante; lo sirve el SSE y se borra lo de más de un día.

### Reglas

- **Caja.** `POST /shifts` exige que no haya otro abierto en el restaurante (`409 shift_open`). Las entradas y salidas
  cambian el efectivo esperado: `expected_cash = opening_cash + pagos en efectivo − cambio + entradas − salidas`.
  **Cerrar:** `409 open_orders` si hay pedidos en borrador en el turno (la regla pasa del POS al servidor);
  `400 note_required` si `counted_cash ≠ expected_cash` y no hay `closing_notes` («Escribe el motivo para cerrar: el
  dueño lo verá en los cuadres de caja.»). Nunca se impide cerrar por la diferencia, solo sin explicarla. Al cerrar, si
  `|difference| > Organization.cash_tolerance`, se crea un aviso `cash` para el dueño y los encargados de la sede («Caja
  de Poblado cerró con un faltante de $ 12.000 (Laura Encargada): «nota»», nota recortada a 160). El dueño fija la
  tolerancia (`PUT /settings/cash`). «Forzar cierre» desaparece: no hay descuadre contable que forzar.
- **Pedidos.** Crear exige turno abierto en el restaurante (`409 shift_closed`) y `create_orders`. `dine_in` exige mesa
  activa del restaurante; una mesa con pedido en borrador acepta otro pedido (varias cuentas por mesa), pero **mover**
  un pedido a una mesa con pedido abierto da `409 table_busy`. Las líneas copian nombre, precio (el que rige en la
  sede: `RestaurantPrice` o el base, con impuestos incluidos) e impuestos del momento. Un producto archivado, fuera de
  la carta, agotado en la sede (`RestaurantUnavailable`) o sin porciones se rechaza (`400 unavailable` con el nombre).
  Un combo llega como línea padre con `children` (componentes a precio 0); un plato con opciones trae `options` y el
  servidor suma `price_extra`. `discount_pct` solo lo mandan `diner` y `ai` (descuento de primera compra, T3).
- **Cocina a dos manos.** `POST /orders/{id}/fire` toma las líneas sin curso y no canceladas, crea un `Course` con el
  siguiente `index` y `fired_at`, y publica `kitchen`. **Prepago:** si el pedido no está pagado y el rol de quien lo
  manda está en `kitchen_prepay_roles` → `409 prepay_required` («Tu rol debe cobrar antes de enviar a cocina»); al
  **pagar** se disparan solas las líneas pendientes. `start` pone `preparation_at` si no lo tenía; `ready` (curso) pone
  `ready_at` en el curso y en sus líneas sin cancelar y arranca el curso si hacía falta; `ready` (líneas) marca plato a
  plato y cierra el curso cuando no queda nada pendiente; `serve` (líneas o curso) **solo entrega lo listo**
  (`400 not_ready`) y cierra el curso cuando todo está servido o cancelado. Cada plato listo crea un aviso `kitchen`
  («Plato · Mesa 4», acción `serve`, `order_id`) para los meseros del restaurante (y de la zona de la mesa, si el piso
  tiene reparto) y los encargados. Editar o cancelar líneas (`DELETE /orders/{id}/lines`) está prohibido si el pedido no
  está en borrador, tiene pagos, o la línea ya empezó, está lista o servida (`409 not_editable`); los cursos que quedan
  vacíos se borran y un pedido sin líneas se cancela.
- **Cobro.** `charge_orders`. Un pago suma a `paid`; con `received` en efectivo, `change = received − amount` del
  último pago en efectivo; `PUT /orders/{id}/tip` fija la propina (≥ 0) antes de completar. `POST /orders/{id}/pay`
  exige `paid ≥ total` (`400 unpaid`), pasa a `paid`, pone `paid_at`/`paid_by`, dispara las líneas sin curso (prepago),
  apaga la llamada de la mesa si no queda otra cuenta abierta en ella, quita `billing`, y **descuenta el inventario**:
  un `StockMove kind=sale` por ingrediente de las recetas (y de los componentes de combos) con `request_key`
  `order:<id>:ingredient:<id>` (idempotente), sin dejar existencias negativas (si no alcanza, descuenta hasta 0 y lo
  anota en `reason`). `pending` del inventario (T1) = requerimientos de las líneas no canceladas de los pedidos en
  borrador del restaurante; `free = stock − pending` y las porciones se calculan con `free`.
- **Mesas.** `PUT /tables/{id}/call` exige `serve_orders`; la hora la pone el servidor; `none` la limpia. El plano:
  `PUT /floors/{id}/plan` exige `admin`, **caja cerrada** en el restaurante (`409 shift_open`), `revision` igual a la
  guardada (`409 stale_plan`), nombre de 1 a 100, hasta 500 elementos, zonas con id único y color hexadecimal, mesas con
  número único (1–9999), asientos 1–100, separadas 16 px entre sí y de las paredes, y **no retira mesas con pedidos en
  borrador** (`409 table_in_use`). `DELETE /floors/{id}`: caja cerrada, debe quedar al menos un piso activo, sin
  pedidos en borrador; con historial de ventas se archiva (`{result: 'archived'}`), si no se borra (`removed`).
  Reservas que apartan mesas llegan en T3: `reserved_at` sale `null` por ahora.
- **Reparto por zonas.** `GET /floors/{id}/zone-staff?shift_id=` devuelve el del turno si existe (`source: 'shift'`) o
  el habitual (`source: 'plan'`). Escribir el habitual es de `admin`; el del turno exige turno abierto.
- **Tiempo real (SSE).** `GET /events?restaurant_id=&after=<id>` responde `text/event-stream` con un evento por
  escritura (`id: <SalesEvent.id>`, `event: orders|kitchen|tables|cash|notify`, `data: {}`), un latido `: ping` cada 15 s
  y cierre a los 5 minutos (el cliente reconecta con `after`). La vista sondea la tabla cada segundo; sin datos, nada.
- **Informes del turno y del periodo.** Ventas = pedidos `paid` por `paid_at` en la zona horaria de la organización,
  **con impuestos y sin propina**; `autonomous` = pedidos con `origin` ≠ `waiter`. `by_method` suma `Payment.amount`
  por método; `by_waiter` por `created_by`; `top_products` por producto (sin componentes de combo).

### API

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `GET /floors?restaurant_id=&all=1` | sesión | `{"floors": [{id, name, sequence, active, revision, has_background, table_count, tables: [{id, number, seats, x, y, width, height, shape, color, zone_id, active, call, call_at, token, reserved_at: null}]}]}`; sin `all` solo activos |
| `POST /floors` | `admin` | `{restaurant_id, name}` → `{"floor": {...}}` (201) |
| `PATCH /floors/{id}` | `admin` | `{name?, active?, sequence?}` → `{"floor"}`; desactivar exige otro piso activo (`409 last_floor`) |
| `DELETE /floors/{id}` | `admin` | → `{"result": "removed" \| "archived"}`; `409 shift_open`, `409 table_in_use`, `409 last_floor` |
| `GET /floors/{id}/plan` | sesión | `FloorDocument`: `{id, name, revision, tables: [{id, key, number, seats, zone, x, y, width, height}], walls, zones, decor, images: [{id, x, y, width, height}], background: bool, background_size}` |
| `PUT /floors/{id}/plan` | `admin` | el `FloorDocument` (con `images[].data` y `background` en base64 cuando son nuevas) → el documento guardado con `revision + 1`; `409 stale_plan`, `409 shift_open`, `409 table_in_use`, `400 invalid_plan` con el detalle |
| `GET /floors/{id}/background` · `GET /floors/{id}/images/{image_id}` | público con `?org=` | WebP con caché como las fotos |
| `GET /floors/{id}/zone-staff?shift_id=` | sesión | `{"assignments": {zone_id: [account_id]}, "source": "plan" \| "shift", "people": [{id, name, role}]}` |
| `PUT /floors/{id}/zone-staff` | `admin` | `{assignments}` → igual (habitual) |
| `PUT /shifts/{id}/zones` | `admin` | `{floor_id, assignments \| null}` → igual (`null` vuelve al habitual); `409 shift_closed` |
| `GET /tables/calls?restaurant_id=` | sesión | `{"calls": [{table_id, table_number, kind, since}]}` |
| `PUT /tables/{id}/call` | `serve_orders` | `{kind}` → `{"table": {...}}` |
| `GET /shifts/open?restaurant_id=` | sesión | `{"shift": {id, restaurant_id, state, opened_at, opened_by: {id, name}, opening_cash, opening_notes} \| null}` |
| `POST /shifts` | `cashier`, `admin` | `{restaurant_id, opening_cash, notes}` → `{"shift"}` (201); `409 shift_open` |
| `GET /shifts?restaurant_id=&limit=12` | `sales` | `{"shifts": [{id, state, opened_at, closed_at, opened_by, closed_by, total, orders}]}` |
| `GET /shifts/{id}/closing` | `sales` | `{orders_count, orders_total, opening_cash, cash_payments, cash_moves: [{kind, amount, reason}], expected_cash, other_methods: [{id, name, amount, count}], draft_orders, opening_notes}` |
| `POST /shifts/{id}/moves` | `sales` | `{kind: "in" \| "out", amount, reason}` → `{"move", "expected_cash"}` |
| `POST /shifts/{id}/close` | `cashier`, `admin` | `{counted_cash, notes}` → `{"shift": {..., expected_cash, counted_cash, difference, closing_notes, over_tolerance}}`; `409 open_orders`, `400 note_required` |
| `GET /shifts/closings?from=&to=&restaurant_ids=&only_differences=1` | `admin` (los suyos), `owner` | `{"closings": [{shift_id, restaurant_id, restaurant_name, closed_at, closed_by: {id, name}, expected, counted, difference, notes, over_tolerance}], "tolerance"}` |
| `PUT /settings/cash` | `owner` | `{tolerance}` → `{tolerance}` |
| `GET /payment-methods?restaurant_id=` | sesión | `{"methods": [{id, name, type}]}` |
| `POST /payment-methods` · `PATCH /payment-methods/{id}` · `DELETE /payment-methods/{id}` | `owner` | `{name, type, restaurant_ids?}`; borrar uno con pagos lo desactiva |
| `GET /orders?restaurant_id=&state=open\|paid&from=&to=&limit=200` | sesión | `{"orders": [Order]}` con `Order = {id, uuid, number, tracking, service, state, origin, channel, table_id, table_number, guests, baby_chair, customer_name, delivery_address, delivery_phone, note, billing, created_at, paid_at, waiter: {id, name}, subtotal, tax, tip, total, paid, change, lines: [{id, uuid, product_id, name, qty, unit_price, subtotal, total, note, options, parent_id, discount_pct, course_id, ready_at, served_at, cancelled}], courses: [{id, index, fired_at, preparation_at, ready_at, served_at}], payments: [{id, method_id, method, amount, received, reference, created_at}]}`; `open` = borradores del turno abierto |
| `GET /orders/{id}` | sesión | `{"order": Order}` |
| `POST /orders` | `create_orders` | `{restaurant_id, uuid, service, table_id?, guests?, baby_chair?, customer_name?, delivery_address?, delivery_phone?, note?, lines: [{uuid, product_id, qty, note?, options?, children?: [{uuid, product_id, qty}]}], fire: bool}` → `{"order"}` (201; `uuid` repetido devuelve el existente); `409 shift_closed`, `400 unavailable`, `409 prepay_required` |
| `POST /orders/{id}/lines` | `create_orders` | `{lines: [...], fire: bool}` → `{"order"}` (una ronda = un curso nuevo si `fire`) |
| `DELETE /orders/{id}/lines` | `create_orders` | `{line_ids}` → `{"order"}`; `409 not_editable` |
| `POST /orders/{id}/fire` | `create_orders` | → `{"order", "course_id" \| null}`; `409 prepay_required` |
| `PATCH /orders/{id}` | `create_orders` (`billing`: también `serve_orders`) | `{table_id?, note?, guests?, billing?, customer_name?}` → `{"order"}`; `409 table_busy` |
| `POST /orders/{id}/payments` | `charge_orders` | `{method_id, amount, received?, reference?, request_key}` → `{"order"}`; `400 overpaid` si supera el total |
| `PUT /orders/{id}/tip` | `charge_orders` | `{amount}` → `{"order"}` |
| `POST /orders/{id}/pay` | `charge_orders` | → `{"order"}`; `400 unpaid` |
| `POST /orders/{id}/cancel` | `admin` | `{reason}` → `{"order"}`; solo borradores sin pagos |
| `GET /kitchen/tickets?restaurant_id=` | `kitchen` | `{"tickets": [{id (curso), order_id, number, table_number, service, waiter, note, fired_at, preparation_at, ready_at, lines: [{id, name, qty, note, station, ready_at, served_at}]}], "completed": [{fired_at, ready_at}]}` (cursos disparados y no servidos; `completed` = los listos del turno, para el tiempo medio) |
| `POST /courses/{id}/start` · `POST /courses/{id}/ready` | `kitchen` | → `{"course"}` |
| `POST /courses/{id}/serve` | `serve_orders` | → `{"course"}`; `400 not_ready` |
| `POST /lines/ready` | `kitchen` | `{line_ids}` → `{"lines"}` |
| `POST /lines/serve` | `serve_orders` | `{line_ids}` → `{"lines"}`; `400 not_ready` |
| `GET /sales/summary?restaurant_id=&shift_id=\|from=&to=` | `sales` | `{total, orders, autonomous, by_method: [{method, amount}], by_waiter: [{waiter, amount, orders}], top_products: [{product, qty, amount}]}` |
| `GET /sales/orders?restaurant_id=&shift_id=\|from=&to=&limit=200` | `sales`, `history` | `{"orders": [Order]}` pagados, con líneas y pagos |
| `GET /sales/insights?restaurant_id=` | `dashboard` | `SalesHistory` como `pos/lib/domain/insights.ts`: `{today, window_days: 28, history_days: 84, daily: [{date, total, orders}], hourly: [{hour, total, orders}], products: [{product_id, name, qty, amount, prev_qty}]}` |
| `GET /settings?restaurant_id=` | sesión | `{restaurant: {alert_late_minutes, alert_bill_minutes, roi_hour_cost, roi_minutes_per_order, roi_baseline_hours_per_100, roi_monthly_cost, roi_start_date, kitchen_prepay_roles}, role_policy, can_charge, can_edit_inventory, cash_tolerance}` |
| `PATCH /settings?restaurant_id=` | `admin` (umbrales y ROI), `owner` (`kitchen_prepay_roles`) | campos → igual |
| `PUT /settings/roles` | `owner` | `role_policy` → `{role_policy}`; `400 invalid_policy` (tres roles, al menos una vista, `create_orders`/`charge_orders` exigen `tables` u `orders`, `serve_orders` exige `tables`) |
| `GET /events?restaurant_id=&after=` | sesión | SSE |

### Pruebas que deben existir (`# Falla si …`)

Turno único por restaurante; esperado con pagos, cambio, entradas y salidas; cerrar con borradores; cerrar con
diferencia sin nota y con nota; aviso de caja solo si supera la tolerancia; cuadres por sede para el encargado y todas
para el dueño. Alta de pedido con precio de la sede, impuestos copiados, totales del servidor, numeración DI/TA/DE por
día y sede, `uuid` repetido, mesa obligatoria en `dine_in`, producto agotado o fuera de carta, combo y opciones.
Prepago por rol y disparo al pagar. Cursos: fire, start, ready por curso y por línea, serve solo lo listo, editar o
cancelar prohibido tras empezar, pedido sin líneas se cancela. Pagos: idempotencia por `request_key`, sobrepago,
propina, cambio, pay con saldo, inventario descontado una sola vez y `pending`/`free`. Mesas: llamadas, mover a mesa
ocupada, plano con caja abierta, revisión vieja, mesa con pedido no se retira, borrar piso con historial archiva.
Reparto por zonas habitual y del turno. Informes: con impuestos y sin propina, por método, por mesero, top products
sin componentes, insights por día local. Política de roles inválida. SSE: una escritura genera su evento y `after`
filtra. Aislamiento entre organizaciones y permisos por rol en cada ruta.

## Contrato T3 · Clientes, fidelización, reservas y avisos

Lo que hoy usan Reservas, el salón (mesas apartadas), el cobro (socio y puntos), Consola → Clientes y Promociones, la
campana y el comensal (cupones, premios, banners y anticipos), según el inventario del 2026-10-02 sobre
`pos/lib/services/{customers,benefits,reservations,reservationHours,paymentKit,employees,notifications}.ts`,
`pos/components/settings/MenuBannersForm.tsx` y los addons `projectapp_reservations`, `projectapp_ops/models/{menu_benefits,
benefit_actions,menu_banners}.py` y `projectapp_notify`. Mismas reglas comunes que T0–T2 (rutas bajo `/api/pos/v1`, sin
barra final, `X-Waiter-Org` y cookie `waiter_sid`; errores `{error, message}`; importes en COP; horas ISO UTC del servidor).

**Principio de este contrato: las respuestas copian la forma de los métodos de Odoo que reemplazan.** Donde la tabla
dice «como `waiter_x`», el JSON es el mismo que devuelve hoy ese método de Odoo (mismos nombres de campo en snake_case,
mismos valores), leído en el código del addon. Así el POS reutiliza sus traductores. Los ids son los del sistema propio.

### Modelos

- **`customers.Customer`** (app `loyalty`): `organization`, `name`, `phone`, `email`, `id_type` (`CC` | `CE` | `NIT` |
  `PAS` | `TI` | `PEP`), `vat`, `street`, `city`, `diner_key` (UUID de la cuenta del comensal, opcional, único por
  organización), `active`, `created_at`. El consumidor final (`222222222222`) es un cliente sembrado por organización.
- **`Order.customer`** (ampliar `sales`): FK opcional al cliente; `PATCH /orders/{id}` admite `customer_id`.
- **`LoyaltyProgram`** (uno por organización): `name` («Puntos Waiter»), `spend_per_point`, `value_per_point`,
  `minimum_points`, `active`. **`LoyaltyCard`**: `customer`, `code` (único por organización, 8 caracteres), `points`,
  `expires` (opcional). **`LoyaltyMove`**: `card`, `kind` (`earn` | `redeem` | `reserve` | `release` | `grant` |
  `reversal`), `points` con signo, `order`, `key` (idempotencia, único por organización), `description`, `created_at`.
- **`Coupon`**: `organization`, `name`, `code` (`[A-Z0-9_-]{3,32}`, único), `percent` (0,01–100), `minimum` (con
  impuestos), `start`, `end`, `active`, `restaurants` (M2M; vacío = todos).
- **`BenefitAction`**: `organization`, `action` (`cuenta` | `opinion` | `novedades` | `pago_en_linea`, única por
  organización), `active`, `reward` (`descuento` | `cupon` | `puntos`), `percent`, `coupon`, `points`, `restaurants`.
  **`BenefitGrant`**: `organization`, `key` (único), `card`, `points`, `created_at`. `Organization.signup_discount_percent`
  (5 por omisión) se sincroniza con la acción `cuenta` de premio `descuento`.
- **`Banner`** (en la organización, hasta 8, ordenados): `layout`, `title`, `subtitle`, `button`, `target`, `target_id`,
  `image` (WebP en `MEDIA_ROOT`), `theme`, `active`, `restaurants`.
- **`reservations.Reservation`**: `organization`, `restaurant`, `code` (`RV` + 3 dígitos por organización), `customer`
  (opcional), `customer_name`, `customer_email`, `customer_phone`, `people`, `baby_chair`, `notes`, `date`,
  `time_start`/`time_end` (horas decimales en medias horas; fin por omisión = inicio + 1,5), `prep_minutes` (0, 15, 30,
  60, 120; 30 por omisión), `tables` (M2M) y `main_table`, `state` (`confirmed` | `seated` | `no_show` | `cancelled`),
  `preorder` (FK a `sales.Order`, opcional) y sus líneas pedidas (`ReservationLine`: producto, cantidad, nota, precio),
  `deposit_amount` (0–50.000.000), `deposit_state` (`none` | `pending` | `paid`), `deposit_reference`, `deposit_paid_at`,
  `pay_token` (único, 32 caracteres), `created_by`, `created_at`.
- **`ReservationSchedule`** (1:1 con `Restaurant`): `weekly` (JSON por día 0–6 con hasta 4 franjas), `overrides`
  (hasta 366 fechas con nota de hasta 80), `rules` (`minNotice` múltiplo de 30 hasta 7 días, `maxDays` hasta 730). Sin
  horario configurado: 10–22 todos los días.
- **`notifications`** (ampliar): `Account.notify_prefs` (JSON de 6 booleanos `kitchen|inventory|system` ×
  `popup|sound`, todos encendidos por omisión) y el aviso de existencias bajas (un comando `notify_low_stock` para cron
  que crea un aviso `inventory` por ingrediente bajo el mínimo en cada sede, sin duplicar, y lo cierra al recuperarse).

### Reglas (portadas tal cual de Odoo; léelas allí)

- **Reservas** (`projectapp_reservations/models/reservation.py`, `restaurant_table.py`, `pos_config.py`): validaciones de
  hora, horario del día (solo al crear o mover), antelación mínima y ventana máxima (también para el personal), choque
  en cualquier mesa compartida contando el margen de preparación, todas las mesas del mismo restaurante, mesa
  «reservada» en el plano solo dentro de `[time_start − prep, time_end)` del día, `available` / `reserved` /
  `unavailable` (por capacidad) con `exclude_id`, cambio de mesas solo en confirmadas (la primera es la principal y el
  pre-pedido la sigue), sentar solo desde confirmada (el pre-pedido pasa a la mesa en el turno abierto, o se crea al
  sentar si no existía), no se presentó y cancelada cancelan el pre-pedido en borrador. **Ahora `reserved_at` de
  `GET /floors` y el plano dejan de ser null** y el plano no retira mesas con reservas confirmadas futuras
  (`409 table_reserved`). Correo de confirmación con el backend de correo de Django si hay correo.
- **Anticipo:** se fija o quita mientras no esté pagado y la reserva esté activa; se marca pagado a mano solo si está
  pendiente; la vista pública por `pay_token` no muestra correo, teléfono ni notas; la conciliación es idempotente por
  referencia, exige el monto exacto y bloquea la fila. Enlace `<DINER_PUBLIC_URL>/<org>/<sede>/reserva/<token>`. El
  anticipo no entra en ventas ni en la caja (decisión 2026-09-19).
- **Cupones, puntos y acciones** (`menu_benefits.py`, `benefit_actions.py`, decisión 2026-09-14): cotizar un cupón
  (vigente, restaurante permitido, subtotal ≥ mínimo, monto redondeado); el cupón reemplaza el descuento de primera
  compra; canje en el cobro solo con el pedido en borrador y sin pagos, tarjeta vigente, puntos = mín(disponibles,
  total / valor) respetando el mínimo, los borradores reservan puntos, la línea de descuento va sin impuestos; abono al
  pagar sobre el consumo neto (sin propina, restando el canje), idempotente; devoluciones (cancelar un pedido pagado no
  existe aún) quedan para T4. `grant_points` idempotente por clave.
- **Banners** (`menu_banners.py`): hasta 8; layout `product|promotion|category|image|notice`; tema
  `violet|amber|dark`; título obligatorio hasta 80, subtítulo hasta 160, botón hasta 35; el destino debe ser un plato
  activo o una categoría de la organización; imagen PNG/JPG/WebP hasta 500 KB y 4096 px, guardada como WebP; `image`
  exige imagen.
- **Clientes:** buscar por nombre, documento o teléfono (hasta 200); `orders` = pedidos pagados del cliente; `invoiced`
  = suma de esos pedidos (T4 la cambia por facturado). Solo `owner` y `admin` escriben.
- **Quién:** `owner` todo; `admin` reservas, horario y anticipos de sus sedes, y clientes; `cashier` canjea y asocia
  clientes al cobrar (`charge_orders`); vista `reservations` de la política para leer y crear reservas; promociones y
  banners solo `owner`.

### API

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `GET /customers?q=` · `POST /customers` · `PATCH /customers/{id}` | sesión · `owner`, `admin` | `{customers: [{id, name, phone, email, vat, id_type, street, city, orders, invoiced}]}` · `{customer}` |
| `GET /customers/id-types` | sesión | `{id_types: [{id: "CC", name: "Cédula de ciudadanía"}, …]}` |
| `GET /customers/{id}/card` · `GET /customers/{id}/orders` | sesión | `{card: {id, points, code, program, expires} \| null}` · `{orders: [{id, number, paid_at, total, state}]}` (20) |
| `GET /loyalty/program` | sesión | `{program: {id, name, spend_per_point, value_per_point, minimum_points} \| null}` |
| `GET /loyalty/cards/{code}` | sesión | `{member: {card_id, code, name, phone, points}}` o `404` |
| `POST /orders/{id}/redeem` | `charge_orders` | `{card_id}` → `{amount, points, order}`; `409 not_editable`, `400 minimum_points` |
| `PATCH /orders/{id}` | (ampliar) | admite `customer_id` |
| `GET /benefits?restaurant_id=` · `PUT /benefits` | `owner` | como `pos.config.waiter_benefits_settings`: `{coupons, loyalty, actions}`; el PUT acepta `{coupon?, loyalty?, action?}` (crear o editar uno) y devuelve lo mismo |
| `GET /banners?restaurant_id=` · `PUT /banners` | sesión · `owner` | como `waiter_banner_settings`: `{banners: [...]}`; el PUT recibe la lista completa (imágenes nuevas en base64) |
| `GET /banners/{id}/image?org=` | público | WebP |
| `GET /reservations/timeline?restaurant_id=&date=&floor_id=` | `reservations` | como `waiter_timeline` |
| `GET /reservations/slots?restaurant_id=&date=` | `reservations` | como `waiter_slots` |
| `GET /reservations/tables?restaurant_id=&date=&time_start=&people=&prep=&exclude_id=` | `reservations` | como `waiter_available_tables` (con `include_unavailable`) |
| `POST /reservations` | `reservations` | `{restaurant_id, customer_name, customer_email, customer_phone, people, baby_chair, notes, date, time_start, table_ids, prep_minutes, deposit_amount, lines: [{product_id, qty, note}]}` → como `waiter_detail` (201) |
| `GET /reservations/{id}` · `GET /reservations?table_id=` | `reservations` | como `waiter_detail` · `{reservations: [card]}` vivas de la mesa |
| `PUT /reservations/{id}/tables` | `reservations` | `{table_ids}` → detalle |
| `POST /reservations/{id}/{seat\|no-show\|cancel}` | `reservations` | → detalle |
| `PUT /reservations/{id}/deposit` · `POST /reservations/{id}/deposit/paid` | `admin`, `owner` | `{amount}` · `{reference}` → detalle |
| `GET /reservations/schedule?restaurant_id=` · `PUT /reservations/schedule?restaurant_id=` | `reservations` · `admin`, `owner` | `{weekly, overrides, rules}` |
| `GET /public/reservations/{token}` | público (`?org=`) | como `waiter_deposit_public` |
| `POST /internal/reservations/{token}/deposit-paid` | interno (`X-Internal-Key`) | `{reference, amount}` → idempotente |
| `GET /me/notify-prefs` · `PUT /me/notify-prefs` | sesión | `{prefs: {kitchen_popup, …}}` (solo las propias) |
| `POST /notifications/{id}/request-ingredient` | `admin` | → `{request}` de inventario (crea o amplía la solicitud del proveedor) |

**Para el comensal** (las usa `experience_app` desde T5, sin HTTP: funciones de servicio importables con la misma
forma que hoy devuelven `waiter_coupon_quote`, `waiter_diner_benefits`, `waiter_benefit_actions`, `waiter_grant_points`,
`waiter_banner_settings`, `waiter_deposit_public` y `waiter_deposit_paid`): `loyalty.services.coupon_quote(org,
restaurant, code, subtotal)`, `diner_benefits(org, diner_key, order_uuid)`, `benefit_actions(org, restaurant)`,
`grant_points(org, diner_key, key, points, description)`, `banners(org, restaurant)`,
`reservations.services.public_deposit(org, token)`, `deposit_paid(org, token, reference, amount)`.

### Pruebas que deben existir (`# Falla si …`)

Reservas: hora fuera de franja, fuera de horario, antelación y ventana, choque con margen en mesa compartida, mesas de
otra sede, capacidad, mesa reservada en el plano solo en su ventana, cambio de mesas y principal, sentar con y sin
pre-pedido, no show y cancelar cancelan el pre-pedido, anticipo (fijar, quitar, pagado a mano, conciliación exacta e
idempotente, vista pública sin datos privados), horario (franjas, fechas especiales, reglas), plano no retira mesa
reservada. Fidelidad: cupón vigente, por sede y mínimo; canje con reserva de puntos y mínimo; abono sobre neto sin
propina e idempotente; grant idempotente; acción `cuenta` sincroniza el descuento de primera compra. Banners: límites e
imagen. Clientes: búsqueda, consumidor final, pedido asociado. Avisos: preferencias propias, existencias bajas sin
duplicar. Aislamiento entre organizaciones y permisos por rol en cada ruta.

## Contrato T4 · Informes, empresa y documentos de venta

Lo que hoy usan Consola → Resumen, Rentabilidad, Retorno, Facturación, Empresa e impuestos y Diseño (marca), el recibo
del cobro y la política «cobrar antes de cocina», según el inventario del 2026-10-02 sobre
`pos/lib/services/{business,roi,invoices,taxRegime,settings,issuer}.ts` y `projectapp_ops/models/{business_reports,
billing,tax_regime,company}.py`, `projectapp_pantry/models/profitability.py`. Mismas reglas comunes. **Mismo principio
que T3:** donde la tabla dice «como `waiter_x`», el JSON copia la forma del método de Odoo.

**No hay contabilidad en el sistema propio** (ADR 2026-10-01): en lugar del asiento de Odoo hay un **documento de venta**
que se emite ante un **proveedor de factura electrónica** detrás de una interfaz propia. En desarrollo y pruebas el
proveedor es simulado (`billing.providers.simulated`); el real llega en el sprint de integraciones.

### Modelos

- **`Organization`** (ampliar, datos del emisor): `legal_name` y `tax_id` ya existen; añadir `tax_id_dv` (dígito de
  verificación), `fiscal_regime` (`responsable_iva` | `no_responsable` | `inc`), `fiscal_responsibilities` (lista RUT,
  p. ej. `R-99-PN`), `address`, `city`, `phone`, `email`, `signup_discount_percent` (si T3 no lo añadió).
- **`billing.Resolution`** (numeración DIAN por organización): `kind` (`invoice` | `pos`), `prefix`, `number_from`,
  `number_to`, `next_number`, `valid_from`, `valid_to`, `technical_key`, `active`. Se siembra una de prueba por
  organización (`SETP`, 990000000–995000000) para el proveedor simulado.
- **`billing.SalesDocument`**: `organization`, `restaurant`, `order` (1:1 con un pedido pagado), `kind` (`invoice` |
  `pos`), `resolution`, `number` (texto `PREFIJO-N`), `buyer` (FK a `loyalty.Customer`; el consumidor final si no se
  identifica), `issued_at`, `subtotal`, `tax_total`, `tip` (fuera de la base), `total`, `taxes` (JSON por tasa: `[{name,
  rate, base, amount}]`), `lines` (copia de las líneas con base, impuesto y total), `state` (`pending` | `issued` |
  `rejected` | `contingency`), `provider_id`, `cufe` (o CUDE), `qr`, `xml` (FileField), `errors` (JSON), `attempts`,
  `request_key` (idempotencia), `created_by`. Nota crédito (`kind = credit_note`, `original`) queda definida pero sin
  pantalla hasta que exista la devolución.
- **`billing.BillingSettings`** (1:1 con la organización): `tip_label` (cómo se nombra la propina en el documento,
  «Propina voluntaria»), `send_email` (enviar el documento al comprador), `default_kind` (`pos` por omisión).

### Reglas

- **Resumen** (como `waiter_org_summary`, `business_reports.py`): solo `owner`; periodo inclusivo en la zona de la
  organización y el anterior de igual duración; ventas = total − propina de pedidos `paid`; pedidos; comensales =
  `guests`; ticket = ventas / pedidos; propinas; por sede y total.
- **Rentabilidad** (como `waiter_profitability`): `owner` toda la organización o una sede; `admin` solo las suyas (y debe
  elegir una). Ingresos sin impuestos; precio de la sede; neto sin impuestos; costo de la receta actual (null si falta un
  costo); margen; food cost; clases Estrella / Caballo de batalla / Rompecabezas / Perro con popularidad ≥ 70 % del
  promedio de unidades y margen ≥ promedio ponderado; sin ingredientes ni componentes de combo.
- **ROI:** los pedidos pagados del periodo con su `origin` (ya existe `GET /sales/orders`); los supuestos son de
  `RestaurantSettings` (T2). Sin endpoint nuevo.
- **Documento de venta:** `owner` revisa y emite. **Revisión** (sin escribir), con `issues` en español: el pedido debe
  estar pagado; comprador válido (con documento y nombre) o consumidor final; Σ líneas = total sin propina; Σ impuestos
  por línea = impuesto del pedido; pagos = total; resolución vigente con números disponibles; datos del emisor
  completos (NIT, DV, régimen, dirección); la propina no lleva impuesto. **Emitir** es idempotente por pedido: bloquea
  el pedido, toma el siguiente número de la resolución (bloqueo de fila), arma el documento, llama al proveedor; el
  simulado devuelve `issued` con un CUFE (SHA-384 de los campos de la DIAN) y un XML UBL mínimo, y rechaza si el NIT
  del comprador termina en `000` (para probar el rechazo). Rechazo → `rejected` con `errors`; error de red →
  `contingency` y reintento con `POST /documents/{id}/retry`.
- **Impuestos de Colombia:** INC 8 % o IVA 19 % según el régimen; el precio de la carta incluye el impuesto; base =
  total / (1 + tasa) redondeada a 2 decimales por línea; la propina nunca entra en la base (art. 512-9 ET) y va en su
  propia línea informativa; el recibo nombra el impuesto real (INC o IVA), no siempre «IVA».
- **Empresa y marca:** `GET/PATCH /company` (datos del emisor; `owner`); `GET/PATCH /brand` (los campos `brand_*` de la
  organización con las reglas de `company.py` `write_brand`: color `#RRGGBB`, tipografía de la lista, redondeo 4/14/24,
  logo PNG/JPG/GIF hasta 2 MB, nunca SVG; `owner`) y `GET /brand/logo?org=` público.

### API

| Método y ruta | Quién | Cuerpo → Respuesta |
|---|---|---|
| `GET /reports/summary?from=&to=` | `owner` | como `waiter_org_summary` |
| `GET /reports/profitability?from=&to=&restaurant_id=` | `owner`, `admin` | como `waiter_profitability` |
| `GET /company` · `PATCH /company` | sesión · `owner` | `{company: {name, legal_name, tax_id, tax_id_dv, fiscal_regime, fiscal_responsibilities, address, city, phone, email}}` |
| `GET /brand` · `PATCH /brand` · `GET /brand/logo?org=` | sesión · `owner` · público | `{brand: {name, color, font, radius, tagline, greeting, waiter_name, welcome, has_logo, version}}`; el PATCH acepta `logo` en base64 o `null` |
| `GET /billing/orders?restaurant_id=&offset=&limit=&q=&method_id=&pending=1` | `owner` | `{orders: [{id, number, paid_at, total, tax, tip, table_id, customer_id, customer_name, document_id, payments: [{method_id, method, amount}]}]}` |
| `GET /billing/orders/{id}/review?customer_id=` | `owner` | `{company, journal (la resolución), currency, tip, issues, ready}` (forma de `waiter_billing_review`) |
| `POST /billing/orders/{id}/document` | `owner` | `{customer_id \| null, kind?, request_key}` → `{document}` (201; repetido devuelve el existente); `409 not_ready` con `issues` |
| `GET /documents?offset=&limit=&q=` · `GET /documents/{id}` | `owner` | `{documents: [{id, number, issued_at, buyer, total, state, kind}]}` · `{document}` con líneas, impuestos, CUFE y errores |
| `GET /documents/{id}/detail` | `owner` | forma de `waiter_accounting_detail` (para la pantalla actual): `{ready, issues, company, journal, date, origin, currency, company_currency, untaxed, tax, total, residual: 0, tip, debit, credit, original, lines: [{id, account, label, debit, credit}], taxes: [{id, name, amount}]}` con partidas informativas (Caja / Ingresos / Impuesto / Propina para terceros) |
| `GET /documents/{id}/pdf?org=` | `owner` (cookie) | la representación gráfica (PDF; si no hay librería de PDF, HTML imprimible) con NIT, resolución, CUFE y QR |
| `POST /documents/{id}/retry` | `owner` | → `{document}` |
| `GET /billing/settings` · `PATCH /billing/settings` | `owner` | `{company, journal, currency, tip_label, send_email, default_kind, resolutions: [...]}` |
| `GET /billing/resolutions` · `POST /billing/resolutions` · `PATCH /billing/resolutions/{id}` | `owner` | `{resolutions}` |

### Pruebas que deben existir (`# Falla si …`)

Resumen: periodo anterior, sin propina, por sede, solo dueño. Rentabilidad: costo null con ingrediente sin costo,
neto sin impuestos, clases, encargado solo su sede. Documento: revisión con cada `issue`, emisión idempotente,
numeración consecutiva bajo concurrencia y agotamiento de la resolución, consumidor final, propina fuera de la base,
INC frente a IVA, rechazo simulado y contingencia con reintento, CUFE determinista. Empresa y marca: validaciones de
`write_brand`, solo dueño. Aislamiento y permisos en cada ruta.

## Contrato T5 · El comensal sobre el sistema propio

`experience_app` (el menú del comensal, el asistente, WhatsApp, el MCP del diseño y los pagos en línea) deja de hablar
con Odoo y con el registro para las organizaciones del sistema propio. Inventario del 2026-10-02: el único adaptador de
Odoo es `experience_app/adapters/odoo/pos.py` (más `client.py`), y unos 15 servicios llaman además a
`OdooClient.call_kw` directamente; la resolución del restaurante pasa por `adapters/registry/client.py`.

### Diseño

- **Un adaptador interno con las mismas formas.** Nuevo paquete `experience_app/adapters/core/` con las mismas
  funciones y dataclasses públicas que `adapters/odoo/pos.py` (`Catalog`, `Product`, `Category`, `CompanyBrand`,
  `OdooOrder` → mismo nombre de clase por compatibilidad, `OrderStatus`, `load_catalog`, `read_restaurant_location`,
  `read_company_brand`, `fetch_company_logo`, `fetch_product_image`, `fetch_gallery_image`, `create_order`,
  `fire_course`, `read_order_state`, `read_order_status`, `read_order`, `set_table_call`) implementadas sobre
  `tenancy`, `catalog`, `inventory`, `tables`, `sales`, `kitchen`, `loyalty` y `reservations`, sin HTTP. Y un módulo
  `adapters/core/calls.py` con equivalentes de cada `call_kw` directo (cupón, beneficios, acciones, puntos, banners,
  anticipo público y pagado, `waiter_gateway_check`/`waiter_gateway_paid`, WhatsApp `quote`/`confirm`, disponibilidad
  de un producto para el asistente, estado de un pedido para el historial).
- **Elección del motor por organización.** `settings.ODOO_ORGS` (lista separada por comas, por omisión
  `burger-house`, como `NEXT_PUBLIC_ODOO_ORGS` del POS): esas organizaciones siguen con el adaptador de Odoo; las demás
  usan el interno. Un único punto `experience_app/adapters/backend.py` (`backend_for(org_slug)`) entrega el módulo
  correcto y todos los servicios y vistas pasan por él. Tras T6, `ODOO_ORGS=` vacío apaga Odoo para todos.
- **Resolución del restaurante sin registro.** Para el motor interno, `resolve(org, sede, token)` sale de
  `tenancy.Organization` / `Restaurant` (por `slug`) y de `tables.Table.token` (activa, del restaurante). El `Tenant`
  conserva sus campos (`odoo` vacío, `odoo_table_id` = id de la mesa propia, `brand` desde `Organization`). Una
  organización suspendida responde `404 restaurant_unavailable` con «Este restaurante no está disponible» (y el menú lo
  muestra). La portada `/<org>/` lista los restaurantes activos de la organización.
- **Tokens de mesa:** `TableSession.table_token` pasa a 64 caracteres; `tables.Table.token` admite de 6 a 64
  caracteres alfanuméricos (los de 6 del registro se conservan en T6, para que los QR impresos sigan valiendo).
  `GET /floors` ya entrega el token; el POS mostrará el enlace y el QR de cada mesa (fuera de este contrato).
- **Pedido del comensal:** `create_order` crea un `sales.Order` con `origin='diner'`, `channel='menu'`, `uuid` del
  carrito (idempotente), líneas con `discount_pct` (primera compra) y el cupón o la tarjeta de fidelidad del contrato
  T3; `requires_payment` = el comensal siempre paga antes de cocina (como hoy). **Sin turno de caja abierto** el
  restaurante no atiende pedidos del menú: `409 restaurant_closed` («El restaurante no está recibiendo pedidos en este
  momento») en vez de abrir caja solo. El pago simulado y el de Wompi registran un `Payment` con el método `bank`
  «Pago en línea» (sembrado por organización) y llaman a `pay` (que dispara cocina, descuenta inventario y abona
  puntos). Las llamadas al mesero usan `tables.Table.call`.
- **Estados para el comensal:** `OrderStatus.kitchen` = `none | received | cooking | ready | served` derivado de los
  cursos (`received` = disparado sin iniciar).
- **WhatsApp:** `quote` y `confirm` sobre `sales` con las mismas reglas de `projectapp_ops/models/channel_orders.py`
  (turno abierto, 1–30 líneas, cantidad 1–50, nota ≤ 500, sin combos ni atributos, con existencias, cotización con
  huella y vencimiento, idempotencia por `uuid`, `channel='whatsapp'`, `origin='ai'`, cocina en la misma transacción).
- **MCP del diseño:** `leer_diseno_menu`, banners, `listar_catalogo` y `confirmar_cambio` usan la marca de
  `Organization` y los banners de `loyalty` (contrato T3) para las organizaciones del sistema propio.
- **Administración del menú desde el POS** (hoy pasa por los controladores de Odoo `/waiter/admin/{menu_settings,
  menu_decorations,mcp_keys,payment_gateways}` de `odoo/addons/projectapp_ops/controllers/admin.py` hacia rutas
  internas): cuatro rutas de la API del POS, **con la misma firma que esos controladores** para que el POS solo cambie
  la URL: `POST /api/pos/v1/admin/menu_settings`, `/admin/menu_decorations`, `/admin/mcp_keys` y
  `/admin/payment_gateways`, cuerpo `{action, …mismos parámetros}` y la misma respuesta (incluidos `restaurante`,
  `sede`, `experienceUrl`, `dinerUrl`, `mcpUrl`). Quién: dueño y encargado de la sede (pasarelas: solo el dueño
  escribe), con la organización y la sede de la sesión (`restaurant_id` opcional en el cuerpo, validado con
  `restaurant_for`), nunca del navegador sin validar. Internamente llaman a los mismos servicios que las rutas internas.
- **Cachés:** el motor interno invalida la carta y la marca al escribir en `catalog`/`tenancy` (señales) además del
  tiempo de vida actual.

### Pruebas que deben existir (`# Falla si …`)

Con una organización del sistema propio, de punta a punta por la API pública del comensal: resolver por slug y por
token de mesa, organización suspendida, portada; carta con precio de la sede, agotados y galería; marca y logo;
carrito compartido, confirmar con turno abierto y `restaurant_closed` sin él, cupón y primera compra, pago simulado que
dispara cocina y abona puntos, estado del pedido, llamada y cuenta; anticipo de reserva por token; WhatsApp cotizar y
confirmar; MCP leer y confirmar banners; las rutas de administración del menú con sesión de dueño. Y que Burger House
(en `ODOO_ORGS`) sigue usando el adaptador de Odoo (con el cliente simulado de las pruebas actuales).

## Contrato T6 · Migración de Burger House y conmutación

- **Comando** `manage.py migrate_from_odoo --org burger-house --url … --db … --login … --password …` (app `tenancy`),
  que lee Odoo por JSON-RPC (`/web/session/authenticate` + `/web/dataset/call_kw`, como `adapters/odoo/client.py`) y
  escribe en el sistema propio por dominios, en este orden, **idempotente** (vuelve a correr sin duplicar, casando por
  `legacy_odoo_*_id` o un mapa `LegacyMap(organization, model, odoo_id, local_id)`): organización y marca (de
  `res.company`) y datos del emisor; restaurantes (`pos.config`, con `RestaurantSettings` y horario de reservas);
  cuentas (`res.users` + `hr.employee`: rol, restaurantes, turno; sin contraseña: quedan con invitación pendiente y se
  reenvía a quien tenga correo, salvo `--no-invite`); impuestos y régimen; categorías con estación; proveedores;
  unidades; ingredientes con costo, mínimos y existencias por sede; platos con precio, impuestos, atributos del
  comensal, fotos y galería (bytes de Odoo → WebP), precios y agotados por sede, recetas; pisos, planos, zonas y mesas
  (con el token del registro si existe: se leen los `TableToken` de `registry` por su base o por un archivo exportado);
  métodos de pago; clientes y tarjetas de fidelidad con puntos; cupones, programa de puntos, acciones y banners;
  reservas futuras con anticipo; pedidos históricos pagados con líneas, pagos y cursos (para los informes), turnos de
  caja cerrados con su cuadre; avisos no leídos. No migra: asientos contables, facturas de Odoo, pedidos en borrador.
- **Traducción de ids del comensal:** un segundo paso `--remap-diner` reescribe en `experience_app` los ids de Odoo
  guardados (`CartLine.product_id`, `DinerFavorite`, `DinerFeedback.dish_ratings`, `AgentCartSelection`,
  `PaymentGateway.payment_method_id`, `TableSession.odoo_table_id`) con el `LegacyMap`.
- **Informe:** al final imprime una tabla por dominio (leídos, creados, actualizados, omitidos con motivo).
- **Conmutación:** con la migración verificada, `NEXT_PUBLIC_ODOO_ORGS=` (POS) y `ODOO_ORGS=` (experience) vacíos;
  Odoo y el registro se detienen (`scripts/dev.sh` deja de arrancarlos) pero `odoo/`, `registry/` y las ramas `callKw`
  del POS siguen en el repositorio hasta la revisión del dueño. La retirada es un commit aparte.

## Contrato M · Multitenancy de ProjectApp (después de T6)

Lo que el dueño de ProjectApp pidió el 2026-10-02 para cerrar el plan S sobre el sistema propio: verificación completa de
aislamiento y suspensión, métricas por cliente, cobro de la suscripción y el despliegue preparado (sin aplicarlo).
Rutas de la plataforma bajo `/api/platform/v1` con la cookie `waiter_platform_sid`, como en T0.

### Métricas por cliente

- `GET /metrics?from=&to=` (`admin`, `operator`): `{totals: {organizations, active, trial, suspended, mrr, sales,
  orders, restaurants}, organizations: [{slug, name, status, plan, monthly_price, restaurants, restaurants_limit,
  accounts_active, sales, orders, ticket, last_order_at, last_login_at, overdue_amount}]}`. Ventas como en T2 (con
  impuestos, sin propina, `paid` por `paid_at` en la zona de cada organización); `mrr` = suma de `monthly_price` de las
  activas y en prueba con fecha vigente.
- `GET /organizations/{slug}/metrics?from=&to=`: lo mismo para una, más `daily: [{date, sales, orders}]` y
  `by_restaurant: [{id, name, sales, orders}]`.
- Lecturas por lotes (agregados por organización, no un bucle de consultas).

### Cobro de la suscripción

- **`tenancy.SubscriptionCharge`**: `organization`, `period` (`YYYY-MM`, único por organización), `amount` (el
  `monthly_price` al generarla), `due_date` (día `billing_day` del mes, 5 por omisión, + `grace_days`), `state`
  (`pending` | `paid` | `overdue` | `void`), `paid_at`, `method` (`transferencia` | `nequi` | `efectivo` | `otro`),
  `reference`, `notes`, `recorded_by` (PlatformUser), `created_at`. Las organizaciones en prueba vigente o con precio 0 no
  generan cuenta.
- **Ajustes de cobro** (`tenancy.PlatformSettings`, uno): `billing_day` (5), `grace_days` (10), `suspend_after_days`
  (15 después del vencimiento), `reminder_days` (3 antes del vencimiento).
- **Comandos para cron:** `generate_subscription_charges` (el día 1, idempotente por periodo) y `enforce_subscriptions`
  (a diario): marca `overdue` lo vencido; avisa por correo al dueño `reminder_days` antes del vencimiento y el día que
  vence (una vez por cuenta y aviso); **suspende** la organización `suspend_after_days` después del vencimiento con
  `suspension_reason = 'mora'` y auditoría del sistema. Registrar el pago de una organización suspendida **por mora**
  (y sin otras cuentas vencidas) la reactiva sola; una suspensión manual no se levanta por pagar.
- **API:** `GET /charges?state=&period=` y `GET /organizations/{slug}/charges` (`admin`, `operator`) →
  `{charges: [...] , summary: {pending, overdue, paid_this_month}}`; `POST /organizations/{slug}/charges` (`admin`;
  cuenta manual de un periodo); `POST /charges/{id}/pay` (`admin`, `operator`; `{method, reference, notes, paid_at?}`);
  `POST /charges/{id}/void` (`admin`; `{notes}`); `GET/PATCH /settings/billing` (`admin`). Todo con auditoría.
- **El dueño ve su estado:** `GET /api/pos/v1/subscription` (`owner`) → `{plan, monthly_price, next_due, charges:
  [últimas 6], overdue}`; la consola del dueño muestra un aviso si hay una cuenta vencida y cuántos días faltan para la
  suspensión.

### Aislamiento y suspensión (verificación)

- Una prueba que recorre **todas** las rutas de `/api/pos/v1` registradas (con la lista de patrones de Django) con una
  sesión de la organización A y los ids de recursos de la organización B, y exige `404` (o `403`) y que no aparezcan
  datos de B; lo mismo para las rutas públicas con `?org=` y para el comensal por slug de B con token de A.
- Suspensión: login, sesión vigente, SSE, rutas públicas de fotos y menú del comensal, MCP y WhatsApp de una
  organización suspendida responden `organization_suspended` / «Este restaurante no está disponible»; al reactivar,
  todo vuelve. Cubierto por pruebas.

### Despliegue preparado (lo hace Claude, sin aplicarlo)

`deploy/` con `docker-compose.prod.yml` (PostgreSQL, Redis, experience con Gunicorn, POS y comensal con `next start`),
`Caddyfile` con certificado comodín `*.waiter.projectapp.co` por desafío DNS, `.env.prod.example`, los cron
(`generate_subscription_charges`, `enforce_subscriptions`, `notify_low_stock`, `purge_sales_events`) y
`deploy/README.md` con el DNS comodín, el certificado, el primer despliegue, las copias de seguridad y un ensayo local.

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
  - Las fotos de proveedor no existen en el sistema propio.
- **T2 hecha** (2026-10-02), misma rama.
  - Backend (Codex, `gpt-6-astra`): apps `tables`, `sales`, `kitchen` y `realtime` con el contrato T2: pisos y plano con
    revisión, mesas y llamadas, reparto por zonas, turnos de caja (uno por sede, esperado con pagos, cambio, entradas y
    salidas; cierre con nota obligatoria si hay diferencia y aviso al superar la tolerancia), pedidos con numeración
    DI/TA/DE por día y sede, totales en el servidor, cursos de cocina a dos manos, prepago por rol, pagos idempotentes,
    inventario descontado al cobrar y `pending`/`free`, informes del turno y del periodo, política de roles de la
    organización y SSE. Django: 1302 pruebas (397 nuevas).
  - POS (Claude): clientes `core/{sales,tables,kitchen,realtime}.ts`, el puente `core/salesBridge.ts` y la bifurcación
    con `onCore()` de `session`, `cashRegister`, `orders`, `ordersKit`, `orderCreate`, `kitchen`, `tables`, `floorPlan`,
    `sales`, `ops`, `paymentKit`, `insights`, `business`, `settings`, `rolePermissions`, `bus` (SSE) y
    `notifications`. La carta trae el salón, los métodos de pago y los ajustes reales. Las horas del servidor (Odoo sin
    zona, sistema propio en ISO) se leen con `lib/domain/time.ts`. `tsc` y 608 pruebas.
  - **PostgreSQL en desarrollo:** contenedor `waiter-db` (postgres:16, `127.0.0.1:5433`, base `waiter_core`); los datos
    de desarrollo pasaron de SQLite con `dumpdata`/`loaddata`; `.env.example` lo documenta. Las pruebas siguen en SQLite.
  - **Recorrido en Chromium** (`frisby-74312.localhost:3000`, dueña): el plano del Salón con tres mesas, «Entrar al
    POS» desde la consola, abrir caja con $ 200.000, un pedido en la mesa 1 con nota a cocina, Pedidos lo lista «En
    progreso», Cocina lo recibe en su estación con cronómetro, «Iniciar preparación» y «Listo todo», el salón lo ve
    «Listo para servir» y lo entrega, cobro en efectivo con cambio, Historial y Ventas lo muestran, el cierre bloquea
    «Cerrar caja» sin nota cuando hay diferencia y cierra con ella, y la consola la ve en Cuadres con esperado, contado,
    diferencia y nota. Burger House sigue en Odoo sin cambios.
  - **Decisiones tomadas al integrar:** la vista SSE acepta `Accept: text/event-stream` (DRF respondía 406); `GET
    /settings` devuelve también `cash_tolerance`; el mesero de una comanda viaja como `{id, name}`; cancelar un pedido
    solo vale antes de que cocina empiece (lo empezado se cobra); el cambio sale del `received` del pago en efectivo.
- **T3 hecha** (2026-10-02), misma rama.
  - Backend (Codex): apps `loyalty` (clientes, programa y tarjetas de puntos, canje y abono al cobrar, cupones,
    acciones con premio, banners) y `reservations` (horario, franjas, mesas que apartan, anticipo con enlace público y
    conciliación, pre-pedido), preferencias de avisos y existencias bajas (`notify_low_stock`). Django: 1576 pruebas
    (274 nuevas).
  - POS (Claude): `core/loyalty.ts` y `core/reservations.ts`; reservas, horario, clientes, puntos en el cobro,
    promociones, banners, preferencias de avisos y solicitar ingrediente bifurcan con `onCore()`.
  - **Verificado en Chromium y por la API (Frisby):** cliente nuevo en Consola → Clientes; cupón y programa de puntos
    guardados; banner con destino a un plato; reserva para mañana con anticipo de $ 20.000 y pre-pedido (exige caja
    abierta, como en Odoo), enlace público que no muestra teléfono ni correo, anticipo marcado pagado a mano, sentar;
    preferencias de avisos propias. Las pantallas Reservas y Mesas cargan sin errores.
  - **Decisiones al integrar:** los banners se guardan enviando la lista completa como cuerpo; `PUT /benefits` no lleva
    `restaurant_id`; las preferencias viajan como `{prefs}`; el anticipo público devuelve `amount_in_cents`.
- **T4 hecha** (2026-10-02), misma rama.
  - Backend (Codex): apps `reports` (resumen por sede y rentabilidad con la forma de Odoo) y `billing` (resoluciones de
    numeración, documento de venta con copias de emisor, comprador y resolución, impuestos por tasa y propina fuera de
    la base, proveedor de factura electrónica detrás de una interfaz, con uno simulado que firma un CUFE determinista,
    reintento y contingencia, representación gráfica en HTML imprimible); datos del emisor y marca de la organización.
    Django: 1730 pruebas (154 nuevas).
  - POS (Claude): `core/business.ts`; resumen, rentabilidad, ROI, empresa, marca, impuestos y régimen, facturación y la
    política «cobrar antes de cocina» bifurcan con `onCore()`; todas las secciones de la consola del dueño abren en el
    sistema propio y la portada vuelve a ser el Resumen. El recibo nombra el impuesto real (INC u IVA).
  - **Verificado en Chromium y por la API (Frisby):** datos del emisor (NIT 900123456-7, régimen INC) y marca guardados;
    un pedido pagado con propina de $ 5.000; Resumen, Rentabilidad y Retorno cargan; la revisión del documento sale
    lista; emitir da `SETP-990000000` `issued` con CUFE y repetir devuelve el mismo; el detalle cuadra débito y crédito
    con la propina aparte; la representación gráfica responde.
  - **Decisiones al integrar:** el ROI pide hasta 1000 pedidos por consulta (el máximo del servidor).
  - **Pendiente:** el proveedor real de factura electrónica va en el sprint de integraciones; la nota crédito queda
    definida sin pantalla hasta que exista la devolución.
- **T5 hecha** (2026-10-02), misma rama.
  - Backend (Codex): adaptador interno `experience_app/adapters/core/` con las mismas formas que el de Odoo, elegido
    por organización con `ODOO_ORGS` (por omisión `burger-house` hasta el corte); resolución por `tenancy` y el token
    de la mesa; organización suspendida → `restaurant_unavailable`; pedido del comensal sin caja → `restaurant_closed`;
    pago en línea con el método «Pago en línea» sembrado; WhatsApp y MCP sobre las apps propias; rutas
    `/api/pos/v1/admin/{menu_settings,menu_decorations,mcp_keys,payment_gateways}`. Django: 1774 pruebas (44 nuevas).
  - POS (Claude): plantilla, decoraciones, claves MCP y pasarelas del menú llaman a esas rutas en el sistema propio.
  - **Verificado (Frisby, por la API pública del comensal y en Chromium móvil):** portada «Elige tu restaurante» con las
    dos sedes y la marca roja de Frisby; carta por el token de la mesa 1; sesión, carrito con nota, confirmar (queda
    `pendiente_pago`), pago simulado con tarjeta que deja el pedido `DI-001` pagado con «Pago en línea», un curso en
    cocina y estado `enviado`; llamada al mesero. Burger House sigue sirviéndose desde Odoo.
- **Revisado (T3):** el modal de pago carga en cinco entradas seguidas por la URL. La causa probable del «Cargando pedido…» visto en T2 es el límite de seis conexiones por dominio de HTTP/1.1 con varias conexiones de eventos en vivo abiertas en desarrollo; en producción el proxy sirve HTTP/2 y no aplica. Antes: al entrar por la URL
    (recargar lo resuelve; por investigar, posiblemente el doble montaje de React en modo estricto); «Forzar cierre» no
    existe en el sistema propio; las reservas que apartan mesas, los puntos del cobro y Resumen/Rentabilidad llegan con
    T3 y T4; el menú del comensal sigue en Odoo hasta T5.
