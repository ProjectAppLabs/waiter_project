# Guía QA Waiter — 8. ProjectApp (consola de la plataforma)

**Aplica a:** la gente de ProjectApp, roles **Administra** (`admin`) y **Opera** (`operator`). **Dirección:** `http://localhost:3000/login`, el mismo inicio de todos (la antigua `/plataforma/login` lleva allí).
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que ProjectApp da de alta a un cliente nuevo en tres pasos sin tocar scripts, invita al dueño, registra plan, precio y límite de restaurantes, suspende y reactiva, reenvía invitaciones, maneja su propio equipo y deja todo en la auditoría. Y que el operador no puede hacer lo que es del administrador.

## 2. Preparación

- `ana.projectapp` / `Plataforma-2026` (Administra).
- Para P-08 hace falta una persona con rol Opera: créela en P-07.
- Los correos (invitación al dueño, códigos) se guardan como archivos; pida al equipo el código cuando el caso lo necesite.
- Use nombres de cliente de prueba evidentes («QA Pollos», slug `qa-pollos-<fecha>`) para poder reconocerlos y suspenderlos después.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| P-01 | Entrar a la plataforma y ver la lista de clientes | Administra |
| P-02 | Nuevo cliente en tres pasos, slug y dirección | Administra |
| P-03 | El dueño nuevo activa su cuenta y entra por su subdominio | Administra y dueño nuevo |
| P-04 | Ficha: editar plan y datos, límite de restaurantes | Administra |
| P-05 | Suspender y reactivar; estado de prueba | Administra y dueño |
| P-06 | Aislamiento entre organizaciones | Dueño de una organización |
| P-07 | Equipo de ProjectApp | Administra |
| P-08 | Lo que el rol Opera no puede hacer | Opera |
| P-09 | Métricas por cliente | Administra u Opera |
| P-10 | Cobro de la suscripción: mora, suspensión automática y pago | Administra, Opera y el dueño |
| P-11 | Módulos del cliente por organización y por local | Administra y Opera |
| P-12 | Consumo del cliente y cobro por local y por uso | Administra |
| P-13 | Lista de precios y alta con precios personalizados | Administra |
| P-14 | Recargas, cortesías e incluido del asistente | Administra y dueño |
| P-15 | Prorrateo y saldo a favor | Administra y dueño |

## 4. Paso a paso

### P-01 — Entrar a la plataforma y ver la lista de clientes

1. Entre en `/login` (el mismo inicio del POS) con `ana.projectapp`. Pruebe también abrir `/plataforma/login`: debe llevar a `/login`.
2. Revise la tabla: cliente, dueño, plan, precio, restaurantes usados/límite, estado (Activa, En prueba, Suspendida) y alta. Use los filtros Todos, Activas, En prueba, Suspendidas y «Dueño sin activar». Ordene y busque.

**Resultado esperado:** el inicio reconoce la cuenta de ProjectApp y abre la consola en `/plataforma`; Frisby 74312 aparece con 2/2 restaurantes y su dueña activa; «¿Olvidaste tu contraseña?» funciona igual que en el POS (A-04).

### P-02 — Nuevo cliente en tres pasos, slug y dirección

1. «Nuevo cliente». Paso Organización: nombre, slug (vea la dirección resultante `<slug>.localhost:3000`), razón social, NIT y datos de facturación. Pruebe los slugs `plataforma`, `www`, `api`, `menu`, `admin`, `app` y uno ya usado (`frisby-74312`), y uno con mayúsculas o espacios.
2. Paso Dueño: nombre, correo y usuario.
3. Paso Plan: Básico, Pro o Grupo; precio mensual; límite de restaurantes; «prueba hasta» (déjelo vacío en este caso).
4. «Crear cliente e invitar al dueño».

**Resultado esperado:** los slugs reservados y el repetido se rechazan (`slug_taken`); el slug solo admite minúsculas, números y guiones de 2 a 40 caracteres; sin fecha de prueba el cliente nace **Activa**; con fecha, **En prueba**; el dueño queda «sin activar» y se le envía el correo con usuario, código y enlace.

### P-03 — El dueño nuevo activa su cuenta y entra por su subdominio

**Quién:** quien haga de dueño del cliente de P-02.

1. Con el código del correo, abra `http://<slug>.localhost:3000/login?codigo=<usuario>` y ponga la contraseña.
2. Entre a su consola: debe ver Restaurantes, Equipo y Catálogo. Cree un restaurante.
3. En la plataforma, la ficha del cliente debe mostrar el restaurante y el dueño «Activa».

**Resultado esperado:** la cuenta se activa con el código (vence a las 48 h, 5 intentos); el dueño entra solo por su subdominio; la plataforma ve lo que crea.

### P-04 — Ficha: editar plan y datos, límite de restaurantes

1. En la ficha de Frisby, «Editar plan y datos»: intente bajar el límite de restaurantes a 1 (tiene 2).
2. Cambie el precio y el plan; guarde. Revise la auditoría al pie.

