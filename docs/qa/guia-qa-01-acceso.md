# Guía QA Waiter — 1. Acceso e identidad

**Aplica a:** todos los roles. **Organizaciones:** Burger House y Frisby.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que cada persona entra con su usuario o correo y su contraseña, llega a la pantalla que le corresponde, recupera la contraseña con un código de un solo uso, y que el sistema respeta el horario del turno, la sesión única y el cierre automático.

## 2. Preparación

Tenga a mano los usuarios de la Guía 0. Para los casos de código por correo, pida al equipo de ProjectApp que le entregue el código que generó el sistema (en desarrollo los correos se guardan como archivos). Para A-08 use `mateo.mesero`, que tiene turno definido.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| A-01 | Entrar con usuario y con correo | Cualquier rol |
| A-02 | Cada rol llega a su pantalla de inicio | Dueño, encargado, cajero, mesero |
| A-03 | Credenciales incorrectas | Cualquier rol |
| A-04 | ¿Olvidaste tu contraseña? con código de un solo uso | Cualquier rol |
| A-05 | Código vencido, equivocado o reutilizado | Cualquier rol |
| A-06 | Activar una cuenta invitada | Persona nueva invitada por el dueño |
| A-07 | Encargada con varios restaurantes elige sede | Encargado |
| A-08 | Acceso fuera del horario del turno | Mesero con turno; el dueño ve el aviso |
| A-09 | Una sola sesión por persona y cambio de contraseña | Cualquier rol |
| A-10 | Cierre por inactividad y por fin de turno | Mesero o cajero |

## 4. Paso a paso

### A-01 — Entrar con usuario y con correo

**Objetivo:** una sola forma de entrar, sin PIN, que acepta usuario o correo sin distinguir mayúsculas.
**Quién:** cualquier rol (use `sofia.mesera`).

1. Abra `/login`. Compruebe que solo hay «Usuario o correo», «Contraseña», «Recordarme» y «¿Olvidaste tu contraseña?». No debe existir una opción «Tengo un código» ni un teclado de PIN.
2. Entre con `sofia.mesera` y su contraseña. Cierre sesión.
3. Entre con el correo de Sofía escrito con mayúsculas en alguna letra.
4. Marque «Recordarme», cierre sesión y vuelva a `/login`.

**Resultado esperado:** entra en los tres intentos; con «Recordarme» el campo vuelve relleno. El botón del ojo muestra u oculta la contraseña.

### A-02 — Cada rol llega a su pantalla de inicio

**Objetivo:** el inicio depende del rol y de si la caja está abierta.
**Quién:** los cuatro roles, uno tras otro.

1. Entre como `admin` (dueño): debe llegar a la consola `/organizacion`.
2. Entre como `laura.encargada`: con la caja cerrada debe llegar a `/dashboard` (Inicio) y poder moverse por Mesas, Inventario, Reservas, Historial y Administración sin abrir caja.
3. Entre como `sofia.mesera` con la caja cerrada: debe llegar a `/caja` y no poder ir a `/salon` escribiendo la dirección (vuelve a `/caja`).
4. Entre como `carlos.cajero` con la caja cerrada: igual que la mesera.
5. Con la caja abierta (la abre la encargada en E-01), repita: la mesera llega a Mesas y el cajero a Pedidos.

**Resultado esperado:** cada rol aterriza donde dice la tabla; escribir una ruta que no le toca lo devuelve a su inicio, sin pantalla de error.

### A-03 — Credenciales incorrectas

1. Entre con un usuario que no existe. 2. Entre con un usuario real y una contraseña equivocada.

**Resultado esperado:** el mismo mensaje genérico en ambos casos; no se dice si el usuario existe. El formulario no se bloquea para volver a intentar.

### A-04 — ¿Olvidaste tu contraseña? con código de un solo uso

**Quién:** cualquier rol (use `carlos.cajero`).

1. En `/login` pulse «¿Olvidaste tu contraseña?», escriba `carlos.cajero` y «Enviar código».
2. Pida al equipo el código de 6 dígitos que generó el sistema.
3. En la pantalla del código, escriba el código, una contraseña nueva de al menos 8 caracteres y su confirmación. Guarde.
4. Entre con la contraseña nueva.

