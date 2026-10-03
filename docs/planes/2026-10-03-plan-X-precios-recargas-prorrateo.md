# Plan X · Precios estándar y personalizados, plan de WhatsApp con recargas y prorrateo

**Fecha:** 2026-10-03 · **Rama:** `feat/03102026-precios-y-recargas` · **Sigue a:** [plan W](2026-10-03-plan-W-modularizacion.md)
(módulos y medición, ya en `main`).

**Pedido del dueño (2026-10-03):** «lo de WhatsApp puede tener un plan inicial y luego sí por recarga, similar a Claude
con sus planes de suscripción; los precios, desde la consola definir unos precios estándar, pero permitir hacer
onboarding a un cliente con precios especiales o personalizados; toca implementar prorrateo». Además, cerrar lo que
quedó abierto del plan W: que el precio especial de un módulo se cobre, que los cupos se apliquen y que las
dependencias sean las de la propuesta (documento 232).

## Reglas

### Lista de precios estándar

Una sola lista en la consola de ProjectApp («Precios»), editable por quien administra la plataforma:

- **Precio por local al mes** (por omisión COP 150.000).
- **Precio mensual por módulo** para los que no van incluidos en el precio por local (por omisión, todos en 0: el
  software completo va en el precio por local).
- **Precio por unidad de uso** (hoy en `settings/billing → unit_prices`): mensaje del asistente del menú (0 hasta que
  el dueño lo fije), pedido del asistente de WhatsApp (COP 500), documento electrónico (0), código de verificación (0).
- **Planes del asistente de WhatsApp**: nombre, precio mensual y pedidos incluidos al mes. Por omisión uno, **Inicial**:
  COP 50.000 al mes con 100 pedidos incluidos (el mismo COP 500 por pedido).
- **Paquetes de recarga**: nombre, módulo, unidad, cantidad y precio. Por omisión: 100 pedidos a COP 50.000, 500 a
  COP 250.000 y 1.000 a COP 500.000.
- **Al agotarse lo incluido y las recargas**: `cobrar` el excedente al precio por unidad en la cuenta siguiente (por
  omisión, para no perder ventas) o `bloquear` (el canal responde que se agotó y ofrece recargar).

Todos los números por omisión son **de partida**: el dueño los cambia en la consola.

### Precios de cada cliente

- Al dar de alta un cliente (y después, en su ficha) se elige **Estándar** (sigue la lista; si la lista cambia, cambia
  su precio desde el siguiente periodo) o **Personalizado** (sus propios valores para cualquiera de los anteriores:
  precio por local, precios por unidad, precio mensual de un módulo, plan de WhatsApp con su precio y pedidos
  incluidos, paquetes de recarga y qué pasa al agotarse). Lo que no se personaliza toma el estándar.
- Las organizaciones actuales quedan **Personalizado** con su precio por local de hoy (Frisby 450.000, Burger House 0):
  nadie cambia de precio sin que el dueño lo decida.
- El **precio especial** de una excepción de módulo (plan W) se cobra como mensualidad de ese módulo, por organización o
  por local según la excepción. Gana sobre el precio del cliente y el estándar.
- Los **cupos** de una excepción (`limits`, plan W) son unidades incluidas al mes de ese módulo y se aplican igual que
  los pedidos incluidos del plan de WhatsApp.

### Consumo con incluido, recargas y excedente

Para una unidad medida con cupo (pedidos de WhatsApp, documentos si se les pone cupo, etc.), en cada periodo:

1. Primero se usa **lo incluido** del mes (plan de WhatsApp o cupo de la excepción). No se acumula de un mes a otro.
2. Luego el **saldo de recargas** de esa unidad, el más antiguo primero. Las recargas **no vencen**.
3. Luego, según el cliente: **cobrar** el excedente al precio por unidad en la cuenta siguiente, o **bloquear**: la
   operación se rechaza con `402 quota_exhausted` y el mensaje para recargar.

El canal de WhatsApp (sprint de integraciones) consulta antes de cerrar un pedido y registra el consumo con su clave de
idempotencia; un reintento no gasta dos veces. Hoy se deja listo el servicio y se prueba con consumo simulado.

### Recargas

- El dueño, en su consola (**Consumo**), ve por unidad: incluido del mes, usado, saldo de recargas y excedente, y puede
  pedir una recarga eligiendo un paquete. Se crea una **cuenta de recarga** pendiente (un cobro con una línea).
- Cuando ProjectApp registra el pago de esa cuenta (como cualquier cobro), el saldo de recargas sube. Anular la cuenta
  no da saldo.
- ProjectApp también puede dar saldo de **cortesía** desde la ficha del cliente, con motivo; queda en el historial.

### Prorrateo

- La mensualidad (por local y por módulo con precio) se cobra **por adelantado** en la cuenta del mes, por lo que esté
  activo al generarla.
- Lo que cambie durante el mes se ajusta **por días** (en la zona horaria del cliente) en la cuenta siguiente, con
  líneas «Ajuste por prorrateo · Laureles (12 de 31 días)»:
  - local creado o activado a mitad de mes: se cobran los días que estuvo activo;
  - local desactivado a mitad de mes: se devuelven los días que ya no estuvo;
  - módulo con precio o plan de WhatsApp activado, apagado o cambiado: la diferencia por días.
- El uso sigue la regla del plan W: la cuenta del mes trae el uso del mes anterior.
- Los pedidos incluidos de un plan de WhatsApp contratado o cambiado a mitad de mes valen completos para ese mes
  (más simple y a favor del cliente).
