# projectapp_ops

Addon **sin interfaz** para el backoffice propio (`pos/`): `pos.order.waiter_origin`
(mesero / comensal / IA), umbrales de alerta y supuestos del ROI en `pos.config`
(llegan al cliente por `load_data`), marca del restaurante en `res.company`, origen de
la imagen y atributos para el comensal en `product.template`, descuento de primera compra en
`pos.config`, la pasarela `/waiter/admin/menu_settings` hacia `experience/` y, desde el Plan I, todo lo
que el kit CloudPos necesita y Community no guarda (sección «Kit CloudPos»). Instalación:
`-i projectapp_ops`. Depende de `pos_restaurant`, `pos_self_order`, `pos_hr`, `hr_attendance`, `pos_loyalty`.

## Kit CloudPos (Plan I)

Todo se lee por `pos.session.load_data` (añadido en `_load_pos_data_fields`) o por RPC (`callKw`). Ninguno
tiene vista. Al actualizar un Odoo ya instalado: `-u projectapp_ops` y luego **una vez**
`odoo/provisioning/seed-kit.sh` (la siembra corre sola solo al instalar, en el `post_init_hook`).

### `pos.order`

| Campo | Tipo | Qué |
|---|---|---|
| `baby_chair` | Boolean | silla de bebé (Dine In del kit) |
| `waiter_billing` | Boolean, indexado | «Waiting for Payment»: el mesero pidió la cuenta; compartido entre tablets |
| `waiter_prefix` | Char computed store | `DI` (`preset_id.service_at = table` o sin preset), `TA` (`counter`), `DE` (`delivery`) |
| `waiter_number` | Char, readonly | `<prefijo><NNN>`: `DI001`, `DI002`, `TA001`… secuencia del día por sede (`pos.config`) y prefijo; se asigna en `create` (bloqueo `FOR UPDATE` del `pos.config`) |
| `delivery_address`, `delivery_phone` | Char | entrega (preset Delivery, identificación por dirección) |

| Método | Firma | Devuelve |
|---|---|---|
| Esperando pago | `pos.order.set_waiter_billing(order_id, value)` (`@api.model`) | `True` |
| Mover de mesa | `pos.order.waiter_move_table(order_id, table_id)` (`@api.model`) | `True`; `UserError` si la mesa destino tiene un pedido `draft` |

### Salón y producto

| Campo | Modelo | Tipo |
|---|---|---|
| `floor_type` | `restaurant.floor` | Selection `indoor` / `outdoor`, default `indoor` |
| `rotation` | `restaurant.table` | Integer 0 / 90 / 180 / 270 (constraint) |
| `available_from` | `product.template` | Datetime (UTC): hora de reposición cuando el plato está agotado |

### `res.users.waiter_notify`

Char con un objeto JSON de seis booleanos, todos `true` al crear el usuario:
`kitchen_popup`, `kitchen_sound`, `inventory_popup`, `inventory_sound`, `system_popup`, `system_sound`.
Viaja en `load_data` (`res.users`) y es legible/escribible por el propio usuario.

| Método | Firma | Devuelve |
|---|---|---|
| Leer | `res.users.get_waiter_notify()` sobre `[uid]` | dict con las seis claves |
| Guardar | `res.users.set_waiter_notify(notify)` sobre `[uid]`; `notify` es dict o cadena JSON, parcial | dict resultante (lo que falta conserva su valor) |

### `hr.employee` (empleados del kit; los meseros no tienen usuario de Odoo)

| Campo | Tipo | Qué |
|---|---|---|
| `waiter_role` | Selection `waiter` / `cashier` / `admin`, default `waiter` | rol operativo (Plan I, Identidad) |
| `employee_code` | Char, readonly | `WT-0001`, `WT-0002`… (secuencia `waiter.employee.code`, asignada en `create`) |
| `joining_date` | Date | fecha de ingreso |
| `shift_start`, `shift_end` | Float (horas, 8.5 = 08:30), opcional | turno |
| `employment_status` | Selection `full_time` / `part_time` / `contract` | vinculación |
| `pin` | Char (de `hr`) | PIN de 6 dígitos; **nunca viaja al cliente en claro** |
| `waiter_pin_attempts`, `waiter_pin_locked_until` | Integer, Datetime | bloqueo: 5 fallos seguidos → 10 minutos |

