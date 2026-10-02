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

## Estado

- 2026-10-01: decisión tomada y plan escrito. T0 en curso: contrato cerrado, Codex en el backend y Claude en la consola
  de ProjectApp y el transporte del POS.
