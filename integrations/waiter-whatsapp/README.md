# Waiter × WhatsApp Cloud API: kit de integración (modo prueba)

Este kit sirve para que el backend de Waiter (Python) **envíe** y **reciba** mensajes de WhatsApp con el número de prueba de Meta, mientras se aprueban la verificación de la empresa y la revisión de la app.

## Qué hay en Meta

| Elemento | Valor / ubicación |
|---|---|
| App | **Waiter**, ID 1825282295557750, en modo desarrollo |
| Portafolio | Paginaswebscolombia_ (SOFTPROJECTAPPCO), verificación enviada |
| Número remitente de prueba | +1 555 633 1020 |
| Destinatarios de prueba | +57 300 477 1554 (máximo 5 en total) |
| `WA_PHONE_NUMBER_ID` y `WA_WABA_ID` | Casos de uso → WhatsApp → Personalizar → **Paso 1. Probar** |
| `META_APP_SECRET` | Configuración de la app → Información básica → Clave secreta → Mostrar |
| `WA_ACCESS_TOKEN` | Usuario del sistema **Waiter API** (ver abajo); no vence |
| Webhook | Pendiente: se configura cuando exista la URL pública |

## Estructura

```
whatsapp/client.py        # envío: plantillas, texto, marcar como leído
whatsapp/webhook.py       # verificación GET, firma HMAC, parseo de eventos
examples/fastapi_app.py   # webhook listo con FastAPI
examples/django_views.py  # misma lógica para Django
scripts/send_test.py      # enviar hello_world o texto desde la terminal
scripts/simulate_webhook.py  # simula a Meta llamando a tu webhook (con firma válida)
tests/test_webhook.py     # pytest
```

## Paso a paso

### 1. Instalar y configurar

```bash
pip install -r requirements.txt
cp .env.example .env      # y completa los valores
python -c "import secrets; print(secrets.token_urlsafe(32))"   # -> WA_VERIFY_TOKEN
```

### 2. Probar el envío

```bash
python -m scripts.send_test 3004771554            # te llega "Hello World"
```

Responde a ese mensaje desde tu WhatsApp. Así se abre la **ventana de 24 h** y ya puedes enviar texto libre:

```bash
python -m scripts.send_test 3004771554 --text "Hola desde Waiter"
```

### 3. Levantar el webhook en local

```bash
uvicorn examples.fastapi_app:app --reload --port 8000
python -m scripts.simulate_webhook        # prueba local: GET 200 + POST 200, sin Meta
```

### 4. Conectar el webhook real

1. Expón tu local con HTTPS: `ngrok http 8000` o `cloudflared tunnel --url http://localhost:8000`.
2. En Meta ve a Casos de uso → WhatsApp → Personalizar → **Configuración** → Webhook:
   - **URL de devolución de llamada:** `https://<tu-tunel>/webhooks/whatsapp`
   - **Token de verificación:** el mismo `WA_VERIFY_TOKEN`
   - Pulsa **Verificar y guardar** y luego **Suscribir** al campo **`messages`**.
3. Escribe desde tu WhatsApp al +1 555 633 1020. Debe aparecer en el log de Waiter y llegarte el eco «Waiter recibió: …».

Cuando Waiter tenga dominio, cambia la URL del túnel por la definitiva (por ejemplo `https://api.projectapp.co/waiter/webhooks/whatsapp`).

## Reglas que hay que respetar

- **Para iniciar** una conversación solo sirven **plantillas aprobadas** (`hello_world` en pruebas). Las de Waiter, como confirmación de pedido o de reserva, se crean en WhatsApp Manager → Plantillas.
- **Texto libre** solo dentro de las **24 h** siguientes al último mensaje del cliente.
- En modo prueba solo puedes escribir a números agregados y verificados en **Paso 1. Probar → Para** (máximo 5).
- El webhook debe responder **200 en menos de unos segundos**. Procesa en segundo plano, porque Meta reintenta y puede duplicar eventos: deduplica por `message_id`.
- Valida **siempre** la firma `X-Hub-Signature-256` con el cuerpo crudo.
- Nunca subas `.env` ni el token al repositorio.

## Errores comunes

| Código | Causa | Solución |
|---|---|---|
| 190 | Token vencido o inválido | Usa el token del usuario del sistema |
| 131030 | El destinatario no está en la lista de prueba | Agrégalo en Paso 1. Probar → Para |
| 131047 | Pasaron más de 24 h | Envía una plantilla |
| 132001 | La plantilla no existe en ese idioma | Revisa el nombre y el `language` |
| 403 en la verificación GET | El verify token no coincide | Usa el mismo valor en `.env` y en Meta |

## Token permanente (usuario del sistema)

Si hay que regenerarlo: Business Suite → Configuración → Usuarios → **Usuarios del sistema** → **Waiter API** → Asignar activos (app Waiter con control total y la cuenta de WhatsApp con control total) → **Generar token**. Elige la app Waiter, caducidad **Nunca** y los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El token se muestra **una sola vez**: cópialo directo al `.env`.

## Lo que falta para producción

1. Verificación de la empresa aprobada (en curso).
2. Incorporación como **Independent Tech Provider** y **revisión de la app**: acceso avanzado a los 2 permisos y 2 videos.
3. **Embedded Signup**, para que cada restaurante conecte su propio número desde Waiter.
4. Pasar la app a **En producción** y agregar un método de pago en el portafolio.