Los seis primeros viajan en `load_data` (`hr.employee`, requiere `pos.config.module_pos_hr = True`; la siembra
lo enciende en el `pos.config` demo). Todos los métodos son `@api.model` y exigen `point_of_sale.group_pos_user`
(el usuario del terminal); por dentro usan `sudo` para leer el PIN y escribir la asistencia.

| Método | Firma | Devuelve |
|---|---|---|
| Validar PIN | `hr.employee.waiter_check_pin(employee_id, pin)` | `{ok: true, employee: {id, name, waiter_role, employee_code, joining_date, shift_start, shift_end, employment_status, work_email, job_title, user_id}, attendance_id}` o `{ok: false, reason: 'wrong', attempts_left}` / `{ok: false, reason: 'locked', locked_until}` / `{ok: false, reason: 'unknown'}`. Al validar abre (o reutiliza) la asistencia `hr.attendance` sin `check_out` |
| Cambiar PIN | `hr.employee.waiter_change_pin(employee_id, new_pin)` | `True`; `UserError` si no son exactamente 6 dígitos ASCII |
| Olvidé mi PIN | `hr.employee.waiter_forgot_pin(email)` | siempre `True`. Si el correo coincide con `work_email`, genera un PIN nuevo y lo envía por `mail.mail` (máximo uno por minuto); nunca revela si el correo existe |
| Cerrar turno («Log Out») | `hr.employee.waiter_end_shift(employee_id)` | `{ok, attendance_id, worked_hours}`; `ok: false` si no había asistencia abierta |

### Siembra (`waiter.seed.seed_kit()`)

Idempotente; corre en el `post_init_hook` y con `odoo/provisioning/seed-kit.sh [db] [proyecto-compose]`:

- Presets **Dine In** (`service_at = table`), **Takeout** (`counter`, identificación por nombre) y **Delivery**
  (`delivery`, identificación por dirección); se crean si faltan (o se corrige su `service_at`, porque los presets
  maestros de `pos_restaurant` nacen con `counter`), y se activan en el `pos.config` demo (`use_presets`,
  `available_preset_ids`, `default_preset_id` = Dine In si no había).
- Programa de fidelización **«Puntos Waiter»** (`loyalty.program` tipo `loyalty`, aplica en el pedido actual y
  futuros): regla `money` con `reward_point_amount = 0.001` (1 punto por 1.000 COP, mínimo 1.000 COP) y recompensa
  `discount` `per_point` de 10 COP por punto con `required_points = 100` (100 puntos = 1.000 COP).
- Empleados demo **Sofía Mesera** (PIN `123456`, `waiter`, `sofia.mesera@example.com`), **Laura Encargada** (PIN
  `112233`, `admin`, `laura.encargada@example.com`) y **Carlos Cajero** (PIN
  `654321`, `cashier`, `carlos.cajero@example.com`), en `basic_employee_ids` del `pos.config` demo con
  `module_pos_hr = True`. Ojo: con `basic_employee_ids` no vacío, `pos_hr` solo carga en el POS a esos
  empleados (más los de `advanced_employee_ids` / `minimal_employee_ids` y el ligado al usuario del terminal).

Pruebas del kit: `tests/test_kit.py` (`-u projectapp_ops --test-enable --test-tags /projectapp_ops`).

## Roles (`res.users.waiter_role`)

| Rol | Pantallas en `pos/` | Grupos de Odoo |
|---|---|---|
| `waiter` | salón, pedido, cocina, en vivo, clientes | POS usuario |
| `cashier` | + caja, ventas, facturación | + facturación |
| `admin` | todo + forzar cierre de caja | POS administrador, productos, inventario, facturación |

