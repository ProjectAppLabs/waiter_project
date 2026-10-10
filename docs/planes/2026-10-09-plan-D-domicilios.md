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

### Servidor (Codex)

Implementados los puntos 1–6 en `experience/`. Sin commit ni cambios en las pantallas, despliegue, integraciones o
archivos de entorno. `GOOGLE_MAPS_API_KEY` es opcional; sin ella se conservan GPS, mapa y cotización.

**Archivos.** App nueva `delivery/`: modelos y migración, `coverage.py` (Haversine decimal), `services.py`, `api.py`,
`links.py`, `assistant.py`, `urls.py` y pruebas de contrato/WhatsApp. Ampliaciones en `loyalty/{models,delivery,api,
services,urls}.py` y tres migraciones; `sales/{models,services,reading}.py` y migración; `catalog/{models,api,reading}.py`
y migración del producto de servicio. Integración en `experience_app/adapters/core/{pos,whatsapp}.py`,
`experience_app/services/{orders,sessions,online_payments,agent_chat}.py`, `experience_app/views/{orders,sessions,
payments,context}.py`; `assistant/{engine,evaluator,service,tones}.py`; `whatsapp/{webhook,client,processing,services}.py`;
`tenancy/audit.py`; configuración, registro de rutas y `pytest.ini`.

**Decisiones donde faltaba detalle.**

- `<rest>` identifica la organización. Las rutas nuevas se registran **sin barra final**, como las escribe el contrato;
  las rutas preexistentes del menú conservan su barra. No se cambia automáticamente la sede de una sesión: la sugerida
  aparece dentro de `domicilio.sugerida` y la pantalla puede abrir una visita en esa sede.
- Ajustes iniciales: desactivado, radio 5 km, un tramo hasta 5 km con envío 0, mínimo 0, métodos `['cash']`, nota vacía.
  PUT reemplaza los ajustes completos; `notes` es opcional. Radios y límites usan hasta dos decimales; se admiten
  1–50 tramos estrictamente crecientes. La distancia publicada tiene tres decimales, pero cobertura y tramo se deciden
  antes de redondearla. Empates entre sedes se resuelven por id. `quote(..., subtotal=...)` valida también el mínimo.
- El mínimo es el importe de comida **después de descuentos**, sin envío ni propina. El envío no recibe el descuento
  de primera compra. El producto «Domicilio» usa `kind='service'`, se crea una sola vez bajo bloqueo de organización,
  no aparece en catálogo ni admite edición desde sus rutas, no entra a cocina y nunca requiere inventario.
- Al confirmar quedan fijados dirección, tarifa y método. No se cambia la entrega con PUT después de confirmar; los
  reintentos conservan el pedido y su tarifa. `online` exige prepago; contra entrega llega a cocina con saldo pendiente
  y no ofrece después un pago en línea desde el menú. Se conservan los controles de prepago de pedidos en mesa.
- Teléfono colombiano normalizado `+57…` (celular o fijo con indicativo actual), nombre de hasta 120, dirección de hasta
  300, indicaciones de hasta 200 y etiqueta de hasta 60 caracteres; dirección e indicaciones juntas admiten hasta 500.
  `guardar` y `acepta_datos` son booleanos. `direccion_id` solo puede señalar una dirección propia.
- Autorización de datos versión `2026-10-09`. Las direcciones se consultan por cuenta autenticada o por la cookie que
  autorizó el alta del contacto. **Escribir un teléfono ajeno no concede acceso a sus direcciones**, aunque permita
  atribuir el pedido al contacto normalizado. WhatsApp identifica al titular mediante su conversación. La migración
  consolida teléfonos antiguos repetidos, conserva pedidos y puntos y mantiene las claves de cuenta mediante alias.
  Revocar elimina direcciones y marca la fecha; conserva los pedidos. No se otorga autorización a datos antiguos por
  el solo hecho de migrarlos.
- Búsqueda: cookie de comensal de la organización, 20 intentos por visita y día de la zona horaria de la organización,
  incluidos los fallidos; Google Geocoding restringido a Colombia, hasta cinco resultados. Los datos públicos del
  domicilio llevan `Cache-Control: no-store` y comprobación de `DINER_PUBLIC_URL`.