**Resultado esperado:** la respuesta a «Enviar código» es la misma exista o no la cuenta. El código funciona una sola vez. Con la contraseña nueva se entra; con la anterior ya no.

### A-05 — Código vencido, equivocado o reutilizado

1. Repita A-04 hasta el paso 2 y escriba un código equivocado cinco veces.
2. Pida un código nuevo y úselo para cambiar la contraseña; luego intente usarlo otra vez.
3. Pida un código y espere más de 30 minutos antes de usarlo (coordine con el equipo).
4. Pulse «Reenviar código» dos veces seguidas.

**Resultado esperado:** al quinto intento fallido el código queda invalidado y hay que pedir otro. Un código ya usado no sirve. Un código de más de 30 minutos se rechaza como vencido. El segundo reenvío antes de 60 segundos no genera un correo nuevo. Las contraseñas que no coinciden se avisan antes de enviar.

### A-06 — Activar una cuenta invitada

**Quién:** el dueño invita (D-02) y la persona nueva activa.

1. Con la invitación hecha por el dueño, abra el enlace «Poner mi contraseña» del correo (lleva a `/login?codigo=<usuario>` directo a la vista del código).
2. Escriba el código de la invitación y una contraseña nueva.

**Resultado esperado:** la cuenta queda activa y entra sola. Si la persona tiene turno y está fuera de su horario, la contraseña queda guardada y se muestra el motivo por el que no entra. El código de invitación vence a las 48 horas.

### A-07 — Encargada con varios restaurantes elige sede

**Quién:** encargada con dos restaurantes (coordine con el dueño para asignarle Poblado y Laureles en D-02).

1. Entre como la encargada. 2. Elija una sede en el selector; observe que cada local dice si tiene la caja abierta o cerrada. 3. Cierre sesión y vuelva a entrar.

**Resultado esperado:** el dispositivo recuerda la sede elegida. En `/caja` aparece «Cambiar» para elegir otra.

### A-08 — Acceso fuera del horario del turno

**Quién:** `mateo.mesero` (turno definido en Laureles); el dueño comprueba el aviso.

1. Fuera de la ventana del turno (turno ± margen del restaurante, 30 minutos por omisión), intente entrar como Mateo.
2. Como dueño, abra la campana de avisos y el Inicio del encargado de Laureles.
3. Pida al dueño que ponga a Mateo un turno con las dos horas iguales y vuelva a intentar.

**Resultado esperado:** el mensaje dice «Estás fuera de tu horario de acceso. Tu turno es HH:MM–HH:MM.» y se genera un aviso de acceso para el dueño y los encargados de esa sede. Con las dos horas iguales no hay restricción. El dueño y el encargado nunca tienen restricción de horario.

### A-09 — Una sola sesión por persona y cambio de contraseña

1. Entre como `sofia.mesera` en dos navegadores distintos.
2. En el segundo, abra el modal de ajustes → Seguridad → cambie la contraseña.

**Resultado esperado:** al entrar en el segundo navegador, el primero pierde la sesión en su siguiente acción. Al cambiar la contraseña se cierran las demás sesiones.

### A-10 — Cierre por inactividad y por fin de turno

**Quién:** mesero o cajero.

1. Entre y deje la pantalla de Mesas quieta 10 minutos: debe aparecer el aviso con «Seguir aquí». Deje pasar 5 minutos más sin tocar.
2. Repita en la pantalla de Cocina (`/kds`): no debe cerrarse por inactividad.
3. Con un usuario cuyo turno termine en pocos minutos (coordine con el dueño), espere al fin del turno.

**Resultado esperado:** a los 15 minutos de inactividad se cierra la sesión y el inicio explica el motivo. «Seguir aquí» aplaza el cierre. Cocina y Operación no se cierran por inactividad, pero sí al terminar el turno de quien entró; el fin de turno avisa 5 minutos antes y no se puede aplazar.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| A-01 | | | |
| A-02 | | | |
| A-03 | | | |
| A-04 | | | |
| A-05 | | | |
| A-06 | | | |
| A-07 | | | |
| A-08 | | | |
| A-09 | | | |
| A-10 | | | |