Al crear o cambiar el rol, el addon reasigna los grupos. Los usuarios se crean
desde Configuración → Usuarios. Demo: `sofia` (mesero) y `julian` (cajero),
clave `Waiter-2026`. Desde el Plan I el rol operativo de un mesero es `hr.employee.waiter_role`
(los meseros no tienen usuario); `res.users.waiter_role` sigue mandando sobre los grupos del terminal y del
administrador.

## Marca del restaurante (`res.company.brand_*`)

Lo que el comensal ve en `diner/` (sistema de diseño §06), editado por
administradores desde el POS y leído por `experience/` (caché de ≤ 1 minuto).
**Campo vacío ⇒ se usa el valor del registro de ProjectApp** (onboarding); todos
nacen vacíos. El nombre del restaurante es `res.company.name`.

| Campo | Tipo | Regla |
|---|---|---|
| `brand_color` | Char(7) | `#RRGGBB` o vacío (constraint). El texto encima se calcula en `experience/` (contraste ≥ 4.5). |
| `brand_font` | Selection | Una de las seis: Instrument Serif, Playfair Display, Fraunces, DM Serif Display, Lora, Cormorant Garamond. |
| `brand_radius` | Selection | `'4'` recto · `'14'` suave · `'24'` muy redondeado. |
| `brand_tagline` | Char(60) | Lema bajo el nombre. |
| `brand_greeting` | Char(40) | Saludo ("Buenas noches"). |
| `brand_waiter_name` | Char(40) | Nombre del mesero IA. |
| `brand_welcome` | Char(140) | Texto de bienvenida. |
| `brand_logo` | Binary (attachment) | PNG, JPEG o GIF de **hasta 2 MB** (constraint; el sniff decodifica solo los primeros bytes). **Nunca SVG.** |

- **Escritura: el POS llama `write_brand`, nunca `write`.** `res.company.write` exige
  `base.group_erp_manager`, que el rol `admin` del POS no tiene (y no se le da: abriría
  el resto de Odoo). `write_brand` exige `point_of_sale.group_pos_manager` (si no,
  `AccessError` "Solo un administrador puede cambiar la marca"), acepta SOLO las claves
  `brand_*` de la tabla (otra clave ⇒ `ValidationError`), recorta los textos (vacío ⇒
  `False` = "usa el registro"), valida el color `#RRGGBB` (y lo pone en mayúsculas), la
  fuente y el radio, y escribe con `sudo()` sobre la compañía del usuario:

  ```js
  await callKw('res.company', 'write_brand', [{ brand_color: '#7A2E2A', brand_tagline: 'Cocina de barrio', brand_logo: false }])
  ```

- ¿Hay logo sin descargarlo? `search_read` con `context={'bin_size': True}` devuelve el tamaño en vez del base64.
- `write_date` de la compañía versiona la URL pública del logo (`/api/v1/<rest>/<sede>/logo/?v=YYYYMMDDhhmmss`).
- Actualizar en un Odoo ya instalado: `-u projectapp_ops` (agrega las columnas; no hay datos ni vistas).
- Tests: `tests/test_company_brand.py` corre dentro de Odoo (`--test-enable --test-tags /projectapp_ops`); la lógica
  pura también se prueba sin Odoo en `experience/experience_app/tests/addon/`.

## Origen de la imagen (`product.template.image_origin`)

Trazabilidad de las fotos de la carta (`docs/diseno/2026-09-05-imagenes-menu.md`, «Trazabilidad»
y «Límite legal»): `'real'` foto real · `'ai'` generada con IA · `'placeholder'` sin foto.
**Sin default**: una plantilla sin marcar no afirma nada sobre su foto. Se escribe por RPC (la
herramienta que genera las imágenes lo marca al cargarlas) y viaja en `pos.session.load_data`
junto a los demás campos de `product.template`, así que lo ven el POS y `experience/`.