- Enlace interno: cuerpo `{"conversation_id": 12, "sede": "centro"}` (`sede` opcional), autenticado con la clave
  interna existente `X-Internal-Key`. La firma contiene conversación y nonce exacto, vence en 30 minutos, un enlace
  nuevo invalida el anterior y POST solo se acepta una vez. No se puede seleccionar otra conversación desde el enlace.
  GET no revela el teléfono. Se conserva la ventana de 24 h de WhatsApp y la organización debe seguir disponible.
  Las cuentas de WhatsApp sin sede fija también cotizan domicilios entre todas sus sedes; el resto de conversaciones
  conserva su comportamiento anterior.
- WhatsApp solicita consentimiento con «Acepto» y enlaza a `/<rest>/privacidad`; las pantallas deben disponer de esa
  política. Ofrece la última dirección autorizada como opción y conserva los textos de todos los tratos en
  `assistant/tones.py`. Tras cotizar ofrece la sede del menú para elegir platos y completar el pedido; no se inventa
  un cobro ni una comanda por compartir la ubicación.
- Indicadores: solo pedidos pagados del cliente y la organización, limitados además a sedes accesibles por la cuenta
  del POS. Horas/días en zona local; lunes=0. Frecuencia = días entre primer y último pago / (n−1), null si hay menos
  de dos. Diez productos principales, sin cancelados, componentes ni envío. RFM documentado en `loyalty/delivery.py`:
  recencia 5/4/3/2/1 hasta 7/30/60/90/más días; frecuencia 1/2/3/4/5 para 1/2/3–4/5–9/10+ pedidos; monto 1–5 con
  cortes en 50.000/100.000/250.000/500.000. Sin pedidos, puntajes 0. Segmentos: nuevo (≤1 y ≤30 días o sin pedidos),
  perdido (>90 días), en_riesgo (>60), fiel (≥5 y ≤30); los demás ocasional.

**Respuestas concretas para las pantallas.** Importes, coordenadas y distancias salen como números JSON; identificadores
operativos son enteros y los de visita/pedido del menú son UUID. Los errores nuevos usan `{error, message}` en español.