**Resultado esperado:** no se puede bajar el límite por debajo de los restaurantes que ya existen; los cambios quedan en la auditoría con quién y cuándo.

### P-05 — Suspender y reactivar; estado de prueba

**Quién:** Administra; la dueña del cliente de P-02 comprueba.

1. En la ficha, «Suspender» con un motivo.
2. La dueña intenta entrar; el que ya estaba dentro intenta seguir trabajando.
3. «Reactivar». La dueña vuelve a entrar.
4. En un cliente con «prueba hasta» futura, suspenda y reactive; en otro con la fecha vencida, igual.

**Resultado esperado:** suspendida, el inicio de sesión dice «La cuenta de tu organización está suspendida. Escribe a ProjectApp.», las sesiones vivas dejan de valer y no se pueden dar de alta personas; al reactivar vuelve a «En prueba» solo si la fecha sigue vigente, si no a «Activa»; «Reactivar» en el menú de la tabla y en la ficha solo lo ejecuta Administra.

### P-06 — Aislamiento entre organizaciones

**Quién:** la dueña de Frisby.

1. Entre en `frisby-74312.localhost:3000`. En el mismo navegador abra `localhost:3000/organizacion` (Burger House) y `<slug de P-02>.localhost:3000/organizacion`.

**Resultado esperado:** la sesión de Frisby no sirve en otras organizaciones: cada subdominio exige su propio inicio de sesión y solo muestra sus datos.

### P-07 — Equipo de ProjectApp

1. Equipo → «Nueva persona» con rol **Opera**; luego otra con rol **Administra**.
2. «Reenviar» invitación y, tras activar, «Restablecer».
3. «Desactivar» a una. Intente desactivarse a sí misma.

**Resultado esperado:** estados Activa, Invitación pendiente y Desactivada; los códigos siguen las mismas reglas del POS (6 dígitos, 48 h, 5 intentos, 60 s entre reenvíos); nadie se desactiva a sí mismo.

### P-08 — Lo que el rol Opera no puede hacer

**Quién:** la persona con rol Opera creada en P-07.

1. Entre y recorra la tabla de clientes; abra una ficha; edite plan y datos; reenvíe la invitación al dueño.
2. Busque «Suspender» y «Reactivar» en la ficha; pruebe «Reactivar» desde el menú de la tabla sobre un cliente suspendido.
3. Vaya a Equipo y busque «Nueva persona», «Reenviar», «Restablecer» y «Desactivar».

**Resultado esperado:** Opera ve clientes, da de alta, edita plan y datos y reenvía la invitación al dueño; no ve «Suspender» ni los botones de equipo. Si «Reactivar» aparece en el menú de la tabla, el servidor debe rechazarlo con un mensaje claro: anótelo como observación de interfaz.

### P-09 — Métricas por cliente

1. Abra Métricas. Cambie entre «Este mes», «Últimos 30 días» y «Mes pasado».
2. Revise los totales (ingreso mensual, clientes por estado, ventas y pedidos de los clientes) y la tabla por cliente; ordene por ventas y por mora.

**Resultado esperado:** el ingreso mensual suma lo que pagan los clientes activos y en prueba vigente; las ventas de cada cliente coinciden con su consola (Resumen) para el mismo periodo; la columna «En mora» muestra lo vencido.

### P-10 — Cobro de la suscripción: mora, suspensión automática y pago

**Quién:** Administra; un cliente con precio mensual y su dueño. Coordine con el equipo el paso 2 (simula el paso del tiempo).

1. En Cobros, revise la cuenta del mes de cada cliente con precio (se generan solas el día 1) y los totales por pagar, vencido y recibido. Con Administra, revise y guarde las «Reglas de cobro» (día de cobro, plazo, suspender tras, recordar antes).
2. El equipo vence una cuenta y corre la revisión diaria.
3. El dueño de ese cliente intenta entrar a su Waiter.
4. En Cobros, «Registrar pago» con medio y referencia.
5. El dueño vuelve a entrar.

**Resultado esperado:** con la mora pasada el plazo, el cliente queda **Suspendido** solo y su dueño ve «La cuenta de tu organización está suspendida. Escribe a ProjectApp.»; antes de suspender, su consola muestra el aviso de la cuenta vencida y la fecha de suspensión. Al registrar el pago queda **Activa** sola y el dueño entra. Una suspensión hecha a mano no se levanta por pagar. Opera registra pagos, pero no ve las reglas ni anula cuentas.

### P-11 — Módulos del cliente por organización y por local

1. Abra la ficha de Burger House. En **Módulos** revise el plan (Completo) y, por cada módulo, el estado en la
   organización y en cada local con su origen: «Del plan», «Excepción de la organización» o «Excepción del local».
2. Apague **Inventario** solo para Poblado. Entre al POS de Poblado como encargada y revise la barra; entre a
   `/inventario` por la dirección. Revise Laureles.
