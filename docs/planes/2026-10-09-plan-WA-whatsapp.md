# Plan WA · WhatsApp Cloud API en Waiter (primera parte: conexión, mensajes y consola del dueño)

**Fecha:** 2026-10-09 · **Rama:** `feat/09102026-whatsapp` · **Pedido del dueño:** «vamos a trabajar en la integración
de WhatsApp… esto va en el rol del dueño de negocio para que pueda conectar su WhatsApp con solo un botón». Base: el kit
`integrations/waiter-whatsapp/` (léase su `README.md`) y la sección 1 de
[integraciones pendientes](2026-09-28-sprint-integraciones-pendientes.md).

## Estado de Meta

- App **Waiter** (ID 1825282295557750) en modo desarrollo; revisión de la app en curso.
- Usuario del sistema **Waiter API**, token sin vencimiento con `whatsapp_business_messaging` y
  `whatsapp_business_management`. **Pendiente del dueño:** asignarle la cuenta de WhatsApp (WABA) de prueba con control
  total; hoy no tiene ninguna asignada y Meta rechazaría los envíos.
- Número de prueba +1 555 633 1020; único destinatario permitido 573004771554.
- Credenciales en `experience/.env`: `WA_ACCESS_TOKEN`, `WA_GRAPH_VERSION=v25.0`, `WA_VERIFY_TOKEN` (generado).
  **Faltan:** `WA_PHONE_NUMBER_ID`, `WA_WABA_ID`, `META_APP_SECRET` y, para el botón, `META_APP_ID` y
  `WA_SIGNUP_CONFIG_ID` (configuración de «Facebook Login for Business» con la variante de registro integrado).

## Reglas de Meta que el código hace cumplir

- Iniciar una conversación **solo con plantilla** aprobada (en pruebas, `hello_world` en `en_US`).
- Texto libre **solo dentro de las 24 h** siguientes al último mensaje del cliente.
- El webhook valida `X-Hub-Signature-256` con `META_APP_SECRET` sobre el cuerpo crudo, responde 200 enseguida y
  procesa en segundo plano. Meta reintenta: se deduplica por `wamid` y por el id del evento.
- Nunca se imprimen ni se registran el token, el secreto ni el verify token.

## Servidor (app `whatsapp` en experience)

**Modelos** (MySQL 8.4: tokens con `ExactCharField`; «único cuando…» con `tenancy.fields.only_when`):

- `WhatsAppAccount`: organización, local que recibe los pedidos (opcional), `phone_number_id` (único), `waba_id`,
  número visible, nombre verificado, calidad, token cifrado con Fernet (vacío = usa `WA_ACCESS_TOKEN`, número de
  prueba), estado (`connected`, `disconnected`), quién y cuándo lo conectó.
- `WhatsAppConversation`: cuenta, `wa_id` del cliente (único por cuenta), nombre del perfil, `last_inbound_at`
  (ventana de 24 h), creada y actualizada.
- `WhatsAppMessage`: conversación, dirección (`in`, `out`), `wamid` (único cuando existe), tipo, texto, plantilla e
  idioma, estado (`received`, `sent`, `delivered`, `read`, `failed`), código y mensaje de error, fechas de cada
  estado, JSON crudo. Un estado nunca retrocede (un `delivered` tardío no pisa un `read`).
- `WhatsAppWebhookEvent`: cuerpo crudo, recibido, procesado, error, intentos.

**Rutas públicas**
- `GET /webhooks/whatsapp`: verificación (`hub.mode`, `hub.verify_token`, `hub.challenge`) → 200 con el challenge
  o 403.
- `POST /webhooks/whatsapp`: firma válida → guarda el evento y responde `200 {"ok": true}`; firma inválida o sin
  secreto configurado → 403 sin guardar nada. El procesamiento corre en un hilo tras el commit y, como respaldo,
  `manage.py process_whatsapp_events` (cron cada minuto) toma lo pendiente.

**Procesamiento**: mensajes entrantes → conversación y mensaje (`received`), `last_inbound_at`, marcar como leído;
estados → actualizan el mensaje saliente por `wamid`. Un `phone_number_id` sin cuenta conectada se registra y se
ignora. El asistente de IA se conecta en la segunda parte (gancho `on_incoming_message`).

**Servicio de envío** (`whatsapp/services.py`): `send_template`, `send_text` (falla con `window_closed` si pasaron
24 h), `send_order_confirmation(order)` (por ahora `hello_world`). Cada envío queda como mensaje saliente con su
`wamid`; los errores de Meta se traducen a mensajes en español (190 token, 131030 destinatario no permitido, 131047
ventana cerrada, 132001 plantilla inexistente).