| Método y ruta | Respuesta |
|---|---|
| `GET /api/pos/v1/delivery/settings` | `{"restaurants":[{"restaurant_id":1,"name":"Centro","has_location":true,"settings":{"enabled":true,"radius_km":5,"tiers":[{"up_to_km":1,"fee":3000},{"up_to_km":5,"fee":6000}],"min_order":10000,"methods":["online","cash","card_on_delivery"],"notes":""}}]}` |
| `PUT /api/pos/v1/delivery/settings/1` | `{"settings":{"enabled":true,"radius_km":5,"tiers":[{"up_to_km":5,"fee":3000}],"min_order":10000,"methods":["cash"],"notes":""}}` |
| `POST /api/v1/<rest>/domicilio/cotizar` | `{"cobertura":true,"sede":{"slug":"centro","nombre":"Centro"},"distancia_km":0.111,"envio":3000,"minimo":10000,"metodos":["online","cash","card_on_delivery"],"nota":""}` |
| La misma, sin cobertura | `{"cobertura":false,"motivo":"fuera_de_zona","recoger":[{"slug":"centro","nombre":"Centro","direccion":"Calle 1, Bogotá"}]}`; `motivo` también puede ser `sin_domicilio`. |
| `POST /api/v1/<rest>/domicilio/buscar` | `{"resultados":[{"texto":"Calle 1, Bogotá","lat":4.65,"lng":-74.05}]}`; sin coincidencias, `[]`. Sin clave: 503 `maps_not_configured`; cupo: 429 `search_limit`; proveedor: 502 `maps_unavailable`. |
| `PUT /api/v1/sesiones/<id>/domicilio` | `{"domicilio":{"lat":4.651,"lng":-74.05,"direccion":"Calle 1 # 2-3","indicaciones":"Portería","telefono":"+573001234567","nombre":"Ana","envio":3000,"distancia_km":0.111,"sede":{"slug":"centro","nombre":"Centro"},"minimo":10000,"metodos":["online","cash","card_on_delivery"],"nota":""},"carrito":{…}}`. Si hay una sede mejor, `domicilio.sugerida={"slug":"cerca","nombre":"Cerca"}`. |
| `GET /api/v1/sesiones/<id>/carrito/` y respuestas con `cart_of` | Conservan `sesion`, `lineas`, `total`, `mio`, `por_comensal`, `descuento`; agregan `envio` y `domicilio` con la forma anterior cuando existe entrega. El total y la parte de quien pidió el domicilio incluyen el envío. |
| `POST /api/v1/sesiones/<id>/confirmar/` | Con `{"metodo_pago":"cash"}` o `card_on_delivery`: 201 `{"pedido":"<uuid>","estado":"enviado","total":23000,"cuenta":{"ok":false,"total":23000,"mio":23000,"porComensal":[{"comensal":"<uuid>","total":23000}],"partes":1,"porParte":23000,"descuento":{…}}}`. Con `online`, misma forma y `estado:"pendiente_pago"`. Reintento: 200 y mismo UUID. |
| `GET /api/v1/<rest>/domicilio/direcciones` | `{"direcciones":[{"id":1,"label":"Casa","text":"Calle 1 # 2-3","details":"Portería","latitude":4.651,"longitude":-74.05,"last_used_at":"<ISO UTC>","created_at":"<ISO UTC>"}]}`; sin autorización o identidad vinculada, `[]`. |
| `DELETE /api/v1/<rest>/domicilio/direcciones/1` | `{"ok":true}`; dirección ajena: 404. |
| `DELETE /api/v1/<rest>/datos` | `{"ok":true}`; elimina direcciones y revoca consentimiento del contacto autenticado. |
| `GET /api/pos/v1/customers/1` | `{"customer":{"id":1,"name":"Ana","phone":"+573001234567","email":"","vat":"","id_type":"CC","street":"","city":"","orders":1,"invoiced":0,"addresses":[<dirección con forma anterior>],"consent":{"active":true,"data_consent_at":"<ISO UTC>","data_consent_channel":"menu","data_consent_version":"2026-10-09","data_consent_revoked_at":null},"insights":{…}}}`. `addresses`, `consent` e `insights` están **dentro de `customer`**. |
| `customer.insights` | `{"orders":1,"total_spent":23000,"avg_ticket":23000,"first_order_at":"<ISO UTC>","last_order_at":"<ISO UTC>","frequency_days":null,"hours":{"0":0,"…":0,"23":0},"weekdays":{"0":0,"…":0,"6":0},"top_products":[{"product_id":1,"name":"Sopa","qty":1}],"channels":{"pos":0,"menu":1,"whatsapp":0},"rfm":{"r":5,"f":1,"m":1,"segment":"nuevo"}}`. `hours` contiene las 24 claves y `weekdays` las siete; las cuentas se asignan a la hora/día efectivos. |
| `POST /api/v1/<rest>/domicilio/enlace` | 201 `{"token":"<firmado>","url":"<DINER_PUBLIC_URL>/<rest>/domicilio/ubicar?token=<firmado>","expires_at":"<ISO UTC>"}`. Solo uso interno. |
| `GET /api/v1/domicilio/ubicar/<token>` | `{"restaurante":"<rest>","sede":{"slug":"centro","nombre":"Centro"},"expires_at":"<ISO UTC>","usado":false}`. |
| `POST /api/v1/domicilio/ubicar/<token>` | `{"ok":true,"cotizacion":{<misma forma de cotizar>}}`; envía la respuesta a la conversación ligada. Repetido: 409 `delivery_link_used`; vencido/alterado: 404 `invalid_delivery_link`. |
| `GET /api/v1/<rest>/<sede>/` y entrada por mesa | Conservan su respuesta y agregan `"domicilio":{"enabled":true,"buscador":false}`; `buscador` depende de la clave opcional. |
| Chat del menú `POST /api/v1/sesiones/<id>/asistente/` | Conserva su sobre y las claves del turno; un pedido de domicilio activo devuelve `"accion":"domicilio"`, texto amable y ninguna línea agregada automáticamente. |
| `GET /api/pos/v1/orders/<id>` y demás lecturas que usan `order_dict` | Conservan `{"order":{…}}` en detalle; el pedido incluye `service:"delivery"`, `customer_id`, `customer_name`, `delivery_address` (dirección + indicaciones), `delivery_phone`, `delivery_lat`, `delivery_lng`, `delivery_details`, `delivery_fee`, `delivery_payment`, `delivery_distance_km`, y `customer:{"id":1,"name":"Ana","phone":"+573001234567"}`. Sin autorización, `customer_id` y `customer.id` son null; el nombre y teléfono operativos siguen en el recibo. `lines` contiene «Domicilio», `total` lo incluye y `paid` indica lo cobrado. |
| `GET /api/v1/sesiones/<id>/pagos/` | Para contra entrega conserva el sobre de pagos con `available:false`; intentar iniciar un pago en línea responde 409. Para `online` conserva el contrato Wompi y el saldo incluye envío. |

