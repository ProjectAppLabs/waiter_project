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
