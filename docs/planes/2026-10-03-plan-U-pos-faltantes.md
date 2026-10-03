# Plan U · Lo que le falta al POS: devoluciones, sin conexión e impresión

**Fecha:** 2026-10-03 · **Rama:** `feat/03102026-pos-faltantes` · **Pedido del dueño:** «integremos lo del POS que
falta», tras la revisión de huecos del 2026-10-03.

Tres piezas que un restaurante real necesita desde el primer día y que el POS no tiene:

- **U1 · Devoluciones y notas crédito.** Hoy solo se cancelan platos antes de que cocina empiece. No hay forma de
  devolver el dinero de un pedido ya cobrado.
- **U2 · Funcionar sin internet.** Si se cae el internet del local, hoy no se puede tomar pedidos ni cobrar.
- **U3 · Impresión.** Hoy solo existe imprimir el recibo desde el navegador. Faltan las comandas impresas por estación
  y una forma clara de usar impresoras térmicas.

Fuera de este plan, en el [sprint de integraciones](2026-09-28-sprint-integraciones-pendientes.md):

- la nota crédito real ante la DIAN (aquí pasa por el proveedor simulado, como las facturas);
- el reembolso automático por Bold o Wompi (aquí el reembolso con tarjeta se hace en el datáfono y se registra a mano);
- impresoras de red ESC/POS sin diálogo del navegador, que necesitan un agente local en el equipo del restaurante.

## U1 · Devoluciones y notas crédito

### Reglas

- Solo se devuelve un pedido **pagado**, de cualquier día, siempre que la caja del restaurante esté **abierta** ahora:
  el dinero sale de la caja del turno actual y queda en su cuadre.
- **Total o parcial.** Parcial por líneas y cantidades: cada línea devuelve lo que se cobró por ella (con su descuento,
  cupón o canje), en proporción a la cantidad. La propina se devuelve aparte, total o en parte. Lo ya devuelto no se
  vuelve a devolver.
- **Motivo obligatorio** (mínimo 5 caracteres) y queda quién la hizo.
- **Permiso nuevo `refund_orders`.** Por omisión solo el encargado (`admin`) y el dueño. El dueño puede dárselo al cajero
  desde los permisos por rol.
- **Cómo sale el dinero:** por los mismos métodos con que se pagó, sin pasar de lo pagado por cada método menos lo ya
  devuelto por ese método. La suma debe ser igual al valor de la devolución. El efectivo baja el efectivo esperado del
  cuadre del turno actual; la tarjeta o el QR se reembolsan en el datáfono o el banco y aquí solo se registran.
- **Puntos:** se revierten los puntos ganados en proporción a lo devuelto. Si se devuelve una línea pagada con puntos,
  esos puntos vuelven a la tarjeta. Si el cliente ya gastó los puntos ganados, la tarjeta queda en cero, nunca en
  negativo, y la diferencia queda anotada en el movimiento.
- **Inventario:** por omisión no vuelve nada (la comida servida no regresa). La devolución puede marcar «volver al
  inventario» para lo que no se preparó o se puede revender; entonces los ingredientes regresan con un movimiento de
  tipo devolución.
- **Documento:** si el pedido tiene un documento emitido (factura o documento equivalente POS), la devolución emite una
  **nota crédito** que lo referencia, con las líneas, impuestos y propina devueltos, por el mismo proveedor. Sin
  documento no hay nota crédito.
- **Aviso al dueño:** cada devolución crea una notificación de caja con el valor, el pedido, la persona y el motivo.
- **Idempotente** por `request_key`, como los pagos.

### Modelos (experience)

- `sales.Refund`: organización, restaurante, pedido (`order.refunds`), turno donde se hizo, líneas devueltas (JSON:
  línea, cantidad, valor, subtotal, impuestos), propina devuelta, valor total, motivo, volver al inventario, clave de
  idempotencia (única por organización, colación exacta), quién y cuándo.
- `sales.RefundPayment`: devolución, método, valor.
- `sales.Order.refunded`: suma de lo devuelto. El estado del pedido sigue en `paid`.
- `billing.SalesDocument.order` pasa de uno a uno a **muchos por pedido** (`order.documents`), para que la nota
  crédito comparta el pedido con su documento original. La nota crédito no usa resolución de numeración (la DIAN no la
  exige): `resolution` admite vacío solo para `credit_note`, y su número es `NC-<consecutivo por organización>`.
- `inventory.StockMove.kind` admite `return`.

### API (`/api/pos/v1`)

- `GET orders/{id}/refundable` → lo que se puede devolver: por línea `{line_id, name, qty, refundable_qty, unit_amount,
  refundable_amount}`, la propina devolvible, por método `{method_id, name, type, paid, refundable}`, las devoluciones
  previas y si se emitirá nota crédito.
