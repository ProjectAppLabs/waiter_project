"""Cliente mínimo de la API de nube de WhatsApp (Meta) para Waiter.

Uso:
    from whatsapp.client import WhatsAppClient
    wa = WhatsAppClient.from_settings()
    wa.send_template("573004771554", "hello_world", "en_US")
    wa.send_text("573004771554", "Hola desde Waiter")  # solo dentro de la ventana de 24 h
"""
from __future__ import annotations

from django.conf import settings
from tenancy.http import Problem
from dataclasses import dataclass, field
from typing import Any

import requests


ERRORS = {
    190: 'El token de WhatsApp venció o no es válido. Vuelve a conectar la cuenta.',
    131030: 'El destinatario no está permitido para el número de prueba.',
    131047: 'La ventana de 24 horas terminó. Envía una plantilla.',
    132001: 'La plantilla no existe en el idioma indicado.',
}


class WhatsAppError(Problem):
    """Error seguro: nunca conserva respuestas que puedan contener credenciales."""

    def __init__(self, code=None):
        self.code = code if type(code) is int else None
        self.message = ERRORS.get(self.code, 'No pudimos completar la operación con WhatsApp. Inténtalo de nuevo.')
        super().__init__('window_closed' if code == 131047 else 'whatsapp_error', self.message, 502)
        Exception.__init__(self, self.message)


def graph_request(method, path, *, token='', params=None, body=None, version=None, timeout=15):
    try:
        response = getattr(requests, method)(
            f'https://graph.facebook.com/{version or settings.WA_GRAPH_VERSION}/{path}',
            headers={'Authorization': f'Bearer {token}'} if token else {},
            timeout=timeout, allow_redirects=False, **({'params': params} if params is not None else {}),
            **({'json': body} if body is not None else {}),
        )
        data = response.json()
    except (requests.RequestException, ValueError):
        raise WhatsAppError() from None
    if not isinstance(data, dict):
        raise WhatsAppError()
    if response.status_code >= 400 or 'error' in data:
        error = data.get('error')
        raise WhatsAppError(error.get('code') if isinstance(error, dict) else None)
    return data


@dataclass
class WhatsAppClient:
    access_token: str = field(repr=False)
    phone_number_id: str
    graph_version: str = "v25.0"
    timeout: float = 15.0

    @classmethod
    def from_settings(cls) -> "WhatsAppClient":
        return cls(
            access_token=settings.WA_ACCESS_TOKEN,
            phone_number_id=settings.WA_PHONE_NUMBER_ID,
            graph_version=settings.WA_GRAPH_VERSION,
        )

    # ------------------------------------------------------------------ base
    @property
    def _messages_url(self) -> str:
        return f"https://graph.facebook.com/{self.graph_version}/{self.phone_number_id}/messages"

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        if not self.access_token or not self.phone_number_id:
            raise Problem('whatsapp_not_configured', 'Falta configurar el token y el identificador del número de WhatsApp.', 503)
        return graph_request('post', f'{self.phone_number_id}/messages', token=self.access_token, body=body, version=self.graph_version, timeout=self.timeout)

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

    def send_location_request(self, to: str, body: str):
        return self._post({'messaging_product': 'whatsapp', 'recipient_type': 'individual',
            'to': self.normalize_number(to), 'type': 'interactive', 'interactive': {
                'type': 'location_request_message', 'body': {'text': body}, 'action': {'name': 'send_location'}}})

    def send_buttons(self, to: str, body: str, options):
        return self._post({'messaging_product': 'whatsapp', 'recipient_type': 'individual',
            'to': self.normalize_number(to), 'type': 'interactive', 'interactive': {'type': 'button',
                'body': {'text': body}, 'action': {'buttons': [{'type': 'reply', 'reply': {
                    'id': option['value'], 'title': option['label']}} for option in options[:3]]}}})

    def mark_as_read(self, message_id: str) -> dict[str, Any]:
        """Marca un mensaje entrante como leído (doble check azul)."""
        return self._post(
            {"messaging_product": "whatsapp", "status": "read", "message_id": message_id}
        )

    @staticmethod
    def message_id(response: dict[str, Any]) -> str | None:
        """Extrae el wamid del mensaje enviado (útil para cruzar con los estados del webhook)."""
        msgs = response.get("messages") or []
        return msgs[0].get("id") if isinstance(msgs, list) and msgs and isinstance(msgs[0], dict) else None
