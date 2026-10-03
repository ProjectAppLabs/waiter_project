# Plan W · Modularización: módulos activables y medición de uso por organización y local

**Fecha:** 2026-10-03 · **Rama sugerida:** `feat/03102026-modularizacion` · **Pedido del dueño:** pasar a un plan
ejecutable la modularización propuesta en el documento 232 del gestor documental de ProjectApp («Waiter —
Modularización del producto», carpeta «Waiter SaaS»). El análisis de cómo modulariza Fudo y la estrategia de precios
están en el documento 231.

## Por qué

La oferta de entrada es un paquete: software completo a COP 150.000 por local al mes y el asistente de WhatsApp a
COP 500 por pedido. Venderlo como paquete no impide separarlo por dentro. Con módulos internos podemos:

- medir lo que cuesta cada capacidad (facturación electrónica, asistente, mensajes de Meta) por organización y local;
- cobrar por uso lo que tiene costo variable sin tocar la mensualidad;
- activar capacidades de forma gradual (pilotos del asistente en pocos locales);
- abrir más adelante un plan de entrada más barato sin reescribir el producto;
- apagar una capacidad sin perder datos.

**Regla de oro:** con el plan `completo`, que es el de todas las organizaciones actuales, **nada cambia para nadie**.
Las fases W1 y W2 deben pasar todas las pruebas existentes sin tocarlas.

## Lo que hay hoy

- `Organization.plan` es texto libre (`'basico'`) que nada consulta. `Organization.monthly_price` es uno por
  organización; `max_restaurants` limita los locales pero no los cobra.
- Los permisos de operación pasan por `sales/policy.py` (`can`, `permit`), con las vistas `VIEWS` y acciones `ACTIONS`.
  El dueño y el encargado pasan siempre. Hay 21 llamadas en `sales`, `kitchen`, `tables`, `reservations` y `loyalty`.
  Otras apps (`catalog`, `inventory`, `billing`, la consola del dueño y el menú del comensal) no pasan por `can`.
- `sales/settings_api.py` (`settings_dict`) entrega al POS la política de roles; el POS la lee en
  `pos/lib/domain/permissions.ts` y `pos/lib/services/core/salesBridge.ts`.
- Los cobros de suscripción (`tenancy/subscriptions.py`, `SubscriptionCharge`) tienen un solo importe por periodo.
- El asistente del menú ya cuenta su uso diario (`AgentDailyUsage`).

## Módulos

Catálogo en código, en `tenancy/modules.py`. Las claves son internas y estables; los nombres, en español.

| Clave | Nombre | Incluye | Vistas de `policy` | Depende de | Unidades de uso |
|---|---|---|---|---|---|
| `nucleo` | Núcleo | Caja, catálogo, ventas, cuadres, historial, equipo, reportes básicos | `dashboard`, `orders`, `history`, `sales` | — | — |
| `salon` | Salón | Mesas, plano, traslado de consumos, cuenta por comensal | `tables` | `nucleo` | — |
| `cocina` | Cocina | KDS y estados de preparación | `kitchen` | `nucleo` | — |
| `inventario` | Inventario | Ingredientes, recetas, existencias, rentabilidad | `inventory` | `nucleo` | — |
| `facturacion` | Facturación electrónica | Factura, documento equivalente POS, notas crédito | `billing` | `nucleo` | `documento` |
| `menu_comensal` | Menú del comensal | Menú QR/NFC, pedido desde la mesa, «Mi pedido» | — | `nucleo` | — |
| `pagos_en_linea` | Pagos en línea | Pago desde el menú y enlaces de pago (Wompi) | — | `nucleo` | — |
| `datafono` | Datáfono integrado | Cobro con Bold | — | `nucleo` | — |
| `fidelizacion` | Fidelización | Cuentas de comensal, puntos, premios, promociones | `customers` | `menu_comensal` | `codigo_verificacion` |
| `reservas` | Reservas | Reservas y su gestión | `reservations` | `nucleo` | — |
| `asistente_menu` | Asistente en el menú | Chat «Habla con tu mesero» y banco de preguntas | — | `menu_comensal` | `mensaje_ia`, `tokens_ia` |
| `asistente_whatsapp` | Asistente de WhatsApp | Pedidos con pago por WhatsApp | — | `nucleo`, `pagos_en_linea` | `pedido_asistente`, `conversacion_sin_compra`, `mensaje_meta`, `tokens_ia` |
| `multisucursal` | Varios locales | Más de un local y vista consolidada del dueño | — | `nucleo` | — |

- `nucleo` no se puede apagar.
- `asistente_whatsapp` y `datafono` existen en el catálogo pero ningún plan los activa hasta que el
  [sprint de integraciones](2026-09-28-sprint-integraciones-pendientes.md) los construya.
- Las dependencias son solo las reales. La cuenta por comensal en mesa vive en `salon`; el asistente de WhatsApp no
  necesita `salon` ni `menu_comensal`.

**Plantillas de plan** (también en `tenancy/modules.py`):

