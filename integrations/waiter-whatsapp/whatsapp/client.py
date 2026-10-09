"""Cliente mínimo de la API de nube de WhatsApp (Meta) para Waiter.

Uso:
    from whatsapp.client import WhatsAppClient
    wa = WhatsAppClient.from_env()
    wa.send_template("573004771554", "hello_world", "en_US")
    wa.send_text("573004771554", "Hola desde Waiter")  # solo dentro de la ventana de 24 h
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests


class WhatsAppError(Exception):
    """Error devuelto por la API de Meta (incluye código y detalle)."""

    def __init__(self, status: int, payload: dict[str, Any]):
        self.status = status
        self.payload = payload
        err = payload.get("error", {}) if isinstance(payload, dict) else {}
        self.code = err.get("code")
        self.subcode = err.get("error_subcode")
        self.message = err.get("message") or str(payload)
        super().__init__(f"[{status}] code={self.code} subcode={self.subcode}: {self.message}")


@dataclass
class WhatsAppClient:
    access_token: str
    phone_number_id: str
    graph_version: str = "v25.0"
    timeout: float = 15.0

    @classmethod
    def from_env(cls) -> "WhatsAppClient":
        return cls(
            access_token=os.environ["WA_ACCESS_TOKEN"],
            phone_number_id=os.environ["WA_PHONE_NUMBER_ID"],
            graph_version=os.environ.get("WA_GRAPH_VERSION", "v25.0"),
        )

    # ------------------------------------------------------------------ base
    @property
    def _messages_url(self) -> str:
        return f"https://graph.facebook.com/{self.graph_version}/{self.phone_number_id}/messages"

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        resp = requests.post(
            self._messages_url,
            json=body,
            headers={"Authorization": f"Bearer {self.access_token}"},
            timeout=self.timeout,
        )
        try:
            data = resp.json()
        except ValueError:
            data = {"raw": resp.text}
        if resp.status_code >= 400:
            raise WhatsAppError(resp.status_code, data)
        return data

    @staticmethod
    def normalize_number(number: str) -> str:
        """Deja solo dígitos con indicativo de país: '+57 300 477 1554' -> '573004771554'."""
        digits = "".join(ch for ch in number if ch.isdigit())
        if len(digits) == 10 and digits.startswith("3"):  # celular colombiano sin indicativo
            digits = "57" + digits
        return digits

    # -------------------------------------------------------------- mensajes
    def send_template(
        self,
        to: str,
        template_name: str,
        language: str = "es",
        body_params: list[str] | None = None,
    ) -> dict[str, Any]:
        """Envía una plantilla aprobada. Es la única forma de INICIAR una conversación."""
        template: dict[str, Any] = {"name": template_name, "language": {"code": language}}
        if body_params:
            template["components"] = [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": p} for p in body_params],
                }
            ]
        return self._post(
            {
                "messaging_product": "whatsapp",
                "to": self.normalize_number(to),
                "type": "template",
                "template": template,
            }
        )

    def send_text(self, to: str, text: str, preview_url: bool = False) -> dict[str, Any]:
        """Texto libre. Solo funciona si el cliente escribió en las últimas 24 h."""
        return self._post(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": self.normalize_number(to),
                "type": "text",
                "text": {"body": text, "preview_url": preview_url},
            }
        )

    def mark_as_read(self, message_id: str) -> dict[str, Any]:
        """Marca un mensaje entrante como leído (doble check azul)."""
        return self._post(
            {"messaging_product": "whatsapp", "status": "read", "message_id": message_id}
        )

    @staticmethod
    def message_id(response: dict[str, Any]) -> str | None:
        """Extrae el wamid del mensaje enviado (útil para cruzar con los estados del webhook)."""
        msgs = response.get("messages") or []
        return msgs[0].get("id") if msgs else None