**API de la consola del dueño** (`/api/pos/v1/whatsapp…`, solo dueño, módulo `asistente_whatsapp`):
- `GET whatsapp` → `{"account": {"phone", "name", "quality", "status", "connected_at", "test_number": bool} | null,
  "signup": {"app_id", "config_id", "graph_version"} | null, "recent": [conversaciones con último mensaje]}`.
- `POST whatsapp/connect {"code", "waba_id", "phone_number_id"}` → registro integrado: cambia el código por el token
  del negocio, suscribe la app a la WABA, registra el número para la API (PIN de dos pasos) y guarda la cuenta.
- `POST whatsapp/disconnect` → desuscribe y marca `disconnected`.
- `POST whatsapp/test {"to"}` → envía `hello_world` al número (en modo prueba, solo a los permitidos).
- `GET whatsapp/conversations/<id>` → mensajes con su estado.
- `POST whatsapp/conversations/<id>/reply {"text"}` → texto libre dentro de la ventana.

**Comandos**: `whatsapp_send_test <número> [--text …]`, `whatsapp_simulate_webhook [--url …] [--text …]` (firma con
el secreto local), `whatsapp_connect_test --org <slug> [--restaurant <id>]` (vincula el número de prueba de `.env` a
una organización) y `process_whatsapp_events`.

## Consola del dueño (POS)

Página **WhatsApp** en el grupo «Clientes y marca» (módulo `asistente_whatsapp`): estado de la conexión, botón
**«Conectar WhatsApp»** (SDK de Facebook con la configuración de registro integrado; deshabilitado con explicación si
faltan `META_APP_ID` o la configuración), «Desconectar», envío de prueba y conversaciones recientes con sus mensajes y
estados, y respuesta de texto dentro de la ventana de 24 h.

## Pruebas que deben existir (`# Falla si …`)

- Falla si la verificación acepta un token equivocado, si un POST sin firma o con firma alterada se guarda, o si el
  webhook tarda en responder porque procesa dentro de la petición.
- Falla si un evento repetido crea dos mensajes, si un estado viejo pisa uno más nuevo, o si un mensaje de un número
  no conectado se asigna a una organización.
- Falla si se envía texto libre fuera de la ventana de 24 h o si un envío no queda registrado con su `wamid`.
- Falla si el token o el secreto aparecen en una respuesta o en el registro, o si otra organización ve las
  conversaciones.
- Falla si `connect` no suscribe la app ni registra el número, o si guarda el token sin cifrar.

## Estado

- 2026-10-09: plan escrito; credenciales parciales en `.env`; kit de Meta en `integrations/waiter-whatsapp/`.