Errores de confirmación/entrega: 400 `delivery_required`, `invalid_phone`, `invalid_payment_method`, `minimum_order`,
`consent_required` o `invalid_data`; 409 `delivery_unavailable`, `not_editable` o `address_limit`; 403 `invalid_origin`.
Los ajustes sin coordenadas dan 400 `location_required`. Se conservan los errores existentes de caja cerrada,
autenticación, módulos, organización suspendida y confirmación ocupada.

**Pruebas existentes ajustadas.** El contrato de Jev incluye `domicilio`; la revisión de tonos admite los campos nuevos
(sede, distancia, envío, métodos, política, etiqueta y enlace). Dos pruebas de descuentos/premios ahora identifican
explícitamente su segunda mesa con `table_token='otra-mesa'`: antes creaban accidentalmente una visita sin mesa.
La prueba de canje con otra tarjeta usa ahora otro teléfono, pues representa a otro cliente y el número normalizado
es único por organización. El inventario transversal incorpora GET/PUT de ajustes y GET de cliente. `pytest.ini` incluye las pruebas de `delivery`.

**Validación final:**

- Desde `experience/`, `PYTHON_DOTENV_DISABLED=1 DJANGO_DB_ENGINE=django.db.backends.sqlite3 venv/bin/pytest -q`:
  **2504 aprobadas, 4 omitidas, 0 fallidas**, en 325,55 s. Las cuatro omisiones existentes requieren colación de MySQL
  o bloqueos concurrentes del motor de producción. Incluye **46 casos de domicilios** y el inventario transversal del POS.
- Con las mismas variables, `venv/bin/python manage.py makemigrations --check`: **No changes detected**.
- `python3 ../scripts/calidad/falla_si.py --resumen`: **0 de 2472 pruebas sin «Falla si»**.
- `git diff --check`: sin problemas. Google y Meta probados con `requests` simulado; sin red real, sin levantar
  servidores y sin aplicar migraciones a la base de desarrollo o producción.

### Pantallas e integración (Claude)

- **POS:** color propio de domicilio (`--kit-delivery`, claro y oscuro) en `CashierOrderCard` y `OrderCard`, insignia
  con el método de pago y la dirección; `DeliveryPanel` en el detalle (dirección, indicaciones, teléfono, distancia,
  envío, «Abrir en Google Maps») y «Imprimir recibo de domicilio» (`DeliveryReceiptSheet` en `PrintHost`, mismo
  rodillo térmico que las comandas). Consola → **Domicilios** (`DeliverySettingsView`) por sede. Ficha del cliente con
  `CustomerInsights` (segmento, ticket, frecuencia, día y hora, canal, favoritos, direcciones y autorización).
  `salesBridge.toDelivery` separa las indicaciones que el servidor pega a la dirección («Calle · Apto») y convierte el
  texto decimal a números.
- **Comensal:** sin mesa, «Recoger en el local» o «A domicilio» (solo si `entrada.domicilio.enabled`); `DeliverySheet`
  con GPS, direcciones guardadas, buscador (solo con `buscador`), mapa Leaflet + OpenStreetMap (`LocationPicker`, pin
  CSS), datos de entrega, autorización con enlace a la política y método de pago; contra entrega va a «estado», en
  línea a «pago». «Envío a domicilio» en el resumen. Chat: `accion: "domicilio"` → «Pedir a domicilio». Páginas
  `/<rest>/domicilio/ubicar?token=` (enlace de WhatsApp) y `/<rest>/privacidad` (política, versión 2026-10-09). En Mi
  perfil, «Mis direcciones» con borrar y retirar la autorización.
- **Prueba de punta a punta (Burger House):** se ubicaron Poblado (6.2087, −75.5671) y Laureles (6.2447, −75.5946) de
  forma aproximada y se activaron domicilios (radio 4 km, $4.000 hasta 2 km y $6.500 hasta 4 km, mínimo $20.000, los
  tres métodos). La cotización escoge la sede más cercana y responde «fuera_de_zona» lejos. Pedido desde el menú sin
  mesa con efectivo: `DE-001`, total $40.900 con la línea «Domicilio» de $4.000, enviado a cocina, cliente 56 con su
  dirección autorizada. El flujo por WhatsApp quedó probado con Meta simulado (no se envió a un teléfono real).
