# Guía QA Waiter — 5. Encargado

**Aplica a:** rol Encargado (administrador de uno o varios restaurantes). **Organización:** Burger House para todo; en Frisby solo E-04 y E-05 (Inventario), cuando el dueño le haya creado una cuenta.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que el encargado opera su sede completa: entra sin abrir caja, lee el Inicio, maneja el salón y sus pisos, el inventario de su restaurante, las reservas, las ventas del día y el cierre de caja, sus cuadres y su rentabilidad, y la configuración del local. Y que **no** alcanza lo que es del dueño: otras sedes, la proyección, el costo de los ingredientes, la ficha comercial de los platos, la pasarela, la tolerancia de caja ni la consola.

## 2. Preparación

- Usuario: `laura.encargada`, restaurante Poblado.
- El dueño tiene la tolerancia de caja en $ 2.000 y hay un cierre histórico de Poblado con $ 12.000 de faltante.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| E-01 | Entrar sin abrir caja y abrirla después | Encargado |
| E-02 | Inicio: indicadores, «Para atender ahora» y patrones | Encargado |
| E-03 | Pisos y plano: crear, editar y la regla de caja abierta | Encargado |
| E-04 | Inventario de la sede: existencias, movimientos y solicitudes | Encargado |
| E-05 | Agotar un plato solo en esta sede | Encargado y comensal |
| E-06 | Reservas: crear, apartar mesa, sentar, no llegó, anticipo | Encargado |
| E-07 | Ventas del turno y cierre de caja con nota | Encargado |
| E-08 | Cuadres y rentabilidad de la sede | Encargado |
| E-09 | Configuración: restaurante, margen de acceso y pantalla | Encargado |
| E-10 | Operación: el turno en una pantalla | Encargado |
| E-11 | Meseros por zona | Encargado |
| E-12 | Lo que el encargado no puede hacer | Encargado |
| E-13 | Equipo limitado a su sede (sistema propio) | Encargado en Frisby |

## 4. Paso a paso

### E-01 — Entrar sin abrir caja y abrirla después

1. Con la caja cerrada, entre como `laura.encargada`. Debe llegar a Inicio.
2. Recorra Mesas, Inventario, Reservas, Historial y Administración sin abrir caja.
3. Vaya a `/caja`: debe ver «Entrar a administración sin abrir caja». Abra la caja con efectivo inicial.

**Resultado esperado:** el encargado entra a todas las secciones administrativas con la caja cerrada; el botón de saltar la apertura solo lo ve él; al abrir la caja, meseros y cajeros ya pueden entrar al salón.

### E-02 — Inicio: indicadores, «Para atender ahora» y patrones

1. Lea los indicadores de semana, mes, pedidos y ticket; pulse uno y compruebe que lleva a Ventas.
2. Revise pedidos abiertos, reservas de hoy, mesas libres y agotados.
3. En «Para atender ahora» busque: acceso fuera de turno (A-08), cierre con diferencia, platos en el pase, anticipos sin pagar y existencias bajas.
4. Mire el patrón por día y hora y los platos más y menos pedidos.

**Resultado esperado:** las cifras corresponden a Poblado; los avisos de «Para atender ahora» enlazan a la pantalla donde se resuelven; **no** aparece la proyección «Venta esperada» (es solo del dueño).

### E-03 — Pisos y plano: crear, editar y la regla de caja abierta

1. Con la caja **abierta**, en Mesas abra los ajustes del salón e intente editar un piso.
2. Cierre la caja (E-07) y repita: cree un piso «Terraza» con tres mesas, muévalas en el plano, cambie la capacidad de una, guarde.
3. Intente eliminar el piso.

**Resultado esperado:** con la caja abierta el sistema no deja tocar los pisos y lo dice con claridad; con la caja cerrada el editor funciona y el plano nuevo aparece en Mesas y en la grilla de Reservas. Eliminar un piso exige caja cerrada; si pidiera un PIN, repórtelo: el PIN ya no existe.

### E-04 — Inventario de la sede: existencias, movimientos y solicitudes

1. En Inventario → Ingredientes, abra un ingrediente y registre una **recepción** (entra cantidad), una **merma** y un **conteo**.
2. En el conteo, pida a otra persona que registre un movimiento del mismo ingrediente antes de que usted confirme.
3. Intente una merma mayor a las existencias.
4. Ajuste mínimo y máximo; busque el campo de costo.
5. En un ingrediente con nivel Bajo, pulse «Solicitar» y revise la pestaña Solicitudes.

**Resultado esperado:** cada movimiento queda en el historial con quién y cuándo; el conteo se rechaza si las existencias cambiaron mientras contaba («Actualiza el conteo»); la merma no deja existencias negativas; el encargado cambia mínimo y máximo pero **no** el costo; la solicitud agrupa por proveedor y pide un proveedor asignado si el ingrediente no lo tiene.

### E-05 — Agotar un plato solo en esta sede

**Quién:** encargado en Inventario → Menú; un comensal en el menú de Poblado y otro en el de Laureles.

1. En un plato con existencias, pulse «Agotar aquí».
2. Mire la carta del comensal de Poblado y la de Laureles.
3. Pulse «Volver a ofrecer».

**Resultado esperado:** el plato aparece agotado solo en Poblado; en Laureles sigue disponible. «Se pueden servir N» refleja la receta y las existencias de la sede. El encargado ve la receta de solo lectura: no puede editarla ni crear platos (eso es del dueño).

