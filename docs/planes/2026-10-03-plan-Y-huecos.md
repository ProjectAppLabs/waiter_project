# Plan Y · Huecos del producto: exportes, historial de cambios, seguridad de ProjectApp, soporte y nómina

**Fecha:** 2026-10-03 · **Rama:** `feat/03102026-huecos` · **Pedido del dueño:** «llenemos el punto 3 que son los
huecos y hagamos el punto 5 también» (revisión de pendientes del 2026-10-03).

## Y1 · Exportar a CSV ventas al detalle, inventario y clientes

Hoy exportan el resumen, la rentabilidad, los cuadres y las devoluciones. Faltan los datos al detalle que pide el
contador. Se exportan **desde el servidor** (no solo lo que la pantalla tiene cargado), con el mismo formato de los CSV
actuales: separador `;`, coma decimal, UTF-8 con BOM (Excel en Colombia los abre bien).

- `GET /api/pos/v1/exports/<tipo>?from=YYYY-MM-DD&to=YYYY-MM-DD&restaurant_id=N` responde `text/csv` con
  `Content-Disposition: attachment; filename="<tipo>-<desde>-a-<hasta>.csv"`. Sin local: todos los que la cuenta
  puede ver. Tipos:
  - `ventas`: una fila por línea de pedido cobrado o devuelto — fecha y hora, local, pedido, servicio, mesa,
    mesero, cliente, plato, cantidad, precio unitario, descuento, impuesto (nombre y valor), total de la línea,
    métodos de pago del pedido, propina del pedido, devuelto.
  - `pagos`: una fila por pago — fecha, local, pedido, método, valor, recibido, cambio, referencia, cajero.
  - `inventario`: existencias al momento — local, ingrediente, categoría, unidad, cantidad, costo unitario, valor,
    mínimo, estado (bajo, normal).
  - `movimientos`: movimientos de inventario del periodo — fecha, local, ingrediente, tipo, cantidad, unidad, motivo,
    persona.
  - `clientes`: clientes de la organización — nombre, tipo y número de documento, correo, teléfono, puntos, visitas,
    total gastado, última visita, acepta novedades.
- Permisos: el dueño todo; el encargado solo sus locales; los demás roles no. Un periodo de más de 366 días se
  rechaza (`400`). Respeta los módulos (inventario apagado → `403 module_inactive`).
- **Pantallas:** botón «Exportar CSV» en Ventas (ventas y pagos), Inventario (existencias y movimientos) y Clientes de
  la consola del dueño, y en Ventas e Inventario del POS para el encargado.

## Y2 · Historial de cambios de la organización

El dueño ve quién cambió qué y cuándo, sin depender de ProjectApp.

- Modelo `OrganizationAudit` (organización, local opcional, persona o `ProjectApp · <nombre>`, acción, entidad, id,
  resumen en español, antes y después en JSON, cuándo). Se escribe en la misma transacción que el cambio.
- Se registra al menos: crear, editar (precio, nombre, disponibilidad) o borrar platos, ingredientes, categorías y
  recetas; precios por local; ajustes y conteos de inventario; cupones, beneficios y promociones; anular un pedido,
  cancelar platos ya enviados; devoluciones; descuentos manuales; cierres de caja con diferencia; entradas y salidas de
  efectivo; equipo (invitar, cambiar rol o locales, desactivar); permisos por rol, tolerancia de caja, pasarela de
  pago, datos de la empresa y del local; y los cambios de ProjectApp sobre la organización (módulos, plan, precios,
  suspensión, soporte).
- `GET /api/pos/v1/audit?from&to&restaurant_id&account_id&action&q&limit&offset` →
  `{"entries": [{"id", "at", "restaurant": {"id", "name"} | null, "actor": {"kind": "account" | "platform" | "system",
  "id", "name"}, "action", "action_name", "entity", "entity_id", "summary", "before", "after"}], "total"}`.
  `GET /api/pos/v1/audit/actions` → `{"actions": [{"key", "name"}]}` para el filtro. Dueño todo; encargado sus
  locales sin lo de ProjectApp ni el equipo de otros locales.
