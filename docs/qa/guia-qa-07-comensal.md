# Guía QA Waiter — 7. Comensal (menú por QR)

**Aplica a:** la persona que come en el restaurante y usa el menú desde su teléfono. **Organizaciones:** Burger House y Frisby, con todos los casos.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que el comensal abre la carta desde el QR de su mesa, entiende cada plato, arma el pedido (compartido por mesa), lo envía, sigue su estado, llama al mesero, pide la cuenta, usa cupones y gana puntos con su cuenta. El pago en línea es simulado y así debe decirlo.

## 2. Preparación

- Use un teléfono o el modo móvil del navegador. Dirección con mesa: `/burger-house/poblado/t/<token>` (el equipo entrega el token de una mesa); sin mesa, `/burger-house/poblado` para «para llevar».
- Para ver la comanda en cocina y las llamadas en el salón, tenga abiertos `/kds` (encargada) y Mesas (mesera).
- La política del restaurante hace que el comensal siempre pague antes de cocina, salvo que un empleado con permiso envíe el pedido.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| Co-01 | Entrar por QR con la mesa identificada; portada sin mesa | Comensal |
| Co-02 | La carta: categorías, búsqueda y ficha del plato | Comensal |
| Co-03 | Carrito compartido por mesa, notas y comer aquí o llevar | Dos comensales en la misma mesa |
| Co-04 | Confirmar el pedido y seguir su estado | Comensal, cocina y mesero |
| Co-05 | Llamar al mesero y pedir la cuenta | Comensal y mesero |
| Co-06 | Pagar: en línea simulado o con el mesero | Comensal y cajero |
| Co-07 | Cupón en el pedido | Comensal |
| Co-08 | Cuenta, favoritos, historial, opiniones y recompensas | Comensal |
| Co-09 | Plato agotado en esta sede y restaurante suspendido | Comensal y encargado |

## 4. Paso a paso

### Co-01 — Entrar por QR con la mesa identificada; portada sin mesa

1. Abra la dirección con `/t/<token>`.
2. Abra `/burger-house` sin sede.

**Resultado esperado:** con el token, la carta abre ya con la mesa identificada, sin escribir códigos (los QR impresos de Burger House siguen valiendo después de la migración); `/burger-house` muestra «Elige tu restaurante» con Poblado y Laureles (si la organización tuviera una sola sede, iría directo).

### Co-02 — La carta: categorías, búsqueda y ficha del plato

1. Recorra las categorías; busque un plato por nombre.
2. Abra la ficha de un plato con galería: fotos (hasta 5), adicionales, acompañamientos, nutrición, alérgenos, tiempo de preparación y, si la tiene, la rebaja con el precio anterior tachado.

**Resultado esperado:** el precio va primero en la tarjeta; los platos agotados en la sede se ven como no disponibles; la ficha muestra todo lo configurado en el POS.

### Co-03 — Carrito compartido por mesa, notas y comer aquí o llevar

**Quién:** dos teléfonos con el mismo token de mesa.

1. En el primero agregue un plato con un adicional y una nota a cocina; en el segundo agregue otro plato.
2. Mire el carrito en ambos: debe mostrar ambos platos con quién agregó cada uno.
3. Cambie entre «Comer aquí» y «Para llevar».

**Resultado esperado:** el carrito es uno por mesa, con atribución por persona; la nota llega a cocina; sin mesa solo se ofrece para llevar o domicilio.

### Co-04 — Confirmar el pedido y seguir su estado

1. «Confirmar pedido». Según la política, el menú pide pagar primero (Co-06). Con la caja del restaurante cerrada el menú debe decir que el restaurante no está recibiendo pedidos en este momento.
2. Siga el estado: Recibido → En preparación → Listo → Entregado, mientras cocina (K-03) y el mesero (M-05) avanzan.

**Resultado esperado:** la comanda aparece en Cocina con la mesa y las notas; el estado del comensal cambia solo al compás de cocina y del salón; el pedido se ve en Pedidos del POS con el tipo correcto.

### Co-05 — Llamar al mesero y pedir la cuenta

1. Pulse «Llamar al mesero». 2. Pulse «Pedir la cuenta».

**Resultado esperado:** las llamadas llegan al panel de servicio del salón con la mesa correcta (M-06); al atenderlas, el comensal deja de ver la llamada pendiente.

### Co-06 — Pagar: en línea simulado o con el mesero

1. En «pago», acepte el consentimiento y use el pago en línea.
2. Repita con «Pagar con el mesero» y cobre desde el POS (C-03).

**Resultado esperado:** el pago en línea es **simulado** y lo dice; un resultado incierto no cobra dos veces; la propina dice «Elige al pagar en el POS»; el recibo (`recibo/<id>`) coincide con la cuenta del POS. No se emite factura electrónica real.

### Co-07 — Cupón en el pedido

1. Con el cupón que el dueño creó para Poblado (D-12), aplíquelo en un pedido de Poblado; luego intente en Laureles.

**Resultado esperado:** descuenta en Poblado y se rechaza en Laureles con un mensaje claro; un cupón vencido también se rechaza.

### Co-08 — Cuenta, favoritos, historial, opiniones y recompensas

1. Cuenta → registro: correo, código de 6 dígitos (vale 10 minutos) y contraseña. Entre, salga y vuelva a entrar.
2. Marque favoritos; revise el historial de pedidos pagados.
3. Deje una opinión de un plato; edítela; intente una segunda opinión del mismo plato.
4. Recompensas: puntos ganados, beneficios y acciones con premio. Registre una tarjeta de prueba (Visa 4242…, CVV 123).

**Resultado esperado:** una sola opinión por plato, editable; el premio por opinar se da una vez y solo con cuenta verificada; los puntos valen en toda la organización (Poblado y Laureles); la tarjeta es de prueba y así se indica.

### Co-09 — Plato agotado en esta sede y restaurante suspendido

1. Con la encargada marque «Agotar aquí» un plato en Poblado (E-05) y recargue la carta de Poblado y la de Laureles.
2. Pida a ProjectApp que suspenda la organización de prueba (P-05) y abra su menú.

**Resultado esperado:** el plato no se puede pedir en Poblado y sí en Laureles; con la organización suspendida el menú dice «Este restaurante no está disponible» y no acepta pedidos.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| Co-01 | | | |
| Co-02 | | | |
| Co-03 | | | |
| Co-04 | | | |
| Co-05 | | | |
| Co-06 | | | |
| Co-07 | | | |
| Co-08 | | | |
| Co-09 | | | |