- `completo`: todos los módulos menos `asistente_whatsapp` y `datafono`. Es la oferta de COP 150.000.
- `inicial`: reservada, sin usar. Se define solo si el dueño decide abrir un plan de entrada.

## Reglas

- **Resolución de un módulo** para un local: excepción del local → excepción de la organización → plantilla del plan.
  Sin excepciones, manda la plantilla. Así las organizaciones actuales no necesitan filas nuevas.
- **Vigencia:** una excepción con `ends` vencido deja de aplicar y vuelve a mandar la plantilla.
- **Dependencias:** activar un módulo exige sus dependencias activas. Apagar uno del que dependen otros activos se
  rechaza con `409 module_dependency`, nombrando los dependientes.
- **Módulo antes que rol:** un módulo apagado cierra sus vistas y acciones aunque el rol tenga permiso, incluidos el
  dueño y el encargado.
- **Apagar no borra datos.** Las recetas, reservas o puntos quedan guardados y vuelven al reactivar.
- **Lo que no puede quedar a medias se termina:** un pedido ya pagado se libera al POS, una factura en contingencia se
  sigue reintentando y un premio reservado se puede usar, aunque su módulo se apague ese día.
- **Errores claros:** una ruta de un módulo apagado responde `403 module_inactive` con el nombre del módulo, en español.
- **Uso idempotente:** cada unidad de uso tiene una clave única por organización; un reintento no la cuenta dos veces.

## W0 · Inventario contra el código

Sin cambios de comportamiento. Entregable: la tabla «Rutas por módulo» al final de este plan, completa.

- Cada vista de la API del POS (`/api/pos/v1`), de la consola del dueño (`accounts`) y del menú del comensal
  (`experience_app`) queda asignada a un módulo.
- Cada ruta del POS (`pos/app/(pos)/*` y `pos/app/organizacion/*`) queda asignada a un módulo.
- Se anotan las dependencias reales encontradas, y se corrige la tabla de módulos si hace falta.

## W1 · Catálogo y modelo

**Modelos (`tenancy`):**

- `Organization.plan`: pasa a elección entre las plantillas (`completo`, `inicial`). Migración de datos:
  `'basico'` y cualquier otro valor → `completo`.
- `OrganizationModule`: organización, local (opcional), clave del módulo (elección del catálogo), activo, `starts`,
  `ends` (opcional), `limits` (JSON, por ejemplo `{"documento": 3000}`), `price` (opcional), notas, quién y cuándo.
  Única por (organización, local, módulo).

**Servicio (`tenancy/modules.py`):**

- `MODULES`, `PLANS`, `active_modules(org, restaurant=None)`, `is_active(org, key, restaurant=None)` con caché por
  petición.
- `require_module(org, key, restaurant=None)`, que lanza `module_inactive`.
- `set_module(actor, org, key, active, restaurant=None, ends=None, limits=None, price=None)`, que valida dependencias
  y deja auditoría (`PlatformAudit`, acción nueva `module_change`).

## W2 · Verificación en servidor, POS y menú

**Servidor:**

- `sales/policy.py`: `VIEW_MODULES` asigna cada vista a su módulo. `can()` devuelve falso si el módulo de la vista o
  acción está apagado para el local de la cuenta, antes de mirar el rol. Las acciones se asignan así:
  `edit_inventory` → `inventario`, `refund_orders` → `nucleo`, `serve_orders` → `salon`, las demás → `nucleo`.
- `require_module` en las vistas que no pasan por `can`, según la tabla de W0: `catalog` (nucleo), `inventory`,
  `billing`, `reservations`, `loyalty`, rutas de pago y del asistente en `experience_app`, y la creación del segundo
  local en adelante (`multisucursal`).
- `settings_dict` agrega `"modules": [...]` con los módulos activos del local. La sesión de la consola del dueño
  (`accounts`) agrega lo mismo a nivel de organización.
- El menú del comensal recibe en su configuración pública `modules` del local, solo con los que le afectan
  (`menu_comensal`, `pagos_en_linea`, `fidelizacion`, `asistente_menu`).

**POS:**

- `pos/lib/domain/modules.ts`: claves y `hasModule(session, key)`.
- La navegación del POS y de la consola del dueño oculta las secciones de módulos apagados. Si se entra por URL, se
  muestra «Esta función no está activa en tu plan» con el nombre del módulo, sin romper la página.
- La edición de permisos por rol no ofrece vistas de módulos apagados.

**Menú del comensal (`diner/`):** oculta el chat, el pago en línea o el registro de cuenta si su módulo está apagado.

## W3 · Medición de uso

**Modelo (`tenancy`):** `UsageRecord`: organización, local, módulo, unidad, cantidad, periodo (`YYYY-MM` en la zona
horaria de la organización), clave de idempotencia (única por organización, colación exacta), detalle (JSON) y
cuándo.

**Servicio:** `record_usage(org, restaurant, module, unit, quantity=1, key=..., detail=None)` y
`usage_summary(org, period)`.

**Lo que se instrumenta ahora:**

