# Plan P · Un solo inicio de sesión: usuario o correo y contraseña, con acceso por horario

**Qué.** Cada persona de la organización entra con **su usuario o su correo y su contraseña**. El sistema ya sabe su
rol y su restaurante, y la manda a su lugar:
- **dueño** → consola de la organización;
- **encargado** → su restaurante, o elige entre los suyos;
- **mesero o cajero** → su restaurante.

**Desaparecen:**
- el inicio del terminal con una cuenta compartida;
- el selector de restaurante;
- la lista de empleados;
- el PIN.

Decisiones del dueño (2026-10-01):
- **Contraseña normal en vez de PIN.** El PIN de 6 dígitos coincidía entre personas y no dejaba trazabilidad.
- **Usuario único en toda la organización.** Se entra con «usuario o correo». El correo sirve para la invitación y
  para recuperar el acceso.
- **El dueño da de alta a cada persona desde la consola (Equipo):** nombre, usuario, correo, rol, restaurante y turno.
  Le llega un código por correo, pone su contraseña y puede cambiarla después.
- **Acceso por horario.** Meseros y cajeros solo entran durante su turno, con margen configurable. Un intento fuera de
  horario se rechaza y avisa al encargado y al dueño. Al terminar el turno la sesión se cierra. Dueño y encargado no
  tienen restricción horaria.
- **No se limita a dispositivos del local:** con el horario basta.
- **Tablets compartidas:** se cambia de persona con «Cerrar sesión» y se cierra sola tras un tiempo de inactividad.
- **Trazabilidad:** cada acción ya va firmada por la persona (pedidos, cobros, entregas, plano); con usuario propio no
  hay ambigüedad.

## Contrato común

### Odoo (`projectapp_ops`, versión 19.0.2.6.0)

1. **Una cuenta por persona.** Cada persona es un `res.users` con su `hr.employee` vinculado (`employee.user_id`).
   - `res.users.login` **es el usuario**: minúsculas, letras, números y puntos, 3 a 32 caracteres, único en la base
     (que es la organización).
   - `res.users.email` es el correo.
   - Rol (`waiter_role`) y restaurantes (`waiter_config_ids`) se mantienen iguales en la cuenta y en su empleado.
2. **Entrar con usuario o correo.** Al autenticar se acepta el usuario o el correo, sin distinguir mayúsculas y por
   coincidencia exacta. Lo mismo vale para pedir código (`/waiter/auth/request_code`) y para activar
   (`/waiter/auth/activate`). El usuario puede llevar puntos; `_find_user` admite el correo.
3. **Acceso por horario** para `waiter` y `cashier`.
   - **Ventana:**
     - el turno del empleado, `shift_start` y `shift_end` en horas decimales y hora local de la empresa;
     - un margen `pos.config.waiter_access_margin_minutes` (entero, por defecto 30) del restaurante del empleado;
     - si el turno cruza la medianoche, la ventana también.
   - **Sin turno definido** no hay restricción (para no dejar a nadie fuera por omisión).
   - **Fuera de la ventana:** la autenticación se rechaza (`AccessDenied`) con un mensaje claro. Además se crea un
     `waiter.notification` de tipo `access` para el encargado y el dueño, con el restaurante del empleado: «Mateo
     intentó entrar a las 23:40, fuera de su turno (14:00–22:00)».
   - Esto vale para cualquier vía de autenticación, no solo la del POS.
4. **Identidad del turno sin PIN.** `hr.employee.waiter_start_my_shift(config_id=None)`, para el usuario conectado:
   - **Qué hace:** toma su empleado, comprueba la ventana, abre su asistencia y emite el token de sesión de siempre.
   - **Respuesta:** `{"ok": True, "employee": {...}, "attendance_id", "token", "session_ends": "<ISO o null>",
     "config_ids": [...]}`, con el mismo formato que `waiter_check_pin`.
   - **Caducidad del token:** el fin de la ventana para meseros y cajeros, o las horas de siempre para dueño y
     encargado.
   - **Errores:** sin empleado vinculado, `{"ok": False, "reason": "no_employee"}`; fuera de horario,
     `{"ok": False, "reason": "outside_hours", "window": "14:00–22:00"}`.
   - Todo lo que hoy autoriza con `employee_id` y token (`authorize`, `waiter_pos_identity`) sigue funcionando.
5. **Alta e invitación desde la consola.** `hr.employee.waiter_invite_person(values)`:
   - **Quién:** el dueño; el encargado, solo para sus restaurantes y sin dar el rol de dueño.
   - **Valores:** `{"name", "username", "email", "role", "config_ids", "shift_start", "shift_end"}`.
   - **Qué hace:** crea el `res.users` y el `hr.employee` vinculados y envía el código por correo
     (`send_waiter_invite`). Devuelve `{"employee_id", "user_id"}`.
   - **Validaciones:** usuario y correo únicos; mesero y cajero con exactamente un restaurante.
   - `hr.employee.waiter_update_person(employee_id, values)` cambia rol, restaurantes, turno o correo.
   - `waiter_resend_invite(employee_id)` reenvía el código; sirve también para restablecer la contraseña.
   - `waiter_deactivate_person(employee_id)` archiva la cuenta y el empleado y conserva su historial.