- **Servidor (Codex), 2026-10-09:** implementación en `experience/whatsapp/`: cliente y parser adaptados del kit,
  modelos, migración `0001_cuentas_conversaciones_mensajes_y_eventos`, servicios, webhook público, API del dueño,
  procesamiento en hilo tras el commit y los cuatro comandos. Cambios adicionales: `experience_project/settings.py`,
  `experience_project/urls.py`, `pytest.ini` y escenarios de WhatsApp en la prueba transversal de aislamiento de
  `tenancy/tests/test_isolation_all_routes.py`. Pruebas nuevas en `whatsapp/tests/`. Para ejecutar la suite existente
  con SQLite: `sales/tests/views/test_kitchen_tickets_queries.py` usa las comillas del motor activo;
  `sales/tests/views/test_cash_moves_idempotency.py` y
  `tenancy/tests/services/test_subscriptions_concurrencia.py` marcan cuatro comprobaciones exclusivas de colación
  MySQL/bloqueos de filas para omitirlas cuando el motor no ofrece esas capacidades, conservando sus aserciones.
  - **Decisiones donde faltaba detalle:** una cuenta conectada por organización, conservando el historial de las
    desconectadas; cambiar de número exige desconectar primero. Un número no se puede trasladar a otra organización
    desde esta API. `wamid` y organización conectada usan columnas calculadas e índices únicos, compatibles con MySQL.
    Meta no entrega un identificador único del sobre: `event_id` es SHA-256 del JSON canónico (del cuerpo crudo si
    no es JSON). El cuerpo original siempre se conserva. Los bloqueos y escrituras condicionales serializan
    trabajadores; los estados no retroceden y una entrega/lectura prevalece sobre un fallo tardío.
  - El token y el PIN se cifran con el Fernet de pagos. Un alta que falla después del intercambio conserva las
    credenciales cifradas y el PIN para reintentar; la cuenta nueva permanece desconectada. El PIN se reutiliza al
    reconectar. Un fallo al marcar leído conserva el mensaje y deja pendiente el evento para recuperación. El comando
    procesa hasta 100 eventos por ejecución. El gancho del asistente todavía no produce respuestas automáticas.
  - `WA_TEST_RECIPIENTS` vacío permite arrancar pero bloquea envíos del número de prueba hasta configurar los
    destinatarios. La confirmación de pedido usa `delivery_phone` o el teléfono del cliente y exige una cuenta de su
    organización compatible con el local. `whatsapp_connect_test` vincula sin llamadas a Meta; el simulador usa por
    omisión `http://localhost:8000/webhooks/whatsapp`, admite `--url` y no sigue redirecciones.
  - **Respuestas, sin cambios a las formas fijadas en el plan:** `GET whatsapp` conserva exactamente `account`,
    `signup` y `recent`; sin conexión/configuración devuelve sus valores nulos/lista vacía. Las operaciones que
    necesitan credenciales ausentes devuelven un error en español. Se concretan las respuestas que el plan dejaba
    abiertas: conectar/desconectar → `200 {"account": <misma ficha de GET>}`; prueba/respuesta →
    `200 {"message": <mensaje>}`; detalle → `200 {"conversation": <conversación>, "messages": [...]}`.
    Cada conversación contiene `id`, `wa_id`, `profile_name`, `last_inbound_at`, `created_at`, `updated_at`,
    `window_open` y `last_message` (mensaje o null). `recent` contiene las últimas 50, ordenadas por actualización
    descendente; el detalle incluye todos los mensajes en orden cronológico.
    Cada mensaje contiene `id`, `direction`, `wamid`, `type`, `text`, `template`, `language`, `status`, `error_code`,
    `error_message`, `created_at`, `received_at`, `sent_at`, `delivered_at`, `read_at` y `failed_at`.
    Fechas ISO UTC con `Z`; fechas desconocidas null, textos ausentes vacíos. No se expone JSON crudo ni credenciales.
    Errores con `error` y `message`: `window_closed` local 409; `recipient_not_allowed` 400;
    `whatsapp_disconnected` 409; `whatsapp_not_configured` 503; errores de Meta 502 (131047 también usa
    `window_closed`). Permisos y aislamiento conservan los errores comunes de la API.
  - **Validación final:** `cd experience && PYTHON_DOTENV_DISABLED=1 DJANGO_DB_ENGINE=django.db.backends.sqlite3
    venv/bin/pytest -q`: **2383 correctas, 4 omitidas, ningún fallo**, en 278,04 s. Las cuatro omisiones corresponden
    a pruebas preexistentes que requieren colación MySQL o bloqueos de filas, no disponibles en SQLite; siguen
    habilitadas para el motor correspondiente. Las **50 pruebas nuevas de WhatsApp pasan**, incluida concurrencia
    con conexiones independientes. `manage.py makemigrations --check`: **sin cambios pendientes**; `git diff --check`
    limpio. Todas las llamadas a Meta se simulan con `requests`; no se verificó contra Meta real ni MySQL.
    No se modificaron `.env`, POS, comensal, despliegue ni el kit. Sin commits ni servidores levantados.

- **Integración (Claude), 2026-10-09:**
  - Credenciales completas en `experience/.env` y comprobadas con Meta: token del usuario del sistema (sin vencimiento,
    con acceso al número), `WA_PHONE_NUMBER_ID`, `WA_WABA_ID`, `META_APP_ID`, `WA_SIGNUP_CONFIG_ID`,
    `META_APP_SECRET` (Meta la acepta) y `WA_VERIFY_TOKEN` (el registrado en el webhook de Meta). Envío real de
    `hello_world` al destinatario de prueba aceptado por Meta.
  - Ajustes al servidor de Codex:
    - **Coexistencia** (app WhatsApp Business del celular): `connect` acepta `business_app` y `phone_number_id`
      opcional; sin número, cambia el código una sola vez y busca el número en la WABA, y en coexistencia no vuelve a
      registrar el número.
    - **Tope de 5 intentos** por evento del webhook: un error permanente (lectura que Meta rechaza, cuerpo ilegible)
      deja de reintentarse y queda con su error.
    - `whatsapp_connect_test` guarda el número visible, el nombre y la calidad que informa Meta.
  - Consola del dueño: la capa `lib/services/core/whatsapp.ts` traduce las respuestas del servidor; conectar y
    desconectar recargan el resumen.
  - Probado en local: webhook simulado firmado con la clave real → conversación de Burger House visible en la consola.
  - **Pendiente:** URL pública (túnel o dominio) para registrar el webhook en Meta y recibir mensajes reales; probar el
    botón «Conectar WhatsApp» con la cuenta del dueño (tiene rol en la app); regenerar la clave secreta y el token
    antes de producción, porque quedaron escritos en la conversación; segunda parte: el asistente de IA responde por
    WhatsApp y los pedidos llegan al POS.