### E-06 — Reservas: crear, apartar mesa, sentar, no llegó, anticipo

1. En Reservas, cree una reserva para hoy con dos personas, una mesa, «apartar desde 30 minutos antes», un plato pre-pedido y anticipo con enlace de pago.
2. Mire la grilla por hora y el plano de Mesas a la hora de la reserva.
3. Marque el anticipo como pagado por otro medio. Pruebe «Cambiar mesas», «Sentar» y, en otra reserva, «No llegó» y «Cancelar».
4. Intente reservar en un día cerrado del horario y más allá del máximo de días permitidos.
5. Abra «Horario» de reservas y cambie una franja.

**Resultado esperado:** la mesa aparece apartada en el salón desde la hora indicada; el enlace de pago se genera y el anticipo cambia de estado; los días cerrados no se pueden elegir; «Sentar» crea el pedido en esa mesa con el plato pre-pedido; solo el encargado edita el horario.

### E-07 — Ventas del turno y cierre de caja con nota

1. Administración → Ventas: cambie los periodos (hoy, ayer, semana, mes, rango, por turno) y revise indicadores.
2. En la tarjeta de caja registre una entrada y una salida de efectivo.
3. «Cerrar caja» con un contado distinto al esperado, primero sin nota y luego con nota.
4. Si Odoo detecta un descuadre contable, aparece «Forzar cierre (administrador)»: úselo solo si el equipo lo pide.

**Resultado esperado:** las entradas y salidas cambian el efectivo esperado; el cierre con diferencia exige la nota; con la nota se cierra y el cuadre queda registrado con esperado, contado, diferencia y nota. Si la diferencia supera $ 2.000, el dueño recibe el aviso (D-08).

### E-08 — Cuadres y rentabilidad de la sede

1. Administración → Cuadres: compare la lista con los cierres que hizo; busque la tolerancia.
2. Administración → Rentabilidad: revise costo, margen, food cost, unidades y clase de los platos de Poblado.

**Resultado esperado:** solo cierres de Poblado; **no** hay campo para fijar la tolerancia (la fija el dueño). En Rentabilidad, los platos sin receta o sin costo dicen «Sin costo» y no 100 % de margen; las clases (Estrella, Caballo de batalla, Rompecabezas, Perro) aparecen.

### E-09 — Configuración: restaurante, margen de acceso y pantalla

1. Configuración → Restaurante: edite dirección y teléfono; ponga el margen de acceso en 0 y luego en 240 (el máximo).
2. Pagos y Usuarios: compruebe que son de solo lectura.
3. Pantalla: cambie densidad, estación, modo KDS y sonidos; use «prueba».

**Resultado esperado:** al cambiar el margen se cierran las sesiones de meseros y cajeros de la sede (vuelva a entrar con la mesera para comprobarlo); el margen no admite valores fuera de 0 a 240; Pagos y Usuarios no se editan desde aquí.

### E-10 — Operación: el turno en una pantalla

1. Abra `/operacion` (pantalla completa).
2. Revise mesas activas, en cocina, demorados, por cobrar y ventas del turno; filtre la tabla; atienda y resuelva una alerta.

**Resultado esperado:** las cifras coinciden con Mesas, Cocina y Pedidos; «Atender» y «Resolver» cambian la alerta de estado; «Configurar umbrales» abre la configuración de demora que usa Cocina.

### E-11 — Meseros por zona

1. Con la caja cerrada, en Mesas abra «Meseros por zona» y asigne el reparto habitual.
2. Con la caja abierta, cambie el reparto solo para el turno y pruebe «guardar como habitual».

**Resultado esperado:** con caja cerrada se edita lo habitual; con caja abierta solo el turno, salvo que marque guardarlo como habitual.

### E-12 — Lo que el encargado no puede hacer

1. Escriba `/organizacion` en la dirección.
2. En Inventario busque los botones «Ficha», crear plato, «Categorías» y «Fuera de la carta».
3. En Ingredientes intente cambiar el costo. En Inventario → Menú intente editar una receta.
4. Busque la proyección de ventas en Inicio y datos de otras sedes en Ventas o Cuadres.

**Resultado esperado:** la consola lo manda a `/login`; no hay botones del dueño; el costo no se edita; no ve otras sedes ni la proyección. Si alguna de estas acciones se consigue escribiendo la dirección, es un fallo: el servidor también debe rechazarla.

### E-13 — Equipo limitado a su sede (sistema propio)

**Quién:** un encargado de Frisby creado por la dueña (D-02) en `http://frisby-74312.localhost:3000`.

1. Entre y abra Equipo (si su cuenta tiene acceso a la consola del equipo; si no, el caso aplica a través del dueño).
2. Intente dar el rol Dueño a una persona o editar a alguien de otra sede.

**Resultado esperado:** el encargado solo maneja personas de sus restaurantes y no puede asignar el rol Dueño; nadie puede desactivarse a sí mismo.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| E-01 | | | |
| E-02 | | | |
| E-03 | | | |
| E-04 | | | |
| E-05 | | | |
| E-06 | | | |
| E-07 | | | |
| E-08 | | | |
| E-09 | | | |
| E-10 | | | |
| E-11 | | | |
| E-12 | | | |
| E-13 | | | |