- `POST orders/{id}/refunds` con `{lines: [{line_id, qty}], tip, payments: [{method_id, amount}], reason, restock,
  request_key}` → `{refund, order, credit_note}`. Errores: `not_refundable` (no pagado o ya devuelto del todo),
  `shift_closed`, `invalid_data` (cantidades o métodos que no cuadran), `forbidden`.
- `GET refunds?restaurant_id&from&to` → las devoluciones del periodo, para el dueño y el encargado.
- El cierre de caja (`shifts/{id}/closing`) suma `refunds_cash` y lo resta del efectivo esperado; también devuelve las
  devoluciones del turno.
- Resumen, rentabilidad y ventas restan las devoluciones en la fecha en que se hicieron.

## U2 · Funcionar sin internet

En producción el servidor está en la nube: sin internet tampoco llegan los pedidos a la pantalla de cocina. Por eso el
modo sin conexión va de la mano de la comanda impresa (U3).

- **La app abre sin internet.** El service worker guarda la app (HTML, JS, CSS, fuentes e íconos) en el primer uso y la
  sirve si no hay red. Solo en producción: en desarrollo no guarda nada para no estorbar la recarga en caliente.
- **Los datos de trabajo quedan en el equipo:** la carta, las mesas, los métodos de pago y la caja abierta se guardan en
  el navegador cada vez que se leen, y se usan si el servidor no responde.
- **Lo que se puede hacer sin conexión:** crear pedidos, agregar rondas, enviar a cocina y cobrar en **efectivo** o con
  **datáfono manual** (el datáfono aprueba por su lado). No se puede: QR o pagos en línea, devoluciones, cierre de caja,
  inventario ni cambios de configuración.
- **Cola de salida:** cada operación sin conexión se guarda en orden en IndexedDB con sus identificadores (el `uuid` del
  pedido y de cada línea, la `request_key` de cada pago) y se reenvía sola al volver la red. Si una respuesta se perdió,
  el reenvío no duplica nada:
  - crear el pedido ya es idempotente por `uuid`;
  - **agregar líneas pasa a ser idempotente** (experience): una línea con un `uuid` que el pedido ya tiene se omite si es
    la misma (producto y cantidad) y se rechaza si es otra;
  - los pagos ya son idempotentes por `request_key`, y cerrar un pedido pagado ya no hace nada.
- **Lo que ve el personal:** un aviso fijo «Sin conexión · N pendientes por enviar», los pedidos sin enviar marcados como
  tales, y al volver la red «Enviando…» y luego el resultado. Si el servidor rechaza una operación al sincronizar (por
  ejemplo, un plato agotado), queda en una lista de «pendientes con error» para que el encargado la resuelva; las demás
  siguen.
- **Comanda impresa automática:** con la opción de U3 activa, un pedido o ronda creado sin conexión imprime su comanda
  en el acto, porque cocina no lo verá en pantalla hasta que vuelva la red.

## U3 · Impresión

Se imprime con el diálogo del navegador, que llega a cualquier impresora instalada en el equipo (térmicas de 80 mm o 58
mm incluidas). Para que no aparezca el diálogo en un equipo dedicado, Chrome o Edge se abren con
`--kiosk-printing` y la impresora térmica como predeterminada. Así queda documentado en la guía.

- **Recibo:** ya existe. Se revisa en 80 mm y se agrega el ancho de 58 mm.
- **Comanda de cocina:** número de pedido, mesa o «para llevar», mesero, hora, ronda y por cada plato cantidad, nombre,
  opciones y nota en letra grande. **Una comanda por estación** (las estaciones salen de la categoría del plato, como
  en la pantalla de cocina); si la carta no usa estaciones, una sola.
- **Cuándo se imprime:** botón «Imprimir comanda» en el pedido y en cada ticket de la pantalla de cocina, y una opción
  **por equipo** «Imprimir la comanda al enviar a cocina» (con la estación o estaciones que imprime ese equipo).
- **Ajustes de impresión por equipo** (en Configuración › Pantalla): ancho del papel (80 o 58 mm), imprimir comanda al
  enviar, estaciones de este equipo y copias del recibo.

## Pruebas que deben existir (`# Falla si …`)

- U1: total y parcial; no devolver más de lo pagado ni dos veces lo mismo; métodos que no cuadran; sin caja abierta;
  permiso; cuadre de caja con efectivo devuelto; puntos revertidos sin saldo negativo; canje devuelto; inventario solo
  con «volver al inventario»; nota crédito con su original y numeración propia; idempotencia; aislamiento entre
  organizaciones; informes netos.
- U2: líneas idempotentes; la cola reenvía en orden y una sola vez; un error no frena el resto; sin red no se ofrecen QR
  ni devoluciones.
- U3: una comanda por estación con opciones y notas; ajustes por equipo; impresión automática al enviar.
- e2e: devolución parcial en efectivo desde Historial y su efecto en el cuadre; pedido sin conexión que se sincroniza al
  volver la red; comanda impresa.

## Estado

- (pendiente)