- `GET /api/pos/v1/exports/historial?from&to&…` en CSV con las mismas columnas.
- **Pantalla:** «Historial de cambios» en la consola del dueño (grupo Organización), con filtros por fecha, local,
  persona, tipo y texto; detalle con antes y después; exportar CSV.

## Y3 · Doble factor para la gente de ProjectApp

Una cuenta de ProjectApp puede suspender y ver a todos los clientes: necesita un segundo factor.

- TOTP (RFC 6238, 6 dígitos, 30 s, ±1 intervalo) con cualquier app de autenticación. Secreto cifrado con la clave de
  Fernet existente. Diez **códigos de respaldo** de un solo uso, guardados con hash y mostrados una sola vez.
- `POST /api/platform/v1/auth/2fa/setup` → `{"secret", "otpauth_uri", "qr": "data:image/svg+xml;base64,…"}` (o PNG);
  `POST auth/2fa/enable {"code"}` → `{"recovery_codes": [...]}`; `POST auth/2fa/disable {"code"}`;
  `GET auth/me` agrega `"two_factor": bool` y `"two_factor_required": bool`.
- **Entrar:** si la cuenta tiene doble factor, `POST auth/login` responde `200 {"two_factor": true, "challenge":
  "<token de 5 minutos>"}` sin sesión; `POST auth/2fa/verify {"challenge", "code"}` (código o de respaldo) crea la
  sesión y responde como el login de siempre. Cinco códigos malos anulan el desafío.
- `PlatformSettings.require_2fa` (por omisión **activo para administradores**): quien debe y no lo tiene entra, pero
  la consola solo le deja abrir «Seguridad» hasta activarlo (el servidor responde `403 two_factor_required` en lo
  demás).
- Un administrador puede **restablecer** el doble factor de otra persona del equipo (queda en la auditoría).
- **Pantallas:** «Seguridad» en la consola de ProjectApp (activar con el QR, códigos de respaldo, desactivar); paso
  «Código de verificación» en el inicio único; «Restablecer doble factor» en Equipo de ProjectApp.

## Y4 · Acceso de soporte con permiso del dueño

ProjectApp puede ver lo que ve el cliente para ayudarle, solo con su permiso y dejando rastro.

- `SupportGrant`: organización, quién lo pidió (ProjectApp), quién lo aprobó (dueño), motivo, desde, hasta (por
  omisión 24 horas, máximo 72), estado (`pedido`, `vigente`, `revocado`, `vencido`).
- **Pedir:** ProjectApp, desde la ficha del cliente: `POST /api/platform/v1/organizations/<slug>/support {"reason",
  "hours"}` → aviso al dueño (notificación y correo). **Dar o aprobar:** el dueño, en su consola, `POST
  /api/pos/v1/support {"hours", "reason"}` (da acceso sin pedido) o `POST /api/pos/v1/support/<id>/approve`;
  `POST support/<id>/revoke` lo quita al instante. `GET /api/pos/v1/support` → `{"grants": [...]}`;
  `GET /api/platform/v1/organizations/<slug>/support` igual.
- **Entrar:** con un acceso vigente, `POST /api/platform/v1/organizations/<slug>/support/enter` → `{"url":
  "https://<org>…/soporte?token=<un solo uso, 2 minutos>"}`. El POS cambia el token por una sesión del POS con el rol de
  dueño, marcada como **soporte** (`Session.support_grant`), que vence con el acceso. Todo lo que haga queda en el
  historial de cambios como «ProjectApp · <nombre> (soporte)». La consola muestra una franja fija «Sesión de soporte
  de ProjectApp · termina a las HH:MM · Salir».
- No puede: cambiar la contraseña del dueño, dar más accesos de soporte, ni ver secretos de pasarelas.
- **Pantallas:** en la ficha del cliente, «Soporte» (pedir, estado, entrar); en la consola del dueño, «Soporte»
  (dar, aprobar, revocar, historial); la franja de sesión de soporte.

