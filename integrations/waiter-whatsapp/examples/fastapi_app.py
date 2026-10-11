"""Webhook de WhatsApp para Waiter con FastAPI.

Ejecutar en local:
    pip install -r requirements.txt
    uvicorn examples.fastapi_app:app --reload --port 8000
Exponer con HTTPS para que Meta lo alcance:
    ngrok http 8000      (o: cloudflared tunnel --url http://localhost:8000)
URL a registrar en Meta:  https://<tu-tunel>/webhooks/whatsapp
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response

from whatsapp import (
    IncomingMessage,
    StatusUpdate,
    WhatsAppClient,
    parse_events,
    verify_signature,
    verify_subscription,
)

load_dotenv()
log = logging.getLogger("waiter.whatsapp")
logging.basicConfig(level=logging.INFO)

app = FastAPI()
wa = WhatsAppClient.from_env()
VERIFY_TOKEN = os.environ["WA_VERIFY_TOKEN"]
APP_SECRET = os.environ["META_APP_SECRET"]


@app.get("/webhooks/whatsapp")
async def verify(request: Request) -> Response:
    status, body = verify_subscription(request.query_params, VERIFY_TOKEN)
    return Response(content=body, status_code=status, media_type="text/plain")


@app.post("/webhooks/whatsapp")
async def receive(request: Request, background: BackgroundTasks) -> Response:
    raw = await request.body()
    if not verify_signature(raw, request.headers.get("X-Hub-Signature-256"), APP_SECRET):
        log.warning("Firma inválida en webhook de WhatsApp")
        return Response(status_code=401)
    payload = await request.json()
    # Responder 200 rápido; procesar en segundo plano (Meta reintenta si tardas o fallas).
    background.add_task(handle_events, payload)
    return Response(status_code=200)


def handle_events(payload: dict) -> None:
    for event in parse_events(payload):
        if isinstance(event, IncomingMessage):
            log.info("Mensaje de %s (%s): %s", event.from_number, event.profile_name, event.text)
            # TODO Waiter: guardar el mensaje, asociarlo al restaurante (event.phone_number_id)
            #               y al cliente (event.from_number). Evitar duplicados por event.message_id.
            try:
                wa.mark_as_read(event.message_id)
                if event.type == "text":
                    wa.send_text(event.from_number, f"Waiter recibió: {event.text}")  # eco de prueba
            except Exception:  # noqa: BLE001
                log.exception("Error respondiendo a %s", event.from_number)
        elif isinstance(event, StatusUpdate):
            log.info("Estado %s -> %s %s", event.message_id, event.status, event.errors or "")
            # TODO Waiter: actualizar el estado del mensaje enviado (sent/delivered/read/failed).
