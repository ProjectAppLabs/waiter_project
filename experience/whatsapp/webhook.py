"""Utilidades del webhook de WhatsApp, independientes del framework.

Meta llama a tu endpoint de dos formas:
  * GET  -> verificación al configurar el webhook (hub.mode, hub.verify_token, hub.challenge)
  * POST -> eventos: mensajes entrantes y estados (sent, delivered, read, failed)

Cada POST trae la cabecera X-Hub-Signature-256 = "sha256=<hmac del cuerpo con el App Secret>".
Valida SIEMPRE la firma con el cuerpo crudo (bytes), antes de parsear el JSON.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Any, Mapping


# ------------------------------------------------------------------ verificación (GET)
def verify_subscription(params: Mapping[str, str], verify_token: str) -> tuple[int, str]:
    """Devuelve (status_code, body) para responder al GET de verificación de Meta."""
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge", "")
    if mode == "subscribe" and token and verify_token and hmac.compare_digest(token.encode(), verify_token.encode()):
        return 200, challenge
    return 403, "Verificación no autorizada."


# ------------------------------------------------------------------ firma (POST)
def verify_signature(raw_body: bytes, signature_header: str | None, app_secret: str) -> bool:
    """True si la cabecera X-Hub-Signature-256 corresponde al cuerpo."""
    if not app_secret or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.split("=", 1)[1].encode(), expected.encode())


def sign(raw_body: bytes, app_secret: str) -> str:
    """Genera la cabecera como lo haría Meta (útil para pruebas locales)."""
    return "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()


# ------------------------------------------------------------------ eventos
@dataclass
class IncomingMessage:
    message_id: str
    from_number: str
    timestamp: str
    type: str
    text: str | None
    profile_name: str | None
    phone_number_id: str
    raw: dict[str, Any] = field(repr=False)


@dataclass
class StatusUpdate:
    message_id: str
    recipient: str
    status: str  # sent | delivered | read | failed
    timestamp: str
    errors: list[dict[str, Any]]
    phone_number_id: str
    raw: dict[str, Any] = field(repr=False)


def parse_events(payload: dict[str, Any]) -> list[IncomingMessage | StatusUpdate]:
    """Convierte el JSON del webhook en una lista de eventos fáciles de manejar."""
    events: list[IncomingMessage | StatusUpdate] = []
    if payload.get("object") != "whatsapp_business_account":
        return events
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})
            pnid = value.get("metadata", {}).get("phone_number_id", "")
            names = {
                c.get("wa_id"): c.get("profile", {}).get("name")
                for c in value.get("contacts", [])
            }
            for m in value.get("messages", []):
                mtype = m.get("type", "unknown")
                text = None
                if mtype == "text":
                    text = m.get("text", {}).get("body")
                elif mtype == "button":
                    text = m.get("button", {}).get("text")
                elif mtype == "interactive":
                    inter = m.get("interactive", {})
                    reply = inter.get("button_reply") or inter.get("list_reply") or {}
                    text = reply.get("title")
                events.append(
                    IncomingMessage(
                        message_id=m.get("id", ""),
                        from_number=m.get("from", ""),
                        timestamp=m.get("timestamp", ""),
                        type=mtype,
                        text=text,
                        profile_name=names.get(m.get("from")),
                        phone_number_id=pnid,
                        raw=m,
                    )
                )
            for s in value.get("statuses", []):
                events.append(
                    StatusUpdate(
                        message_id=s.get("id", ""),
                        recipient=s.get("recipient_id", ""),
                        status=s.get("status", ""),
                        timestamp=s.get("timestamp", ""),
                        errors=s.get("errors", []),
                        phone_number_id=pnid,
                        raw=s,
                    )
                )
    return events
