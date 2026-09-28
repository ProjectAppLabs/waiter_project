# Plan N · Promociones: cupones, puntos y acciones que dan beneficios

**Estado (2026-09-28): hecho.** N1–N2 por Codex, N3–N5 por Claude.
- Odoo: 133/133 pruebas. Experience: 693. Comensal: 504. POS: 533.
- Verificador de Chromium sin problemas en 22 combinaciones de página y ancho.
- En desarrollo, el addon está en 19.0.2.4.0, la migración 0028 está aplicada y hay una configuración de demostración:
  - cupón `BIENVENIDA10`;
  - opinión → 50 puntos;
  - novedades → ese cupón;
  - pago en línea → 8 %;
  - cuenta → 5 %.
- Al integrar se corrigió un error: la validación de «puntos» heredaba `active_test=False` y aceptaba un programa
  desactivado.

**Qué.** El POS agrupa tres tipos de promoción en «Promociones»: **cupones** (ya existen), **puntos de fidelización** (ya
existen) y **acciones**: lo que el comensal hace en el menú y le da un premio configurable. El premio de una acción enlaza
los otros dos tipos: puede ser **un % de descuento en su próxima compra**, **activarle un cupón** de la pestaña Cupones o
**sumarle puntos** del programa de la pestaña Puntos.

Acciones de esta versión (todas exigen cuenta verificada para ganar el premio):

| Clave | En el menú | Cuándo se gana | Veces |
|---|---|---|---|
| `cuenta` | Crear y verificar la cuenta | al quedar verificada | una por cuenta |
| `opinion` | Dejar su opinión de un pedido | al guardar la opinión de un pedido enviado | una por pedido |
| `novedades` | Suscribirse a las novedades | al activar «Novedades y promociones» | una por cuenta |
| `pago_en_linea` | Pagar su pedido en línea | al aprobarse su primer pago en línea | una por cuenta |

Reglas:

- **Un descuento por compra.** Un cupón escrito reemplaza cualquier descuento por acción (como hoy con el de primera
  compra). Si hay varios descuentos por acción disponibles se usa uno (el de mayor porcentaje); los demás esperan a la
  siguiente compra. Los puntos siempre se suman.
- **Las reseñas de Google no se premian**: Google no permite saber quién dejó una reseña y sus políticas prohíben dar
  incentivos por ellas. Fuera de alcance.
- **Aviso de producción:** la verificación de cuenta es de demostración (cualquier código de 6 dígitos). Antes de producción
  hace falta el envío real del código; mientras tanto los premios se pueden abusar con cuentas falsas. Queda para el
  [sprint de integraciones pendientes](2026-09-28-sprint-integraciones-pendientes.md) (autenticación con WhatsApp).

## Contrato común

### 1. Odoo (addon `projectapp_ops`, versión 19.0.2.4.0)

- Modelo `waiter.benefit.action`: `config_id` (m2o `pos.config`, obligatorio, `ondelete='cascade'`), `action` (selección
  `cuenta|opinion|novedades|pago_en_linea`), `active` (bool, por defecto False), `reward` (selección
  `descuento|cupon|puntos`), `percent` (float), `coupon_id` (m2o `loyalty.program`), `points` (int). Único por
  `(config_id, action)`. Validación: `descuento` → `0 < percent ≤ 100`; `cupon` → `coupon_id` es un cupón del menú
  (`waiter_menu_coupon`) de ese POS; `puntos` → `points ≥ 1` y el POS tiene programa de puntos.
- `pos.config.waiter_benefits_settings(coupon=None, loyalty=None, action=None)` (solo administrador): `action` =
  `{"action", "active", "reward", "percent", "couponId", "points"}` crea o actualiza la acción. La respuesta añade
  `actions`: siempre las 4 en el orden de la tabla, `{"action", "active", "reward", "percent", "couponId", "points"}`; las
  que no existen salen inactivas con `reward: "descuento"`, `percent: 5`, `couponId: null`, `points: 10`.
  - **Compatibilidad:** `cuenta` con premio `descuento` es el descuento de primera compra de siempre. Guardar la acción
    `cuenta` escribe `signup_discount_percent = percent` si está activa y su premio es `descuento`; si no, `0`. Sin registro
    de `cuenta`, la respuesta la deriva de `signup_discount_percent` (activa si > 0).
- `pos.config.waiter_benefit_actions()` (lectura, `check_access('read')`): solo las acciones activas y vigentes, como
  `[{"accion", "premio"}]` con `premio` =
  `{"tipo": "descuento", "porcentaje"}` | `{"tipo": "cupon", "codigo", "nombre", "porcentaje", "minimo"}` |
  `{"tipo": "puntos", "puntos", "programa"}`. Omite un cupón inactivo o fuera de fechas y los puntos sin programa.
- `pos.config.waiter_grant_points(identity, key, points, description)` (solo administrador, el usuario técnico de la
  experiencia): misma identidad que `waiter_diner_benefits` (socio y tarjeta del programa de puntos). Modelo
  `waiter.benefit.grant` (`config_id`, `card_id`, `key` char, `points`, único por `(config_id, key)`). Si la clave ya
  existe no vuelve a sumar (idempotente); si no, crea la concesión, suma `points` a la tarjeta y registra
  `loyalty.history` (`order_model='waiter.benefit.grant'`, `order_id` = la concesión, `issued=points`). Devuelve
  `{"tarjeta", "puntos" (saldo), "otorgados"}`.
- Migración `19.0.2.4.0/post-migrate.py`: crea la acción `cuenta` de cada POS a partir de `signup_discount_percent`.
- Permisos en `ir.model.access.csv` (lectura para usuarios del POS, escritura para administradores).

