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
