# Mapa de flujos E2E · Pago e Historial del POS

Alcance de la ronda `2026-10-07-waiter-x0`: los módulos Pago e Historial. Este mapa no certifica otros módulos del POS ni el comensal. Lo generó el Analyst desde el código real; el registro vive en `pos/e2e/flow-definitions.json`.

## Convenciones y roles

Cada prueba calificable lleva `@flow:<id>` y `@outcome:<success|error|failure|display>`. Un display entra por la UI y afirma datos concretos. Historial se alcanza desde su pestaña principal. El contrato por tamaño prueba 835×1194 primero, luego 412×915, 1195×835, 1440×900 y 2560×1440. Se comprueba que las acciones se puedan terminar y los controles no queden recortados por ancestros; una captura o scrollWidth aislado no acredita la interacción.

Cobran cashier, admin y los roles con charge_orders; Historial requiere su vista habilitada y Devolver exige refund_orders y conexión. La impresión nativa no produce resultado posterior observable por la aplicación y conserva la exención expectedSpecs: 0.

## Pago

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-payment-checkout | Pedido, total y métodos reales; efectivo suficiente, tarjeta aprobada y QR; importe parcial, reparto y propina. Éxito con importe, método y cambio. Rechazo visible por efectivo insuficiente, QR no configurado o fallo del servidor. | `pos/app/(pos)/pago/[orderId]/page.tsx:8`; `pos/components/payment/PaymentModal.tsx:66`; `pos/components/payment/PaymentPanels.tsx:37`; `pos/lib/stores/orderStore.ts:85` |
| pos-payment-member-benefit | Buscar socio, ver código/nombre/puntos y aplicar beneficio. Código desconocido y saldo cambiado muestran su error sin terminar el cobro. | `pos/components/payment/PaymentModal.tsx:137`; `pos/lib/services/paymentKit.ts:24` |
| pos-payment-print-receipt | Exento: impresión nativa sin resultado propio observable. | `pos/components/payment/PaymentSuccess.tsx:41` |

## Historial

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-history-review | Pestaña Historial, búsqueda/filtros, selección y cliente/líneas/subtotal/impuestos/total concretos. Si falla la lista, termina la carga y aparece vacío. | `pos/lib/domain/navigation.ts:6`; `pos/components/kit/TopBar.tsx:56`; `pos/app/(pos)/historial/page.tsx:26`; `pos/components/history/BillInfo.tsx:17` |
| pos-history-refund | Con permiso y conexión, seleccionar líneas/propina, repartir, dar motivo y confirmar. Importe/nota crédito y lista actualizada. Validaciones, permiso, caja cerrada o red fallida visibles. | `pos/app/(pos)/historial/page.tsx:37`; `pos/components/history/RefundModal.tsx:42`; `experience/sales/refunds.py:176` |
| pos-history-print-receipt | Exento: impresión nativa sin estado posterior observable. | `pos/components/history/BillInfo.tsx:63` |

## Estado inicial

Los casos legados ejercen parte del pago y la devolución, pero carecen de los tags del registro nuevo y no reciben crédito automático: `pos/e2e/pedido.spec.ts:27` y `pos/e2e/devolucion.spec.ts:20`. La QA de esta ronda valida los cambios seleccionados; cualquier resultado pendiente de los demás comportamientos se conserva como deuda explícita, sin declarar cobertura completa del POS.