- **Mapa como las apps de transporte (2026-10-09):** el pin queda fijo en el centro y se mueve el mapa; se levanta
  al arrastrar y cae con un rebote al soltar (respeta «reducir movimiento»). Dirección en las dos direcciones: al
  asentarse el pin, `POST /api/v1/<rest>/domicilio/direccion {lat, lng}` → `{texto}` muestra la dirección aproximada y
  llena el campo (salvo que el cliente haya escrito la suya); escribir la dirección y dar Enter (o salir del campo)
  lleva el mapa hasta allá. `delivery/geocoding.py`: Google con `GOOGLE_MAPS_API_KEY`; si no, Nominatim de
  OpenStreetMap (gratis) con su política: una consulta por segundo para todo el servidor, User-Agent de Waiter, caché
  de 24 h y búsqueda limitada a ~25 km de la sede. Límites por visita y día: 20 búsquedas y 150 lecturas del pin
  (`SearchUsage.reverses`). `entrada.domicilio.buscador` es verdadero con cualquiera de los dos proveedores.
  Nota: la caché y el turno de Nominatim usan la caché de Django; con varios procesos en producción conviene Redis.
- **Sugerencias al escribir la dirección y confirmación (2026-10-09):** `POST /api/v1/<rest>/domicilio/sugerencias
  {texto}` → `{sugerencias: [{titulo, detalle, lat, lng}]}` (calle y número o lugar conocido arriba; barrio y ciudad
  abajo). Sin clave de Google usa **Photon** (OpenStreetMap, hecho para autocompletar; la política de Nominatim lo
  prohíbe), limitado a ~25 km de la sede, una sugerencia por calle y barrio, sin lugares para adultos ni de otro país;
  caché de 24 h y 300 por visita y día (`SearchUsage.suggests`). En el comensal, `AddressAutocomplete` (combobox con
  flechas y Enter) en la hoja del pedido y en el mapa del chat. Al confirmar la ubicación en el chat: «✓ Te lo llevamos
  a <dirección>» (con GPS se busca la dirección aproximada), sede, distancia y envío, y «¡Listo! Continuemos con tu
  pedido: ¿qué te gustaría ordenar?» con las categorías como botones (el núcleo responde al nombre exacto de una
  categoría con sus platos). La hoja del pedido también muestra «✓ Te lo llevamos a …» al cotizar.
- **Google Places con el menor gasto (2026-10-09):** con `GOOGLE_MAPS_API_KEY`, las sugerencias usan Places API
  (New) Autocomplete con **token de sesión** (lo genera el comensal por búsqueda): las sugerencias no se cobran y solo
  se paga `POST /api/v1/<rest>/domicilio/lugar {place_id, sesion}` → `{lat, lng, texto, place_id}` (Place Details
  Essentials, máscara `location,formattedAddress`, ~USD 5 por 1.000; 10.000 gratis al mes en la cuenta de ProjectApp).
  Nada de Google va a caché (sus términos solo permiten conservar el `place_id`, que se guarda en
  `CustomerAddress.place_id`); el punto guardado es el del pin que deja el cliente. La dirección aproximada del pin va
  siempre por OpenStreetMap, aunque haya clave. Direcciones guardadas, WhatsApp y GPS no gastan Google: solo cuesta la
  primera vez que un cliente escribe una dirección nueva (~$20 pesos).
- **Mapa propio y Google activo (2026-10-10):** el mapa pasa de Leaflet con mosaicos de imagen de tile.openstreetmap.org
  (no personalizables y no aptos para producción) a **MapLibre + Protomaps** (vectorial, datos de OpenStreetMap):
  `diner/public/mapas/medellin.pmtiles` (recorte del Valle de Aburrá, 12 MB, zoom 15; no va a git) y el trabajador de
  MapLibre copiado al instalar (`scripts/mapas/copiar-trabajador.cjs`). Para regenerar o ampliar la región:
  `pmtiles extract https://build.protomaps.com/<AAAAMMDD>.pmtiles colombia.pmtiles --bbox=-79.1,-4.3,-66.8,13.4` y
  `NEXT_PUBLIC_MAP_TILES` con su ruta. Letras e íconos desde protomaps.github.io (se pueden servir propios después).
  Estilo en `diner/lib/domain/mapTheme.ts`: variante `mapa` del sistema de diseño (marca, claro, oscuro, gris; esquema,
  inventario, catálogo del comensal y página viva), etiquetas a 4.5:1 y pin a 3:1 en todos los casos (las de Protomaps
  por defecto no cumplían), sin restaurantes, cafés ni bares. El MCP lo lista y valida (`test_mapa.py`); el verificador
  del navegador agrega la pantalla «domicilio» (375 y 1024 px) y `mapCheck` (paleta publicada en `data-mapa-*`, mapa no
  vacío, pin centrado, dirección visible); además toma un plato real de la carta en vez del id fijo 41. Verificación
  completa sobre Burger House: sin problemas.