- Las líneas de ajuste pueden ser negativas. Si una cuenta queda en negativo, su total es 0 y la diferencia queda como
  **saldo a favor** del cliente, que se descuenta en la cuenta siguiente («Saldo a favor aplicado»).
- Una cuenta ya emitida no se reabre: todo ajuste va en la siguiente.

### Dependencias (documento 232)

- `pagos_en_linea` depende de `menu_comensal` **o** de `asistente_whatsapp` (cualquiera de los dos).
- `menu_comensal` depende de `nucleo`. **Pedir desde la mesa** (sesión con el token de una mesa) necesita además
  `salon`: sin Salón, el menú se puede ver y pedir para llevar, pero el QR de una mesa explica que pedir desde la mesa
  no está activo.
- El catálogo muestra las dependencias «una de» de forma legible y los errores las nombran.

## Contratos entre el servidor y las pantallas

Nombres de campos exactos. Codex hace el servidor y Claude las pantallas en paralelo.

**Plataforma (`/api/platform/v1`, escritura solo para administradores):**

- `GET/PATCH settings/pricing` → `{"local_monthly": 150000, "modules": {"<clave>": 0, …}, "unit_prices":
  {"asistente_menu.mensaje_ia": 0, "asistente_whatsapp.pedido_asistente": 500, …}, "whatsapp_plans": [{"key": "inicial",
  "name": "Inicial", "monthly_price": 50000, "included": {"pedido_asistente": 100}}], "recharge_packs": [{"key":
  "pedidos_100", "name": "100 pedidos", "module": "asistente_whatsapp", "unit": "pedido_asistente", "quantity": 100,
  "price": 50000}], "on_exhausted": "cobrar" | "bloquear"}`. `settings/billing` sigue aceptando y devolviendo
  `unit_prices` (los mismos valores).
- En la organización (detalle, alta y edición) un objeto `"pricing": {"mode": "estandar" | "personalizado",
  "local_monthly"?, "unit_prices"?, "modules"?, "whatsapp_plan"?: "<key>" | null, "whatsapp"?: {"monthly_price",
  "included"}, "recharge_packs"?, "on_exhausted"?}` (en `personalizado` solo lo que se aparta del estándar) y, de solo
  lectura, `"effective_pricing"` con los valores que se aplican (misma forma que `settings/pricing`, más
  `"whatsapp_plan"`). `monthly_price` se mantiene en la respuesta y es igual a `effective_pricing.local_monthly`.
- `GET organizations/<slug>/credits` → `{"balances": [{"module", "unit", "unit_name", "balance"}], "movements": [{"id",
  "at", "kind": "recarga" | "cortesia" | "consumo", "module", "unit", "quantity", "amount", "reference", "actor"}]}`.
- `POST organizations/<slug>/credits` con `{"module", "unit", "quantity", "reason"}` (cortesía) → lo mismo que el GET.
- Los cobros (`charges`) agregan `"kind": "mensualidad" | "recarga"`. Registrar el pago de una recarga da el saldo.
  Las líneas pueden tener total negativo (ajustes y saldo a favor).
- La organización agrega `"account_credit"` (saldo a favor) en el detalle.

**POS (`/api/pos/v1`, el dueño):**

- `GET consumption` agrega `"quotas": [{"module", "module_name", "unit", "unit_name", "included", "used", "credits",
  "overage", "on_exhausted"}]`, `"recharge_packs": [{"key", "name", "module", "unit", "quantity", "price"}]` (los del
  cliente) y `"account_credit"`. Las `lines` pueden traer ajustes de prorrateo (negativos o positivos).
- `POST recharges` con `{"pack": "<key>"}` → `{"charge": {…}}` (cuenta de recarga pendiente, con `kind: "recarga"`).
- `GET recharges` → `{"recharges": [{"id", "pack", "name", "quantity", "price", "state", "created_at", "paid_at"}]}`.

**Servicio interno para canales:** `tenancy.usage.consume(org, restaurant, module, unit, quantity=1, key=…)` →
`{"allowed", "source": "incluido" | "recarga" | "excedente", "remaining_included", "credits"}`; con `bloquear` y nada
disponible lanza `quota_exhausted` (402).

## Pruebas que deben existir (`# Falla si …`)

- Falla si un cliente Estándar no sigue un cambio de la lista desde el periodo siguiente, o si uno Personalizado cambia.
- Falla si una organización actual cambia de precio al migrar.
- Falla si el precio especial de una excepción no se cobra, o se cobra dos veces con el estándar.
- Falla si el consumo no usa primero lo incluido, luego recargas (más antigua primero) y luego excedente.
- Falla si con `bloquear` se permite consumir sin saldo, o con `cobrar` el excedente no aparece en la cuenta.
- Falla si una recarga da saldo antes de pagarse, o una anulada da saldo, o un reintento gasta dos veces.
- Falla si lo incluido se acumula de un mes a otro, o una recarga vence.
- Falla si un local creado o desactivado a mitad de mes no se ajusta por días en la cuenta siguiente.
- Falla si una cuenta queda en negativo en vez de pasar la diferencia a saldo a favor, o si el saldo no se aplica.
- Falla si `pagos_en_linea` exige el menú cuando el asistente de WhatsApp está activo, o si sin Salón se puede pedir
  desde la mesa.
- Falla si alguien que no administra la plataforma cambia precios o da cortesías, o si un dueño ve las recargas de
  otra organización.

## Estado

- 2026-10-03: plan escrito. Nada implementado.
