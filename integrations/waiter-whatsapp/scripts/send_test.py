"""Envía un mensaje de prueba desde el número de prueba de Waiter.

Ejemplos:
    python -m scripts.send_test 3004771554                      # plantilla hello_world
    python -m scripts.send_test 3004771554 --text "Hola"        # texto libre (requiere ventana de 24 h)
"""
import argparse
import json

from dotenv import load_dotenv

from whatsapp import WhatsAppClient, WhatsAppError


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("to", help="Número destino (debe estar en la lista de destinatarios de prueba)")
    parser.add_argument("--text", help="Enviar texto libre en vez de la plantilla")
    parser.add_argument("--template", default="hello_world")
    parser.add_argument("--lang", default="en_US")
    args = parser.parse_args()

    wa = WhatsAppClient.from_env()
    try:
        if args.text:
            resp = wa.send_text(args.to, args.text)
        else:
            resp = wa.send_template(args.to, args.template, args.lang)
    except WhatsAppError as e:
        print("Error de Meta:", e)
        if e.code == 190:
            print("-> El token venció o es inválido. Genera uno nuevo o usa el del usuario del sistema.")
        elif e.code == 131030:
            print("-> El número no está en la lista de destinatarios de prueba (Paso 1. Probar -> Para).")
        elif e.code == 131047:
            print("-> Pasaron más de 24 h desde el último mensaje del cliente: usa una plantilla.")
        raise SystemExit(1)

    print(json.dumps(resp, indent=2))
    print("wamid:", WhatsAppClient.message_id(resp))


if __name__ == "__main__":
    main()
