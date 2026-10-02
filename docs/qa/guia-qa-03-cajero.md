# Guía QA Waiter — 3. Cajero

**Aplica a:** rol Cajero. **Organizaciones:** Burger House (`http://localhost:3000`) y Frisby (sistema propio), con todos los casos. En Frisby no existe «Forzar cierre».
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que el cajero abre el turno, ve y crea pedidos, cobra de todas las formas que ofrece el POS (efectivo con cambio, tarjeta por datáfono manual, QR simulado, pagos mixtos, propina, cuenta dividida y puntos de un cliente), imprime la cuenta y consulta el historial. Y que cerrar la caja le exige una nota cuando falta o sobra dinero.

## 2. Preparación

- Usuario: `carlos.cajero`, restaurante Poblado.
- Para cobrar hacen falta pedidos abiertos: use los de la Guía 2 o cree uno desde Pedidos → «Nuevo pedido» (el cajero puede crear pedidos).
- Política por defecto del cajero: vista Pedidos; acciones crear pedidos y cobrar. **No tiene la vista Ventas**, donde vive el botón «Cerrar caja»: para C-08 el dueño debe darle la vista Ventas en la matriz (ver D-03) o lo cierra la encargada (E-07).

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| C-01 | Abrir la caja con efectivo inicial | Cajero |
| C-02 | Pedidos: filtros, búsqueda y detalle | Cajero |
| C-03 | Cobrar en efectivo con cambio | Cajero |
| C-04 | Cobrar con tarjeta: aprobada y rechazada | Cajero |
| C-05 | Propina y cuenta dividida con pagos mixtos | Cajero |
| C-06 | Cliente socio y uso de puntos | Cajero |
| C-07 | Historial y cuenta de un pedido pagado | Cajero |
| C-08 | Cerrar la caja: cuadrada y con diferencia | Cajero (con la vista Ventas) |

## 4. Paso a paso

### C-01 — Abrir la caja con efectivo inicial

1. Con la caja de Poblado cerrada, entre como `carlos.cajero`.
2. En `/caja` escriba una nota («Turno mañana») y el efectivo inicial con el teclado numérico (por ejemplo $ 200.000). Pulse «Abrir caja».

**Resultado esperado:** llega al salón o a Pedidos; la tarjeta del restaurante en la consola del dueño pasa a «Caja abierta». La mesera que entre ahora llega a Mesas (A-02).

### C-02 — Pedidos: filtros, búsqueda y detalle

1. Vaya a Pedidos. Pruebe los filtros Todos, Sin enviar, En progreso, Listos para servir, Esperando pago y Servidos; observe los conteos.
2. Filtre por piso y por zona; cambie el orden; busque un pedido por número o mesa.
3. Abra el detalle de un pedido con dos rondas.

**Resultado esperado:** cada filtro muestra solo lo que dice y su conteo coincide con las tarjetas. El detalle agrupa las líneas por estado de cocina y ofrece «+ Nuevo pedido» e «Ir a pagar».

### C-03 — Cobrar en efectivo con cambio

1. En un pedido «Esperando pago» pulse «Ir a pagar».
2. Elija «Sin propina». En Efectivo, use un monto rápido mayor al total y luego escriba otro con el teclado.
3. Confirme.

**Resultado esperado:** el cambio se calcula bien en ambos casos; al confirmar aparece «¡Pago exitoso!» con «Imprimir cuenta»; el pedido pasa a pagado y la mesa queda libre.

### C-04 — Cobrar con tarjeta: aprobada y rechazada

1. En otro pedido, método Tarjeta. Registre el datáfono manual como **Rechazado**.
2. Repita como **Aprobado** y escriba el número de voucher.

**Resultado esperado:** el rechazo no cobra el pedido y permite reintentar; el aprobado lo cierra con el voucher guardado en la cuenta. El QR es simulado: debe decirlo y no prometer un cobro real.

### C-05 — Propina y cuenta dividida con pagos mixtos

1. En un pedido de dos personas, elija propina **10 %** y luego «Otra» con un valor fijo.
2. Divida la cuenta en **2** partes.
3. Pague una parte en efectivo y la otra con tarjeta aprobada. Antes de confirmar, use «Quitar pago» en una y vuelva a agregarla.

**Resultado esperado:** la propina se suma al total y se reparte entre las partes; el saldo restante baja con cada pago y llega a cero; «Quitar pago» devuelve el saldo; no se puede confirmar con saldo pendiente.

### C-06 — Cliente socio y uso de puntos

**Quién:** cajero; hace falta un cliente con puntos (ver D-11 o el comensal en Co-08).

1. En el pago, escriba el código de socio del cliente.
2. Use puntos: 100 puntos equivalen a $ 1 de descuento (observe el valor que muestra la pantalla).

**Resultado esperado:** el cliente queda asociado al pedido, el descuento por puntos se refleja en el total y los puntos usados se descuentan de su saldo (compruébelo en Consola → Clientes).

### C-07 — Historial y cuenta de un pedido pagado

1. Vaya a Historial. Busque los pedidos de hoy; use los chips por tipo (en mesa, para llevar, domicilio).
2. Abra la cuenta de uno pagado con propina y tarjeta.

**Resultado esperado:** el historial solo lista pedidos pagados; la cuenta muestra líneas, impuestos, propina, los pagos (método y voucher) y el cambio si lo hubo.

### C-08 — Cerrar la caja: cuadrada y con diferencia

**Quién:** cajero con la vista Ventas activada por el dueño (D-03). Si no, lo ejecuta la encargada (E-07) y este caso se marca «Bloqueado» con esa nota.

1. Vaya a Administración → Ventas y, en la tarjeta de caja, pulse «Cerrar caja».
2. Escriba como efectivo contado exactamente el esperado. Confirme.
3. En otro turno, abra la caja y ciérrela con un contado distinto al esperado **sin nota**.
4. Escriba la nota («Faltó el vuelto de la mesa 4») y confirme.

**Resultado esperado:** con la caja cuadrada el cierre pasa sin nota. Con diferencia, «Confirmar» queda bloqueado y el mensaje dice «Escribe el motivo para cerrar: el dueño lo verá en los cuadres de caja.»; con la nota se cierra. Si la diferencia supera la tolerancia del dueño ($ 2.000 en Burger House), el dueño recibe un aviso de caja (D-08). Un cajero no ve «Forzar cierre», que es solo del encargado.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| C-01 | | | |
| C-02 | | | |
| C-03 | | | |
| C-04 | | | |
| C-05 | | | |
| C-06 | | | |
| C-07 | | | |
| C-08 | | | |