- Google Places quedó activo (`GOOGLE_MAPS_API_KEY`): «Calle 10 # 43-12» cae en la puerta, encuentra lugares por nombre
  (Parque Lleras, Unicentro). Las sugerencias se **restringen** a ~25 km de la sede (antes salían Duitama o Bogotá) y la
  dirección del lugar se limpia de partes repetidas. Si Google falla, las sugerencias siguen con Photon.
- **Una consulta por búsqueda (2026-10-10):** se quitan las sugerencias al escribir (Google cobra las primeras 12
  peticiones de cada sesión cuando se cierra con el detalle más barato). Ahora el cliente escribe la dirección completa y
  toca **Buscar** (o Enter): una sola consulta a la **Geocoding API** (~USD 5 por 1.000, 10.000 gratis al mes) que trae
  dirección y coordenadas; no se repite la misma búsqueda; si hay varias coincidencias se escoge sin otra consulta; lo
  que cae a más de ~30 km de la sede se descarta; el ajuste fino es moviendo el mapa (gratis) y la dirección del pin
  sale de OpenStreetMap. Si Google falla, busca Nominatim. `delivery.MapsUsage` cuenta las consultas pagas por
  organización, día y tipo; `manage.py consumo_mapas [--dias 30]` las resume con su costo sin cuota gratis. Las rutas de
  sugerencias y lugar quedan en el servidor por si se vuelven a usar, pero el comensal ya no las llama.
- **Colombia completa y puntos de referencia (2026-10-10):** el mapa usa `public/mapas/colombia.pmtiles` (recorte de
  Colombia, 918 MB, zoom 15; `diner/scripts/mapas/descargar.sh [colombia|medellin]` lo descarga o actualiza; no va a
  git). La capa de lugares muestra **puntos de referencia** para ubicar la entrega, por grupos y con color legible
  (`REFERENCE_GROUPS` en `mapTheme.ts`): salud (droguerías, clínicas, hospitales), compras (supermercados, tiendas,
  centros comerciales), servicios (bancos, cajeros, gasolineras, hoteles, mensajería), comunidad (colegios, iglesias,
  bibliotecas), transporte, naturaleza y cultura; nunca restaurantes, cafés, bares ni sitios inapropiados. Los colores
  de Protomaps por defecto no cumplían 4.5:1; los nuestros sí (pruebas y `mapCheck` con `data-mapa-lugares`). Sin
  costo: los lugares vienen en los datos del mapa.
- **Sede de prueba en Duitama:** Burger House pasa a 3 sedes (límite del plan de prueba subido a 3) con `duitama`
  (5.8267, −73.0337; copia de Poblado: precios, medios de pago y ajustes; el diseño es de la organización), domicilio
  activo (5 km, $3.000 hasta 2 km y $5.000 hasta 5 km, mínimo $15.000, los tres métodos). Verificación del navegador
  sobre Duitama: sin problemas.
- **Cada sede con su zona y el cliente en la sede correcta (2026-10-10):**
  - La entrada del menú trae `domicilio.centro` y `domicilio.radio_km`; el mapa usa `maxBounds` (radio + 1,5 km) y
    `minZoom` 12: no sale de la zona de entrega ni pide mosaicos de otras ciudades. Un GPS de otra ciudad no arrastra el
    mapa afuera.
  - Al entrar sin mesa (una vez por pestaña, `VenueGuide`) se pide la ubicación; si otra sede le llega y el cliente no
    tiene platos, se le lleva a esa sede con la ubicación puesta y un aviso; si tiene platos, solo se le avisa. La
    portada del restaurante (`/<rest>/`) con varias sedes hace lo mismo y, si ninguna le llega, lo dice. Desde una mesa
    nunca se pide la ubicación.
  - Al calcular el domicilio (hoja del pedido o chat) se cotiza primero: si la dirección la atiende otra sede, sin
    platos se pasa de una; con platos se ofrece «Ir a la sede X» (el pedido empieza de nuevo allá). La ubicación viaja
    entre sedes en `sessionStorage` (`lib/domain/venueRedirect.ts`) y se lee una sola vez.
  - La búsqueda de direcciones mira las zonas de **todas** las sedes con domicilio (antes solo la primera): si la
    dirección existe en dos ciudades con sede, salen ambas para escoger.
  - Producción: servir `colombia.pmtiles` desde un CDN con soporte de rangos y caché; con la zona limitada, cada ciudad
    pide solo sus mosaicos.
