# Mapa de flujos E2E · Acceso, Pedidos, Pago e Historial del POS

La ronda `2026-10-07-waiter-x0` cubre Pago e Historial; `2026-10-08-waiter-w0` añade
salida offline y la búsqueda/creación de Pedidos. Este mapa no certifica el resto del POS
ni el comensal. El registro vive en `pos/e2e/flow-definitions.json`.

## Convenciones y roles

Cada prueba calificable lleva `@flow:<id>` y `@outcome:<success|error|failure|display>`. Un display entra por la UI y afirma datos concretos. Historial se alcanza desde su pestaña principal. El contrato por tamaño prueba 835×1194 primero, luego 412×915, 1195×835, 1440×900 y 2560×1440. Se comprueba que las acciones se puedan terminar y los controles no queden recortados por ancestros; una captura o scrollWidth aislado no acredita la interacción.

La preparación usa un propietario sintético: login → Organización → Restaurantes → Local QA → Entrar al POS. `rondaFixture.ts` recorre ese puente una vez por worker y conserva el estado real en memoria. Cada caso restaura ese estado en un contexto nuevo, abre Dashboard y entra a Pago o Historial por la navegación del POS en desktop; luego cambia al tamaño objetivo. Ese puente no certifica la consola, Dashboard ni Pedidos en compacto. El aviso de éxito y sus importes sí pertenecen al contrato de Pago; el desborde global se mide antes de pulsar Listo.

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

## Acceso offline y Pedidos · ronda 2026-10-08

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-login-logout | Sesión válida durante caída de Django; cerrar desde Ajustes, confirmar y recargar sin servidor. Dashboard vuelve a login incluso si el cierre remoto falla. Los contextos propios de estos casos no consumen la sesión de las otras pruebas. | `pos/lib/stores/authStore.ts`; `pos/lib/offline/cache.ts`; `pos/lib/services/core/http.ts`; `pos/e2e/acceso/ronda.spec.ts` |
| pos-orders-review | Entrar a Pedidos por la UI, buscar número y cliente de una cuenta de 38.900, filtrar Sin enviar y limpiar; verificar cuenta, importe y conteos reales. | `pos/app/(pos)/pedidos/page.tsx`; `pos/lib/hooks/useKitOrders.ts`; `pos/e2e/pedidos/ronda.spec.ts` |
| pos-order-create | Pulsar Crear pedido y ver la selección de mesa o para llevar/domicilio sin confirmar una creación. | `pos/app/(pos)/pedidos/page.tsx`; `pos/app/(pos)/pedidos/nuevo/page.tsx`; `pos/e2e/pedidos/ronda.spec.ts` |

Pedidos usa 835×1194 primero, después 412×915, 1195×835, 1440×900 y 2560×1440. El
guion comprueba rectángulos, recortes de ancestros, controles y desborde documental junto
con la interacción. La evidencia del nuevo guion permanece pendiente hasta su ejecución
sobre el SHA final: tags, autoría y el verde de la ronda anterior no le dan crédito.

## Índice de cobertura de la ronda

| Flujo y resultado | Prueba calificable | Límite del guion |
|---|---|---|
| pos-payment-checkout · success | `pos/e2e/pago/ronda.spec.ts` | Efectivo: pedido de 38.900, recibido 50.000, cambio 11.100 y salida por Listo; cinco tamaños. No acredita tarjeta/QR, reparto, puntos ni resultados negativos. |
| pos-history-review · display | `pos/e2e/historial/ronda.spec.ts` | Búsqueda y selección de una cuenta real de 38.900; cinco tamaños. No acredita el fallo de lectura ni otros roles. |
| pos-history-refund · display | `pos/e2e/historial/ronda.spec.ts` | Abrir Devolver, seleccionar el total y comprobar que falta el motivo; cinco tamaños. No se confirma una devolución. |

Las demás clases de resultado continúan sin prueba calificable en esta ronda; los dos flujos de impresión mantienen su exención. La presencia de un archivo o de tags no compra cobertura: el resultado de ejecución y el SHA comprobado se consultan en el reporte `2026-10-07-waiter_project-improvement-pass-project-2026-10-07-waiter-x0.md` del toolkit.