## Y5 · Horas y propinas por persona

Base para la nómina, sin liquidarla.

- `Account.hourly_rate` opcional (valor de la hora), editable por el dueño en Equipo.
- `GET /api/pos/v1/reports/team?from&to&restaurant_id` → `{"rows": [{"account": {"id", "name", "role"}, "hours",
  "shifts", "orders", "sales", "tips", "hourly_rate", "estimated_pay"}], "totals": {…}}`. Horas por las asistencias
  (entrada y salida; una abierta cuenta hasta ahora), propinas de los pedidos cobrados atribuidas a quien creó el
  pedido, pago estimado = horas × valor de la hora + propinas. CSV en `exports/equipo`.
- **Pantalla:** «Horas y propinas» en la consola del dueño (grupo Negocio), con periodo, local y exportar CSV.

## Y6 · Limpieza (punto 5 de la revisión)

- Quitar la pantalla vieja `/mesas/[tableId]`, que nada enlaza.
- Quitar los árboles de trabajo viejos de Codex (`waiter_project-codex-a` y `-p`): **hecho** al empezar, sin trabajo
  pendiente en ellos.
- Hacer estable la prueba del cobro en efectivo del modal de pago, que fallaba con la máquina cargada.

## Pruebas que deben existir (`# Falla si …`)

- Falla si un exporte trae datos de otra organización o de un local que el encargado no ve, si omite un pedido del
  periodo o si Excel no lo abre con tildes y decimales correctos.
- Falla si un cambio de precio, un plato borrado, un descuento o una devolución no queda en el historial con quién,
  cuándo, antes y después, o si el encargado ve lo de otros locales.
- Falla si una cuenta con doble factor entra solo con la contraseña, si un código de respaldo sirve dos veces, si un
  desafío vencido o con cinco intentos sirve, o si quien debe tenerlo usa la consola sin activarlo.
- Falla si ProjectApp entra sin acceso vigente o después de revocado o vencido, si el token sirve dos veces, si la
  sesión de soporte sobrevive al acceso, si cambia la contraseña del dueño, o si sus cambios no quedan como soporte.
- Falla si las horas no salen de las asistencias, si las propinas se atribuyen a otra persona o si el pago estimado no
  suma horas por valor más propinas.

## Estado

- 2026-10-03: plan escrito. Y6: árboles viejos quitados.