### 2. Experience

- Modelo `DinerReward`: `account` (FK `DinerAccount`, cascade), `restaurant_slug`, `venue_slug`, `action`, `reference`
  (char 64, `''` o el id del pedido en `opinion`), `reward` (`descuento|cupon|puntos`), `percent` (Decimal 5,2),
  `coupon_code` (char 32), `points` (int), `state` (`disponible|reservado|usado|acreditado|pendiente`), `order` (FK
  `Order`, `SET_NULL`), `created_at`, `used_at`. Único por `(account, restaurant_slug, venue_slug, action, reference)`.
  El premio se copia de la configuración al concederse.
- `services/rewards.py`:
  - `actions(tenant)`: `waiter_benefit_actions` con caché corta (como el catálogo); si Odoo falla, lista vacía.
  - `sync(tenant, account)`: idempotente (la restricción única evita duplicados). Solo cuentas verificadas. Concede
    `cuenta` (si su premio no es `descuento`: ese sigue por el camino de primera compra), `novedades` (si `marketing`),
    `opinion` (cada `DinerFeedback` de los comensales de la cuenta en pedidos de esa sede) y `pago_en_linea` (primer
    `PaymentAttempt` aprobado de esos comensales en la sede). Los de `puntos` llaman a `waiter_grant_points` con clave
    `"{accion}:{cuenta}:{referencia}"` → `acreditado`; si Odoo falla quedan `pendiente` y se reintentan en el siguiente
    `sync`. Se llama desde recompensas, la vista del carrito y la confirmación.
- Confirmación (`services/orders.py`), tras el descuento de primera compra: si quien confirma no tiene cupón ni descuento
  de primera compra en sus líneas nuevas, reserva (CAS `disponible → reservado`, con `order`) su `DinerReward` de
  `descuento` de mayor porcentaje en la sede y lo aplica a **sus** líneas nuevas (`CartLine.discount`). Pasa a `usado` donde
  hoy se marca `discount_used_at` (envío sin prepago, pago del pedido, conciliación del pago en línea). Un reintento
  reutiliza lo reservado.
- Cupón concedido: al reservar líneas con ese `coupon_code` de la cuenta (`benefits.reserve`), el premio pasa a `usado`.
- El `descuento` del carrito y de la cuenta proyecta también el premio por acción cuando no hay cupón ni primera compra,
  con el mismo formato más `"accion"`.
- `GET api/v1/<r>/<s>/recompensas/` añade `beneficios`:
  `[{"id", "accion", "premio", "estado", "fecha"}]` (sin los `pendiente`) y `acciones`: `[{"accion", "premio", "hecha"}]`.
- La plantilla pública (`plantillas/services.py`, donde se arma `descuento`) añade `acciones: [{"accion", "premio"}]` para
  quien aún no tiene cuenta.

### 3. POS

«Configuración → Promociones» (antes «Cupones y puntos») con tres pestañas: **Cupones**, **Puntos** y **Acciones**. En
Acciones, una fila por acción con interruptor, tipo de premio (Descuento % / Cupón / Puntos) y su valor: el cupón se elige
de la lista de la pestaña Cupones (solo activos) y los puntos exigen programa. Guarda con
`waiter_benefits_settings(action=…)`.

### 4. Comensal

- Tipos: `RewardAction = 'cuenta'|'opinion'|'novedades'|'pago_en_linea'`, `RewardPrize`, `EarnedReward`, `template.acciones`.
- «Recompensas»: **Tus beneficios** (lo ganado y disponible: descuento que se aplicará solo, cupón con «Usar en mi pedido»,
  puntos acreditados) y **Gana más** (acciones activas que aún no hizo, con su premio). Sin cuenta, las acciones invitan a
  crearla.
- El banner de recompensas y el relato del registro dicen el premio real de `cuenta` (no «5 % primera compra» fijo).
- Al guardar una opinión con la acción activa, el paso final dice lo que ganó.
- Verificador de Chromium: «Recompensas» con beneficios y acciones simulados (sin escribir), con contraste, maquetación y
  estructura (las dos listas, un premio legible por fila, controles de 44 px).

## Reparto

| Parte | Quién | Archivos |
|---|---|---|
| N1 Odoo: acciones, concesión de puntos, migración, pruebas | Codex | `odoo/addons/projectapp_ops/**` |
| N2 Experience: `DinerReward`, `rewards.sync`, confirmación, vistas, plantilla, pruebas | Codex | `experience/experience_app/**` |
| N3 POS: «Promociones» con tres pestañas, servicio, pruebas | Claude | `pos/components/settings/*`, `pos/lib/services/benefits.ts`, `pos/app/(pos)/configuracion/*`, i18n |
| N4 Comensal: tipos, Recompensas, banner, registro, opinión, pruebas | Claude | `diner/**` |
| N5 Verificador y cierre: Chromium, pruebas de Odoo en Docker, documentación | Claude | `diner/scripts/design-system/*`, `docs/**` |

## Verificación

- Odoo: `scripts/odoo-test.sh projectapp_ops` (acciones, validaciones, compatibilidad con `signup_discount_percent`,
  concesión idempotente de puntos, migración).
- Experience: `pytest` completo; casos nuevos de concesión por acción, un descuento por compra, cupón que reemplaza,
  reintento, puntos pendientes que se reintentan.
- POS y comensal: `jest` completo y `tsc`.
- Chromium: `verificar-borrador.cjs` sin problemas, con «Recompensas» cubierta.