- `experience/` lo traduce a `fotoOrigen` (`'real'` · `'ia'` · `'placeholder'` · `null`) en cada
  plato y enciende `imagenesDeReferencia` en la carta cuando algún plato con foto está marcado
  `'ai'`; la app del comensal muestra entonces «Imágenes de referencia: la porción servida puede variar».
- Límite legal: una imagen generada no representa la porción servida. Marcar el origen no es
  opcional cuando la foto es generada.
- Actualizar en un Odoo ya instalado: `-u projectapp_ops` (agrega la columna; no hay datos ni vistas).

## Descuento de primera compra (`pos.config.signup_discount_percent`)

Plan H. `Float`, por defecto `5.0`; `0` lo apaga. Viaja en `pos.session.load_data` (añadido en
`_load_pos_data_fields`, `models/config.py`), así que `experience/` lo lee con la carta y lo aplica
**de verdad** al confirmar: las líneas del comensal con cuenta verificada llegan a Odoo con
`pos.order.line.discount = <porcentaje>`, una sola vez por cuenta (reserva atómica en `DinerAccount.discount_order` antes de RPC,
marca final en `discount_used_at`). El addon corrige `_compute_line_subtotals` para que
`price_subtotal` y `price_subtotal_incl` incluyan el descuento, como `amount_total`.
Depende explícitamente de `pos_self_order`; actualizar y reiniciar Odoo al desplegar.
Si el campo no existe aún (`-u projectapp_ops` pendiente) `experience/` asume el 5 % del diseño.

## Atributos por plato (`product.template.diner_attributes`)

Plan H, Contrato 2. `Text` con un objeto JSON, sin vistas, editable por RPC (el POS lo editará en
Catálogo en un plan posterior):

```json
{"piezas": 8, "picante": 2, "etiquetas": ["popular"], "alergenos": ["maní"], "abv": 5.2, "ibu": 40,
 "tamanos": [{"nombre": "Copa", "precio": 18000}], "soloHoy": true}
```

Viaja en `load_data` junto a `image_origin`; `experience/` lo parsea con tolerancia (lo que no sea un
objeto JSON válido sale como `{}`) y lo expone en cada plato como `atributos`. Una plantilla del
comensal pinta el atributo si existe y lo omite si no; nunca inventa datos.

## Pasarela de decoraciones del menú (`/waiter/admin/menu_decorations`)

Plan K4. Misma autorización que la plantilla (`point_of_sale.group_pos_manager`) y la sede sale de los parámetros de
Odoo, nunca del navegador. `list` devuelve `{decoraciones, fabrica, limites, experienceUrl}`; `add {nombre, imagen}`
sube un PNG o WebP (base64 o data URL; 300 KB, 1024 px de lado, 30 por sede) a
`/internal/v1/<rest>/<sede>/decoraciones/` de experience; `remove {decoracion_id}` lo borra. Las imágenes las sirve
experience por id; el POS solo muestra miniaturas.

## Pasarela de la plantilla del menú (`/waiter/admin/menu_settings`)

Plan H. Controller JSON-RPC (`controllers/admin.py`), `auth='user'`, solo
`point_of_sale.group_pos_manager` (los demás reciben `AccessError`). Reenvía a
`GET/PUT /internal/v1/<rest>/<sede>/menu/` de `experience/` con `X-Internal-Key`, `requests` y
10 s de espera (190 s solo para `verify`); los errores de red y los rechazos de `experience/` llegan al POS como `UserError`
en español. Así el navegador nunca conoce la clave interna.

