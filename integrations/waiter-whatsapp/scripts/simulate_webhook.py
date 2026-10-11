"""Simula a Meta llamando a tu webhook local, con firma válida. No necesita internet ni ngrok.

    uvicorn examples.fastapi_app:app --port 8000      # en otra terminal
    python -m scripts.simulate_webhook                 # verifica GET y envía un mensaje entrante falso
    python -m scripts.simulate_webhook --url http://localhost:8000/webhooks/whatsapp --text "Quiero reservar"
"""
import argparse
import json
import os
import time

import requests
from dotenv import load_dotenv

from whatsapp import sign


def sample_payload(from_number: str, text: str, phone_number_id: str) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": os.environ.get("WA_WABA_ID", "0"),
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15556331020",
                                "phone_number_id": phone_number_id,
                            },
                            "contacts": [{"profile": {"name": "Cliente de prueba"}, "wa_id": from_number}],
                            "messages": [
                                {
                                    "from": from_number,
                                    "id": f"wamid.SIMULADO{int(time.time())}",
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def main() -> None:
    load_dotenv()
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://localhost:8000/webhooks/whatsapp")
    p.add_argument("--from-number", default="573004771554")
    p.add_argument("--text", default="Hola Waiter (simulado)")
    a = p.parse_args()

    # 1) Verificación GET
    r = requests.get(
        a.url,
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": os.environ["WA_VERIFY_TOKEN"],
            "hub.challenge": "12345",
        },
        timeout=10,
    )
    print("GET verificación:", r.status_code, r.text, "(esperado: 200 12345)")

    # 2) POST firmado
    body = json.dumps(
        sample_payload(a.from_number, a.text, os.environ.get("WA_PHONE_NUMBER_ID", "0"))
    ).encode()
    r = requests.post(
        a.url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sign(body, os.environ["META_APP_SECRET"]),
        },
        timeout=10,
    )
    print("POST evento:", r.status_code, "(esperado: 200)")


if __name__ == "__main__":
    main()