3. Apague **Menú del comensal** en la organización con el **Asistente en el menú** encendido.
4. Abra «Vigencia y cupos» del Asistente en el menú: ponga una fecha de vencimiento de ayer y guarde.
5. En Poblado, pulse «Quitar excepción» en Inventario.
6. Repita el paso 2 con una cuenta que solo **Opera**.

**Resultado esperado:** con el plan Completo nada cambia para nadie. En el paso 2 Poblado no muestra Inventario ni
Rentabilidad, y por la dirección dice «Esta función no está activa en tu plan · Inventario» (también a la encargada);
Laureles sigue igual. El paso 3 se rechaza con el mensaje de dependencias y el nombre del Asistente. Con la vigencia
vencida vuelve a mandar el plan. Al quitar la excepción Poblado recupera Inventario con todos sus datos. Quien opera ve
los módulos pero no puede cambiarlos. Cada cambio queda en el Historial de la ficha.

### P-12 — Consumo del cliente y cobro por local y por uso

1. En la ficha de Burger House revise **Consumo del mes**: documentos emitidos y mensajes del asistente por local.
   Cambie el mes.
2. En **Cobros → Reglas de cobro**, fije el precio del «Asistente en el menú, por mensaje» (por ejemplo $ 100).
3. Genere el cobro del mes y revise su detalle.

**Resultado esperado:** el consumo se ve por módulo, unidad y local. La cuenta trae una línea de **mensualidad por cada
local activo** al precio por local, y una línea por los mensajes del asistente a su precio; lo que vale cero no sale. El
total de la cuenta es la suma de sus líneas.

### P-13 — Lista de precios y alta con precios personalizados

1. Abra **Precios**. Revise el precio por local, los precios por unidad, los planes de WhatsApp (Inicial: $ 50.000 con
   100 pedidos), los paquetes de recarga y qué pasa al agotarse. Cambie el precio por local y guarde.
2. Dé de alta un cliente con precios **Estándar** y el plan Inicial de WhatsApp. Dé de alta otro con precios
   **Personalizados**: $ 120.000 por local, 300 pedidos incluidos y el pedido extra a $ 400.
3. Abra la ficha de cada uno y revise «Precios» y «Asistente de WhatsApp». Edite el segundo y deje vacío el pedido extra.
4. Como alguien que solo **Opera**, abra Precios.

**Resultado esperado:** el cliente Estándar toma la lista (y un cambio de la lista le llega desde la cuenta siguiente);
el Personalizado conserva sus valores y lo que se deja vacío vuelve al estándar. Frisby y Burger House siguen con su
precio de siempre (Personalizados). Quien opera ve la lista pero no puede cambiarla.

### P-14 — Recargas, cortesías e incluido del asistente

**Preparación:** un cliente con el plan Inicial de WhatsApp y el consumo simulado de pedidos del asistente (soporte
técnico, mientras no existe el canal).

1. El dueño pide una recarga de 100 pedidos en su consola (D-17). En **Cobros** aparece una cuenta marcada «Recarga».
2. Antes de pagarla, revise el saldo de recargas en la ficha del cliente. Registre el pago y revise otra vez.
3. Anule otra cuenta de recarga sin pagar.
4. Dé un saldo de cortesía de 50 pedidos con motivo.
5. Simule 130 pedidos en el mes con 100 incluidos y 20 de saldo, con «cobrar» y luego con «bloquear».

**Resultado esperado:** la recarga suma saldo solo al registrar su pago; la anulada no suma. La cortesía suma y queda
con su motivo. Primero se gasta lo incluido, luego las recargas y, al final, con «cobrar» el excedente (10) sale en la
cuenta siguiente; con «bloquear» el pedido 121 se rechaza pidiendo recargar. Lo incluido no pasa al mes siguiente y
las recargas no vencen.

### P-15 — Prorrateo y saldo a favor

1. A mitad de mes, el dueño crea un local nuevo; otro cliente desactiva uno de sus locales.
2. Cambie el plan de WhatsApp de un cliente a mitad de mes y apague un módulo con precio especial.
3. Genere las cuentas del mes siguiente y revise sus líneas.
4. Provoque una cuenta que quede en negativo (por ejemplo, desactivar un local caro el día 1) y revise la siguiente.

**Resultado esperado:** cada cambio sale como «Ajuste por prorrateo · local (N de 31 días)», positivo si se agregó y
negativo si se quitó, contado en la zona horaria del cliente. Ninguna cuenta queda en negativo: queda en 0 y la
diferencia aparece como «saldo a favor», que se descuenta en la cuenta siguiente («Saldo a favor aplicado»).

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| P-01 | | | |
| P-02 | | | |
| P-03 | | | |
| P-04 | | | |
| P-05 | | | |
| P-06 | | | |
| P-07 | | | |
| P-08 | | | |
| P-09 | | | |
| P-10 | | | |
| P-11 | | | |
| P-12 | | | |
| P-13 | | | |
| P-14 | | | |
| P-15 | | | |