| Acción | Cuerpo (`params`) | Respuesta |
|---|---|---|
| `get` | — | `{restaurante, sede, experienceUrl, dinerUrl, ajustes: {plantilla, paleta, tipografia, actualizado, porDefecto}}` |
| `set` | `{plantilla: "S1", paleta: {acento: "#…"}, tipografia: {display: "Fraunces"}}` o `{plantilla: "S1", tema: {...}}`; `borrador` opcional | `{plantilla: <la resuelta que verá el comensal>}` |
| `preview` | Los mismos ajustes de `set`, sin `borrador` | `{borrador, caduca, url, url_design_system, vista_previa}` |
| `verify` | `{borrador: "<UUID público>"}` | `{borrador, estado, ok, problemas, siguiente, ...}` |

`preview` envía POST a `menu/borradores/`; `verify` envía POST a
`menu/borradores/<token>/verificar/`. La sede siempre sale de los parámetros de Odoo; `verify` rechaza tokens que no
sean UUID antes de construir la ruta. Ambos necesitan el mismo permiso de administrador que `set`.

En experience, `DESIGN_VERIFIER_REQUIRED=true` por defecto exige un borrador verificado para cualquier cambio de
`tema.componentes` por PUT, incluido volver a fábrica. Flujo: `preview` → `verify` → `set` con los mismos ajustes y
`borrador`. Debe pertenecer a la sede, no haber caducado ni haberse aplicado, tener la última verificación `ok: true`
y contener exactamente el tema que se guarda. Guardar consume el borrador de forma atómica; los rechazos llegan como
`UserError`. Sin cambios en componentes no hace falta token. `false` conserva el PUT anterior sin este requisito.

El paquete A mantiene la verificación síncrona: 190 s en esta pasarela y 200 s en `gateway('verify', {borrador})` del
POS, para cubrir `DESIGN_VERIFIER_TIMEOUT=180` de experience. Si se aumenta ese límite, se deben ajustar ambos márgenes.
El editor del POS todavía no edita plantillas; el servicio ya reenvía `MenuSettings.borrador` al guardar. No hay UI nueva
ni ejecución en segundo plano (paquete E pendiente).

Parámetros del sistema (`ir.config_parameter`) que debe sembrar el onboarding:

| Clave | Valor |
|---|---|
| `projectapp.experience_url` | URL base de `experience/` (dev: `http://192.168.56.10:8001`) |
| `projectapp.experience_internal_key` | el `EXPERIENCE_INTERNAL_KEY` de `experience/.env` |
| `projectapp.restaurant_slug` | slug del restaurante en el registro (demo: `burger-house`) |
| `projectapp.venue_slug` | slug de la sede (demo: `poblado`) |
| `projectapp.diner_url` | URL pública de la app del comensal (dev: `http://192.168.56.10:3001`), para la vista previa por iframe |

En dev: `EXPERIENCE_INTERNAL_KEY=… odoo/provisioning/seed-menu-params.sh` (usa `odoo shell` en el
compose). A mano, desde `odoo shell -d projectapp`:

```python
icp = env['ir.config_parameter'].sudo()
icp.set_param('projectapp.experience_url', 'http://192.168.56.10:8001')
icp.set_param('projectapp.experience_internal_key', '<EXPERIENCE_INTERNAL_KEY>')
icp.set_param('projectapp.restaurant_slug', 'burger-house')
icp.set_param('projectapp.venue_slug', 'poblado')
icp.set_param('projectapp.diner_url', 'http://192.168.56.10:3001')
env.cr.commit()
```

- Actualizar en un Odoo ya instalado: `-u projectapp_ops` (agrega las dos columnas; no hay datos ni vistas).
- Tests del addon (`tests/test_menu_settings.py`, `tests/test_kit.py`): `-u projectapp_ops --test-enable` en una base de prueba.

## Invitaciones y códigos

`send_waiter_invite()` genera un código de 6 dígitos (hash en `waiter_invite_code`,
vence a las 48 h) y lo envía por `mail.mail` desde `mail.default.from`.
Endpoints públicos (`controllers/auth.py`): `POST /waiter/auth/request_code`
y `POST /waiter/auth/activate` (JSON-RPC, sin sesión). El correo saliente se
configura con `odoo/provisioning/configure-mail.sh` desde `compose/.env`.