- **Servidor (Codex) · 2026-10-03: Y1–Y5 implementados en `experience/`.** Sin cambios en `pos/`, `diner/`,
  `deploy/` ni `.env`; sin commits ni servidores levantados.
  - **Y1:** las siete rutas `exports/ventas`, `pagos`, `inventario`, `movimientos`, `clientes`, `historial` y `equipo`
    exportan desde la base, sin el límite de filas de las pantallas: CSV con BOM, `;`, coma decimal y nombre de
    descarga pactado. Filtran organización, locales autorizados, periodo y módulos; neutralizan fórmulas en textos
    destinados a Excel. Las devoluciones salen como filas negativas identificadas con «Devuelto».
  - **Y2:** `OrganizationAudit` conserva identidad, fecha, ámbito, resumen y estados anterior/posterior. Los servicios
    instrumentados y sus señales escriben dentro de la transacción del cambio, incluidas relaciones, recetas,
    operaciones de caja, inventario, descuentos, devoluciones, equipo, configuración y cambios de ProjectApp.
    `audit`, `audit/actions` y su CSV comparten los filtros y el alcance. Los secretos y contraseñas no se guardan
    en el historial; una modificación de credenciales de pasarela conserva únicamente la huella de su versión cifrada.
  - **Y3:** TOTP con `hmac`/`hashlib`, secreto Fernet, QR PNG local, diez respaldos con hash, desafíos de cinco minutos
    con cinco intentos y consumo único. No se crea sesión al entregar el desafío. La obligación predeterminada para
    administradores permite únicamente consultar `auth/me`, salir y configurar el segundo factor. Restablecerlo
    deja auditoría e invalida sesiones y desafíos, incluidos tokens y sesiones de soporte. El inicio único conserva
    la secuencia login del restaurante → login de ProjectApp → verificación del desafío.
  - **Y4:** solicitud con notificación y correo al dueño, concesión/aprobación/revocación, token de entrada de dos
    minutos y un solo uso y `POST /api/pos/v1/auth/support {"token"}` con la respuesta del login y cookie HttpOnly.
    `auth/me` incluye `support: {until, agent}` (`agent` es el nombre de la persona) o `null`. La sesión vence con el
    permiso, no abre asistencia ni cierra la del dueño al salir; la revocación se comprueba en cada petición y en
    eventos SSE. Sus cambios se atribuyen a «ProjectApp · nombre (soporte)». No administra accesos de soporte ni
    solicita/cambia contraseñas; tampoco modifica o concede cuentas de dueño. Las escrituras se serializan con la
    revocación del permiso.
  - **Y5:** tarifa horaria opcional en Equipo, editable solo por el dueño, `reports/team` y CSV. Horas tomadas de
    asistencias y recortadas al periodo; abiertas hasta ahora. Pedidos, ventas sin propina y propinas atribuidos al
    creador del pedido, con cálculos monetarios en `Decimal`.
  - **Decisiones donde el plan no fijaba detalles, para integrar el POS:**
    - Restablecer 2FA: `POST /api/platform/v1/team/<id>/reset_2fa` → `{"ok": true}`; solo otro administrador.
      `auth/me` agrega `two_factor` y `two_factor_required` al nivel raíz. `require_2fa` se consulta/cambia también
      en `settings/billing`; cuando está activo exige 2FA a administradores, y los operadores pueden activarlo
      voluntariamente. Un intervalo TOTP ya utilizado tampoco se puede reutilizar.
    - Crear o pedir soporte devuelve `201 {"grant": {...}}`; aprobar/revocar devuelve `200 {"grant": {...}}`.
      Cada acceso contiene `id`, `reason`, `hours`, `since`, `until`, `state`, `created_at`,
      `requested_by: {id, name} | null` y `approved_by: {id, name} | null`. En estado `pedido`, `since` y `until`
      son `null`; la vigencia empieza al aprobar. El vencimiento se deriva de `until` al consultar y autenticar.
      Una solicitud aprobada autoriza a quien la pidió; una concesión espontánea del dueño autoriza al personal
      activo de ProjectApp. La URL de entrada toma el subdominio de la organización sobre `POS_URL`.
    - Los periodos usan la zona de la organización, con ambos días incluidos, y por omisión el día actual.
      En ventas, «Descuento» es el porcentaje de la línea y los impuestos conservan el nombre y valor históricos.
      Inventario y clientes son instantáneas; en clientes el gasto/visitas del encargado solo suma sus locales y
      solo se listan clientes con pedidos en ellos. El dueño ve todos los clientes, incluido el consumidor final.
      Los cambios globales del historial quedan para el dueño; el encargado ve cambios de sus locales y del equipo
      cuyas asignaciones anteriores y nuevas están íntegramente dentro de su alcance, sin acciones de ProjectApp.
    - `reports/team` y `exports/equipo` son exclusivos del dueño. Horas con cuatro decimales, pago a centavos;
      sin tarifa, `hourly_rate` y `estimated_pay` son `null`. Los totales suman horas, turnos, pedidos, ventas,
      propinas y pagos calculables. Las propinas son las originales de los pedidos cobrados; no se infiere un
      reparto de nómina ni se descuentan devoluciones, que el plan no definió para este informe.
    - Las claves de acciones se entregan en `audit/actions`, con nombres en español; las entidades usan el nombre
      del modelo y los identificadores se serializan como texto. No se agregaron rutas nuevas de descuentos:
      se instrumentó también el servicio existente que aplica descuentos al pedido del comensal.
    - **Desviaciones respecto de las formas de respuesta fijadas por el plan: ninguna.** Las formas anteriores
      concretan únicamente partes no especificadas.
  - **Archivos cambiados:** núcleo nuevo en `tenancy/{audit,audit_api,two_factor,support,apps}.py` y
    `reports/{exports,team}.py`; modelos, autenticación, servicios y serialización de `accounts/`; modelos,
    API, rutas, HTTP, módulos, suscripciones y servicios de `tenancy/`; rutas de `reports/`; instrumentación en
    `catalog/services.py`, `inventory/services.py`, `loyalty/promotions.py`, `sales/{api,services,cash,refunds}.py`,
    `billing/company.py`, `experience_app/adapters/core/pos.py` y `experience_app/services/payment_settings.py`;
    revocación SSE en `realtime/api.py`. Migraciones descriptivas: `accounts/0004`, `accounts/0005` y
    `tenancy/0012`, todas `historial_seguridad_soporte_y_tarifa`, sin índices únicos parciales y con tokens exactos.
    Pruebas nuevas en `tenancy/tests/test_seguridad_y_soporte.py` y
    `reports/tests/test_exportes_historial_equipo.py`; ajustes en las fábricas y las pruebas de aislamiento,
    suscripciones y migración de `tenancy/tests/`.
  - **Ajustes intencionales de pruebas existentes:** la fábrica de cliente de plataforma desactiva la obligación
    de 2FA para los escenarios anteriores de negocio; las pruebas nuevas ejercen el valor predeterminado activo y
    el flujo HTTP real. La respuesta de ajustes incluye `require_2fa`. La prueba de migración de X restaura todas
    las migraciones actuales al terminar, en lugar de dejar el esquema antiguo; la matriz de aislamiento incluye
    las rutas nuevas y recursos de soporte de otra organización.
  - **Verificación final:** suite completa **2099 pruebas aprobadas en 223,30 s** con
    `PYTHON_DOTENV_DISABLED=1 DJANGO_DB_ENGINE=django.db.backends.sqlite3 venv/bin/pytest -q --tb=short` desde
    `experience/`. `manage.py makemigrations --check`: **sin cambios**; `manage.py check`: **sin incidencias**;
    Ruff en los módulos y pruebas nuevos y `git diff --check`: correctos. Validación ejecutada en SQLite, sin
    cargar `.env`, MySQL ni Docker. Las 21 funciones de prueba nuevas (31 casos parametrizados) tienen nombres
    en español y comentario `# Falla si …`.
