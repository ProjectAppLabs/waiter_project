# Plan U · Backend de devoluciones y líneas idempotentes (decisiones de implementación)

Implementación de `docs/planes/2026-10-03-plan-U-pos-faltantes.md`. Todas las rutas usan la sesión del POS,
la cabecera `X-Waiter-Org` y el alcance de restaurantes de la cuenta.

## Formas de respuesta

`GET /api/pos/v1/orders/{id}/refundable` responde directamente:

```json
{
  "lines": [{"line_id": 12, "name": "Papas", "qty": 2, "refundable_qty": 1,
             "unit_amount": 10800, "refundable_amount": 10800}],
  "tip": 1000,
  "payments": [{"method_id": 1, "name": "Efectivo", "type": "cash", "paid": 22600, "refundable": 11800}],
  "refunds": [],
  "credit_note": true
}
```

`tip` es la propina pendiente de devolver y `credit_note` indica si existe un original en estado `issued`.
Las líneas agotadas siguen presentes con cantidad e importe devolvibles en cero. Consultar un pedido completamente
devuelto responde 200; intentar otra devolución responde `409 not_refundable`.

`POST /api/pos/v1/orders/{id}/refunds` acepta exactamente los campos del plan y devuelve HTTP 200:
`{refund, order, credit_note}`. `credit_note` es el documento completo de facturación o `null`.
`refund` contiene `id`, `order_id`, `restaurant_id`, `shift_id`, `lines`, `tip`, `total`, `reason`, `restock`,
`request_key`, `created_at`, `account: {id, name}` y `payments: [{method_id, amount, name, type}]`.
Cada línea guardada contiene `line_id`, `product_id`, `name`, `qty`, `amount`, `subtotal` y `tax`.

`GET /api/pos/v1/refunds?restaurant_id&from&to` responde `{refunds: [...]}` con esa misma forma.
Sin restaurante incluye los restaurantes permitidos del dueño o encargado; sin fechas usa el día local actual.
`shifts/{id}/closing` incorpora `refunds_cash` y `refunds`.

## Decisiones donde el plan no precisaba el detalle

- Las claves tienen entre 16 y 80 caracteres, como los pagos. Repetir una clave con la misma carga devuelve la
  devolución guardada, incluso después de cerrar la caja; con otra carga o pedido da `409 request_key_conflict`.
  El orden de las listas no cambia la identidad de la solicitud. Las claves usan `ExactCharField`.
- Se devuelven los platos o padres de combo. Los componentes se reponen proporcionalmente con el padre; no se
  seleccionan por separado. Las líneas técnicas negativas del canje tampoco se seleccionan por separado.
- El canje existente se reparte proporcionalmente entre los platos, después de los descuentos y cupones ya guardados.
  La devolución reintegra ese canje como puntos y devuelve únicamente el dinero neto del plato.
  Un canje completo puede producir una devolución de cero pesos con `payments: []`.
- Los importes se calculan por cantidad acumulada devuelta, redondeando al centavo: la última fracción agota
  exactamente el saldo. `unit_amount` es orientativo y puede tener más de dos decimales; el importe parcial exacto es
  `redondear(unit_amount * cantidad_acumulada_nueva) - importe_ya_devuelto`.
- Los puntos ganados se revierten sin incluir propina, por tarjeta en mesas compartidas. Primero se revierte el abono
  hasta el saldo disponible, anotando la diferencia sin recuperar, y luego se reintegra el canje.
- Se conserva `stock_usage` por línea al cobrar, con ingrediente, unidad y cantidad realmente descontada, incluidos
  faltantes y redondeo. Así una receta editada después no cambia la reposición de ventas nuevas.
  Para ventas anteriores a U1, sin esa copia, se usa la receta disponible y se limita la asignación al movimiento
  histórico de salida. No es posible reconstruir una receta antigua que nunca se guardó.
- Las notas usan `NC-1`, `NC-2`, etc. por organización, sin resolución. Si una resolución antigua ocupó un número
  `NC-...`, se omite ese número. Conservan comprador, emisor, impuestos y propina del original. El canje devuelto se
  representa como una línea negativa sin impuesto, igual que en el documento original.
- Una contingencia del proveedor conserva la devolución y la nota para reintentar mediante la ruta existente de
  documentos. Reenviar la devolución no vuelve a transmitir la nota. El proveedor sigue siendo el simulado.
- Los informes restan importes y cantidades en la fecha de devolución; conservan el número histórico de pedidos y
  comensales. En rentabilidad, devolver comida sin reponer inventario conserva su costo consumido.
- U2 omite UUID ya aceptados si coinciden producto, cantidad y padre, incluso tras cobrar o agotar el producto.
  Los componentes enviados en el reintento también deben coincidir. Un conflicto responde `409 uuid_conflict` y
  revierte la ronda completa. Las notas y opciones ya guardadas no se reescriben.

## Migraciones y verificación

- `sales/0008_devoluciones.py`: devoluciones, pagos devueltos, acumulado del pedido y copia del consumo.
- `billing/0004_notas_credito.py`: varios documentos por pedido, relación con devolución y original único mediante
  columna calculada `only_when`, sin índices parciales.
- `inventory/0004_movimientos_devolucion.py`: movimiento `return`.

Las pruebas de U1/U2 están en `test_devoluciones.py`, `test_devoluciones_concurrentes.py` y
`test_lineas_idempotentes.py`. Desde `experience/`, ejecutar `venv/bin/pytest` y
`venv/bin/python manage.py makemigrations --check`. En este árbol se verifican con SQLite; MySQL queda para la
integración en el entorno que dispone de `waiter-mysql`.

Verificación final en este árbol (2026-10-03): **1972 pruebas aprobadas**, incluidas **45 pruebas nuevas** de U1/U2;
`manage.py makemigrations --check` sin cambios pendientes y `manage.py check` sin problemas. La suite completa
terminó en 458,15 segundos usando SQLite.