- `facturacion`: cada documento emitido, por tipo (factura, documento equivalente POS, nota crédito), también con el
  proveedor simulado. Clave: el id del documento.
- `asistente_menu`: cada mensaje respondido por el modelo y sus tokens de entrada y salida. Clave: el UUID del
  mensaje que ya usa `agent_chat`.
- `fidelizacion`: cada código de verificación enviado (hoy de demostración, cuenta igual).

**Lo que queda listo para el sprint de integraciones:** las unidades de `asistente_whatsapp` (`pedido_asistente`,
`conversacion_sin_compra`, `mensaje_meta`) existen en el catálogo y `record_usage` las acepta. Se instrumentan cuando
exista el canal. **W3 debe estar hecha antes de lanzar el asistente de WhatsApp y la facturación real**, porque sin
medición no se puede cobrar por pedido ni comprobar el costo por documento.

**Consola de ProjectApp:** `GET /api/platform/v1/organizations/<slug>/usage?period=YYYY-MM` y una tabla de consumo en
la ficha del cliente, en `/plataforma`.

## W4 · Módulos en la consola de ProjectApp

- `GET/PATCH /api/platform/v1/organizations/<slug>/modules` (solo administradores de la plataforma): plan, módulos
  resueltos por local con su origen (plantilla, organización, local) y edición de excepciones.
- Pestaña **Módulos** en la ficha del cliente en `/plataforma`: plantilla del plan, interruptor por módulo y por
  local, vigencia, cupos y precio especial. Muestra el error de dependencias tal como llega.
- Cada cambio queda en la auditoría de la plataforma.

## W5 · Cobro por local y por uso

**Requiere decisión previa del dueño** (ver «Decisiones pendientes»). Propuesta por omisión:

- La mensualidad se calcula como `monthly_price` × locales activos del periodo. `monthly_price` pasa a significar
  precio por local, y se migra dividiendo entre los locales actuales solo si el dueño lo aprueba.
- `SubscriptionCharge` gana líneas (`SubscriptionChargeLine`: concepto, cantidad, precio unitario, total): mensualidad
  por local y, cuando exista, pedidos del asistente a COP 500. El total del cobro es la suma de sus líneas;
  `generate_subscription_charges` arma las líneas desde `UsageRecord`.
- El dueño ve en su consola (`/organizacion`) una sección **Consumo** con lo del mes en curso: locales, pedidos del
  asistente, documentos emitidos y mensajes, para que no haya cobros sorpresa.

## Pruebas que deben existir (`# Falla si …`)

- Falla si una organización migrada de `'basico'` pierde alguna vista, acción o sección que tenía (todo el conjunto de
  pruebas actual pasa sin cambios con `completo`).
- Falla si una vista de un módulo apagado responde datos en lugar de `403 module_inactive`.
- Falla si el dueño o el encargado entran a un módulo apagado porque su rol tiene permiso.
- Falla si la excepción de un local no gana sobre la de la organización, o si una excepción vencida sigue aplicando.
- Falla si se puede apagar un módulo del que depende otro activo, o activar uno sin sus dependencias.
- Falla si apagar un módulo borra sus datos, o si reactivarlo no los devuelve.
- Falla si un pedido pagado no se libera al POS porque su módulo se apagó después del pago.
- Falla si un reintento registra dos veces la misma unidad de uso.
- Falla si el uso de una organización aparece en el resumen de otra.
- Falla si el POS muestra en la navegación una sección de un módulo apagado, o se rompe al entrar a ella por URL.
- Falla si el menú del comensal muestra el chat con `asistente_menu` apagado.
- Falla si un cobro con líneas no suma su total, o si cuenta locales inactivos.
- Falla si alguien que no es administrador de la plataforma cambia módulos o lee el uso de otra organización.

## Rutas por módulo (se completa en W0)

| Módulo | API del POS y del dueño | Menú del comensal | Rutas del POS |
|---|---|---|---|
| `nucleo` | | | |
| `salon` | | | |
| `cocina` | | | |
| `inventario` | | | |
| `facturacion` | | | |
| `menu_comensal` | | | |
| `pagos_en_linea` | | | |
| `fidelizacion` | | | |
| `reservas` | | | |
| `asistente_menu` | | | |
| `multisucursal` | | | |

## Decisiones pendientes del dueño

- **Antes de W5:** ¿la mensualidad se cobra por local desde ya? Afecta a las organizaciones con varios locales.
- **Antes de W2:** ¿los módulos se activan por organización, por local o ambos? El plan soporta ambos; si basta por
  organización, W4 se simplifica.
- ¿Se abre un plan `inicial` más barato? Si sí, qué módulos quedan fuera.
- ¿`asistente_menu` va dentro de la mensualidad o cobra por pedido como el de WhatsApp?
- Política de prorrateo al activar o desactivar a mitad de periodo (hasta decidirla, los cambios no alteran el cobro
  del periodo en curso).
- ¿Los módulos por uso tienen cupo incluido (por ejemplo documentos fiscales) o se cobran desde la primera unidad?

## Estado

- 2026-10-03: plan escrito a partir del documento 232. Nada implementado.