- **POS y consolas (Claude) · 2026-10-03:** Y1 botones «Exportar CSV» (Ventas y pagos, Inventario y movimientos,
  Clientes) que descargan del servidor; Y2 «Historial de cambios» en la consola del dueño con filtros, detalle antes y
  después y CSV; Y3 paso «Código de verificación» en el inicio único, «Seguridad» (QR, códigos de respaldo,
  desactivar), consola bloqueada en Seguridad mientras falte el doble factor exigido y «Restablecer doble factor» en
  Equipo de ProjectApp; Y4 «Soporte» en la ficha del cliente (pedir, estado, entrar en otra pestaña), «Soporte de
  ProjectApp» en la consola del dueño (dar, aprobar, quitar), `/soporte?token=` y la franja fija de sesión de soporte;
  Y5 «Horas y propinas» (grupo Negocio) y «Valor de la hora» en Equipo. Y6 hecho.
- **Integración · 2026-10-03:** dos ajustes al servidor: un desafío vencido o agotado responde `challenge_expired`
  (antes `invalid_code`, igual que un código mal escrito) para que el inicio vuelva a la contraseña, y el equipo de
  ProjectApp trae `two_factor` para ofrecer el restablecimiento. Las pruebas de punta a punta de ProjectApp entran con
  doble factor real: la primera vez lo activan y guardan el secreto en `pos/e2e/.estado/` (ignorado).
  Verificación: pytest en MySQL 2099, jest del POS 660 y del comensal 508, e2e 24 pasan y 1 omitida por diseño
  (emergencia, que necesita compilación de producción). Casos de QA E-16, D-18 a D-21, P-16 y P-17 publicados.

