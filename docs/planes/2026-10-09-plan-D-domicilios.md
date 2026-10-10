# Plan D · Domicilios desde el menú y WhatsApp, cobertura por sede y perfil del cliente

**Fecha:** 2026-10-09 · **Rama:** `feat/09102026-domicilios` (sobre `feat/09102026-asistente`) · **Pedido del dueño:**
el cliente pide el domicilio desde Waiter (no «llame al restaurante»): comparte su ubicación (WhatsApp o GPS) o la ubica
en un mapa, Waiter escoge la sede que le queda mejor y cobra el envío por distancia; el dueño decide los métodos de pago;
con su autorización, el cliente queda en el CRM con sus direcciones y su historial para analizar. En el POS, el
domicilio se ve distinto en caja y tiene recibo con los datos del cliente. **Fuera de alcance:** rol domiciliario.

## Decisiones

- **Ubicación sin escribir direcciones:** WhatsApp entrega latitud y longitud (mensaje `location` o el botón
  «Enviar ubicación»); el menú usa el GPS del celular y un pin en el mapa. Solo una dirección escrita se convierte a
  coordenadas con Google (`GOOGLE_MAPS_API_KEY`, opcional; sin clave, el buscador se oculta y responde 503).
- **Mapa:** Leaflet con teselas de OpenStreetMap (gratis, sin clave). Para el domiciliario, enlace
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`.
- **Cobertura y costo por distancia en línea recta** (Haversine) desde cada sede: radio máximo y tramos que fija el
  dueño. Con varias sedes, la más cercana que cubra; con ninguna, se ofrece recoger.
- **Pagos:** el dueño activa por sede los métodos para domicilio: `online` (Wompi antes de cocinar), `cash` (efectivo
  contra entrega) y `card_on_delivery` (datáfono contra entrega). Al menos uno.
- **El envío es una línea del pedido** con un producto de sistema «Domicilio» por organización (servicio, sin impuestos,
  sin inventario, oculto en carta y POS), para que totales, pagos, devoluciones, recibos e informes lo traten igual.
- **Ley 1581 de 2012:** sin autorización expresa no se guardan direcciones ni perfil; el pedido igual se puede hacer
  (los datos quedan solo en el pedido). La autorización registra fecha, canal y versión de la política, y se revoca.

## Servidor (Codex) — app nueva `delivery` y ampliaciones

1. **Ajustes por sede** (`DeliverySettings`, uno por `tenancy.Restaurant`): `enabled`, `radius_km` (Decimal, >0, ≤50),
   `tiers` (lista ordenada `[{"up_to_km": Decimal, "fee": Decimal}]`, el último ≥ radio), `min_order` (Decimal ≥0),
   `methods` (subconjunto no vacío de `online`, `cash`, `card_on_delivery`), `notes` (texto para el cliente, ≤200).
   Activar exige que la sede tenga `latitude`/`longitude`.
   - `GET /api/pos/v1/delivery/settings` → `{"restaurants": [{"restaurant_id", "name", "has_location", "settings": {…}}]}`.
   - `PUT /api/pos/v1/delivery/settings/<restaurant_id>` con los campos → `{"settings": {…}}`. Solo el dueño; auditado.
2. **Cotización** (`delivery/coverage.py`, `quote(organization, lat, lng, subtotal=None)`): sedes activas con domicilio
   y coordenadas → distancia Haversine → la más cercana dentro de su radio; envío por tramos.
   - `POST /api/v1/<rest>/domicilio/cotizar {"lat", "lng"}` →
     `{"cobertura": true, "sede": {"slug", "nombre"}, "distancia_km", "envio", "minimo", "metodos": [...], "nota"}` o
     `{"cobertura": false, "motivo": "fuera_de_zona"|"sin_domicilio", "recoger": [{"slug", "nombre", "direccion"}]}`.
   - `POST /api/v1/<rest>/domicilio/buscar {"texto"}` → `{"resultados": [{"texto", "lat", "lng"}]}` (máx. 5, Colombia,
     con `GOOGLE_MAPS_API_KEY`; sin clave `503 maps_not_configured`; límite de 20 búsquedas por sesión y día).
3. **Domicilio en la sesión del menú** (sesión sin mesa, ruta `entry-delivery` existente):
   - `PUT /api/v1/sesiones/<id>/domicilio` con `{"lat", "lng", "direccion", "indicaciones", "telefono", "nombre",
     "etiqueta"?, "direccion_id"?, "guardar": bool, "acepta_datos": bool}` → `{"domicilio": {…, "envio", "distancia_km",
     "sede", "metodos"}, "carrito": {…}}`. Valida cobertura **para la sede de la sesión**; si otra sede cubre mejor,
     responde igual con `"sugerida": {"slug", "nombre"}`. Teléfono colombiano obligatorio. Recalcula el envío si cambia.
   - El carrito (`cart_of`) incluye `"envio"` y `"domicilio"` cuando la sesión lo tiene; el total lo suma.
   - `confirmar` acepta `"metodo_pago"` (uno de los activos): `online` sigue el flujo actual de prepago; `cash` o
     `card_on_delivery` envían a cocina sin prepago y dejan el pedido pendiente de cobro en el POS. Exige domicilio
     cotizado y `min_order` cumplido. Crea `sales.Order` con `service='delivery'`, `delivery_address` (dirección +
     indicaciones), `delivery_phone`, la línea «Domicilio», y los campos nuevos de `sales.Order`: `delivery_lat`,
     `delivery_lng`, `delivery_details`, `delivery_fee`, `delivery_payment` (`online`/`cash`/`card_on_delivery`/``),
     `delivery_distance_km`. Enlaza `customer` si hay autorización.
4. **Perfil del cliente (CRM)** en `loyalty`:
   - `CustomerAddress`: `customer`, `label` (Casa, Oficina…), `text`, `details`, `latitude`, `longitude`,
     `last_used_at`, `created_at`. Máximo 10 por cliente.
   - Autorización en `Customer`: `data_consent_at`, `data_consent_channel` (`menu`/`whatsapp`/`pos`),
     `data_consent_version`, `data_consent_revoked_at`. Sin autorización vigente no se crean direcciones.
   - Un solo cliente por organización y teléfono normalizado (`+57…`): el pedido por WhatsApp y la cuenta del menú con
     el mismo celular caen en el mismo `Customer` (respetando `diner_key` existente).
   - Comensal: `GET /api/v1/<rest>/domicilio/direcciones` (sus direcciones, si su cuenta o su teléfono autorizado las
     tiene) y `DELETE …/direcciones/<id>`; revocar la autorización: `DELETE /api/v1/<rest>/datos` (borra direcciones y
     marca la revocación; los pedidos se conservan por ley contable).
   - POS: `GET /api/pos/v1/customers/<id>` agrega `"addresses"`, `"consent"` y `"insights"`:
     `{"orders", "total_spent", "avg_ticket", "first_order_at", "last_order_at", "frequency_days", "hours": {"0".."23": n},
     "weekdays": {"0".."6": n}, "top_products": [{"product_id", "name", "qty"}], "channels": {"pos", "menu", "whatsapp"},
     "rfm": {"r", "f", "m", "segment": "nuevo"|"fiel"|"en_riesgo"|"perdido"|"ocasional"}}` calculado de `sales.Order`
     pagados del cliente (reglas fijas documentadas en el código).
5. **WhatsApp:**
   - `webhook.py` lee los mensajes `location` (`latitude`, `longitude`, `name`, `address`) y los pasa al núcleo como
     `action={"type": "location", "lat", "lng", "address"}`.
   - `client.py`: `send_location_request(to, body)` (mensaje interactivo `location_request_message`) y
     `send_text` existente.
   - Núcleo del asistente (`assistant/engine.py`): ruta `domicilio` por atajo («domicilio», «a domicilio», «que me lo
     traigan», «envío») y por Jev (nueva opción `domicilio` en `ruta`). Si la organización tiene domicilio activo: en
     WhatsApp responde pidiendo la ubicación con el botón y ofrece el enlace «Ubica la entrega» (para otra persona); en
     el menú responde con `accion: "domicilio"` (el comensal muestra el botón «Pedir a domicilio»). Con la ubicación:
     cotiza y responde sede, distancia, envío y métodos (plantillas por tono en `assistant/tones.py`: `delivery_ask`,
     `delivery_quote`, `delivery_out`, `delivery_off`). Si nadie tiene domicilio activo, conserva la respuesta actual.
   - Enlace «Ubica la entrega»: `POST /api/v1/<rest>/domicilio/enlace` (interno del núcleo) crea un token firmado de 30
     min ligado a la conversación; la página del comensal `/<rest>/domicilio/ubicar?token=` usa
     `GET/POST /api/v1/domicilio/ubicar/<token>` (`{"lat","lng","direccion","indicaciones"}`), que cotiza y responde por
     WhatsApp al cliente como si hubiera mandado la ubicación.
   - Con autorización (botón «Acepto» la primera vez, con enlace a la política), la ubicación queda como dirección del
     cliente; el siguiente domicilio ofrece «¿Se lo enviamos a Casa (…)?».
6. **Recibo de domicilio:** `GET /api/pos/v1/orders/<id>` ya trae los campos nuevos (`delivery_*`, cliente con nombre y
   teléfono). Sin cambios de impresión en el servidor.

## Pantallas (Claude)

- **POS, caja y pedidos:** los domicilios con color propio en la tarjeta (`CashierOrderCard`, `OrderCard`) e insignia
  «Domicilio» con el método de pago; en el detalle (`OrderDetailModal`): dirección, indicaciones, teléfono, cliente,
  distancia, envío, «Abrir en Google Maps» y **«Imprimir recibo de domicilio»** (cliente, teléfono, dirección,
  indicaciones, platos, envío, total, método de pago y si ya está pagado).
- **POS, configuración:** «Domicilios» por sede: activar, radio, tramos, pedido mínimo, métodos y nota; aviso si la sede
  no tiene ubicación.
- **POS, clientes:** en la ficha del cliente, direcciones, autorización e indicadores (pedidos, ticket promedio,
  frecuencia, horas y días, platos favoritos, canales y segmento).
- **Comensal:** al entrar sin mesa, «¿Cómo quieres recibir tu pedido?»; hoja de domicilio con «Usar mi ubicación»,
  mapa con pin (Leaflet + OpenStreetMap), buscador si hay clave, direcciones guardadas, indicaciones, nombre, teléfono y
  autorización; el carrito muestra envío y total; el pago muestra solo los métodos activos. En el chat, `accion:
  "domicilio"` muestra «Pedir a domicilio». Página `/<rest>/domicilio/ubicar` para el enlace de WhatsApp.

## Pruebas que deben existir (`# Falla si …`)

- Falla si la cotización escoge una sede que no cubre, ignora la más cercana, cobra un tramo equivocado o acepta
  coordenadas fuera de rango.
- Falla si un domicilio se confirma sin cobertura, sin pedido mínimo o con un método de pago que el dueño no activó, o
  si con `online` llega a cocina sin pagar.
- Falla si el envío no suma al total, a los pagos y al recibo, o si su línea afecta inventario o impuestos.
- Falla si se guardan direcciones sin autorización, si revocarla deja direcciones, o si un cliente de una organización
  se ve en otra.
- Falla si una ubicación de WhatsApp no llega al núcleo, si el enlace «Ubica la entrega» sirve vencido o para otra
  conversación, o si el asistente sigue mandando a llamar al restaurante teniendo domicilio activo.
- Falla si los indicadores del cliente cuentan pedidos no pagados o de otra organización.
- Falla si el domicilio no se distingue en caja o el recibo omite los datos del cliente.

## Estado

- 2026-10-09: plan escrito.