6. **Migración 19.0.2.6.0.** Cada empleado sin cuenta recibe un `res.users` vinculado:
   - el usuario sale de su nombre (`sofia.mesera`, con sufijo si se repite);
   - el correo es `work_email`, si lo tiene;
   - rol y restaurantes, los del empleado.
   - **Contraseña** (solo con `DINER_DEMO_ENABLED`, nunca en producción): `waiter-demo-2026`. En producción la cuenta
     queda pendiente de activar por código.
   - El empleado «Administrator» se vincula a `admin`.
   - El PIN se conserva en la base, pero el POS deja de usarlo.

### POS

1. **Inicio de sesión.** «Usuario o correo» + «Contraseña», con «¿Olvidaste tu contraseña?» y «Tengo un código».
   Después de autenticar:
   - se llama a `waiter_start_my_shift`;
   - el empleado se guarda como hoy;
   - y se lleva a la persona a su sitio (dueño → `/organizacion`; encargado con varios restaurantes → elige; el resto →
     su inicio por rol, en su restaurante).
   - Fuera de horario se muestra el motivo y la ventana.
2. **Se retiran:**
   - el inicio de empleado con lista y PIN;
   - el selector de restaurante para quien tiene uno solo;
   - la entrada a la consola desde el PIN.

   El restaurante del dispositivo es el de la persona que entra. Si es encargado de varios, el último que eligió.
3. **Sesión.**
   - «Cerrar sesión» cierra el turno (`waiter_end_shift`) y la sesión de Odoo.
   - Se cierra sola tras inactividad (por defecto 15 minutos en pantallas de operación) y al llegar `session_ends`.
   - Un aviso 5 minutos antes.
4. **Consola → Equipo.**
   - Alta de persona (nombre, usuario sugerido desde el nombre, correo, rol, restaurante, turno).
   - Editar rol, restaurante, turno o correo.
   - Reenviar invitación o restablecer la contraseña.
   - Desactivar.
   - La lista muestra el estado: activa o invitación pendiente.
5. **Avisos de acceso.** Las notificaciones de tipo `access` salen en la campana del encargado y del dueño, y en
   «Para atender ahora» del inicio.

## Reparto

| Parte | Quién | Archivos |
|---|---|---|
| P1 Odoo: cuentas, usuario o correo, horario y alertas, `waiter_start_my_shift`, alta e invitación, migración, pruebas | Codex | `odoo/addons/projectapp_ops/**`, `projectapp_notify/**` |
| P2 POS: inicio de sesión, ruteo, sesión e inactividad, consola Equipo, avisos | Claude | `pos/**` |
| P3 Verificación: pruebas de Odoo en Docker, recorrido en Chromium (dueño, encargado, mesero dentro y fuera de turno) | Claude | — |

## Verificación

- Odoo:
  - `scripts/odoo-test.sh projectapp_ops,projectapp_notify` sobre una copia con dos restaurantes;
  - pruebas nuevas: entrar con usuario y con correo, rechazo y alerta fuera de turno, turno que cruza medianoche, alta
    e invitación con sus validaciones, el encargado limitado a sus restaurantes, la migración.
- POS: `tsc` y `jest`.
- Chromium:
  - el dueño entra y llega a su consola;
  - da de alta a una persona;
  - la persona entra con su usuario y llega a su restaurante;
  - un mesero fuera de turno es rechazado y el dueño ve la alerta.

## Estado (2026-10-01)

- **P1, P2 y P3 hechos** en la rama `feat/01102026-plan-p-inicio-de-sesion`. Odoo: 212/212 pruebas. POS: `tsc` y
  565 pruebas de `jest`.
- **Recorrido en Chromium:**
  - el dueño entra con su usuario y llega a la consola;
  - da de alta a una persona;
  - esa persona, fuera de su turno, es rechazada con su horario;
  - la mesera entra con su usuario y va a Caja;
  - la encargada entra con su correo y ve el aviso arriba en «Para atender ahora»;
  - el dueño lo ve en la campana del restaurante.
- **Base de desarrollo migrada** con `projectapp.demo_mode = 'true'`:
  - `sofia.mesera`, `carlos.cajero`, `laura.encargada` y `mateo.mesero`, con contraseña `waiter-demo-2026`;
  - el dueño sigue con `admin`/`admin`.
- **Hallazgos durante la verificación:**
  - en Odoo 19 una ruta `auth="none"` es de solo lectura por omisión, y «Enviar código» fallaba en silencio (corregido);
  - sin servidor de correo, el alta queda creada con la invitación pendiente;
  - el encargado veía también los avisos de otras personas.
- **Pendiente:** las pruebas e2e de Playwright (`pos/e2e`) siguen con el PIN y la cuenta del terminal. Ya estaban
  desactualizadas (usan una cuenta `sofia` que no existe) y aquí no hay navegadores de Playwright instalados, así que
  se rehacen aparte.
