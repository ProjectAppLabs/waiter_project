import json

from whatsapp import IncomingMessage, StatusUpdate, parse_events, sign, verify_signature, verify_subscription
from whatsapp.client import WhatsAppClient

SECRET = "app-secret-de-prueba"


def test_verify_subscription_ok_and_bad():
    ok = {"hub.mode": "subscribe", "hub.verify_token": "abc", "hub.challenge": "99"}
    assert verify_subscription(ok, "abc") == (200, "99")
    assert verify_subscription({**ok, "hub.verify_token": "x"}, "abc")[0] == 403
    assert verify_subscription({}, "abc")[0] == 403


def test_signature_roundtrip_and_tamper():
    body = b'{"a":1}'
    header = sign(body, SECRET)
    assert verify_signature(body, header, SECRET)
    assert not verify_signature(b'{"a":2}', header, SECRET)
    assert not verify_signature(body, None, SECRET)
    assert not verify_signature(body, "md5=abc", SECRET)


def test_parse_message_and_status():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"field": "messages", "value": {
            "metadata": {"phone_number_id": "PNID"},
            "contacts": [{"wa_id": "573004771554", "profile": {"name": "Gus"}}],
            "messages": [{"from": "573004771554", "id": "wamid.1", "timestamp": "1", "type": "text",
                          "text": {"body": "hola"}}],
            "statuses": [{"id": "wamid.0", "recipient_id": "573004771554", "status": "read",
                          "timestamp": "2"}],
        }}]}],
    }
    events = parse_events(json.loads(json.dumps(payload)))
    msg = next(e for e in events if isinstance(e, IncomingMessage))
    st = next(e for e in events if isinstance(e, StatusUpdate))
    assert (msg.text, msg.profile_name, msg.phone_number_id) == ("hola", "Gus", "PNID")
    assert (st.status, st.message_id) == ("read", "wamid.0")


def test_ignores_other_objects():
    assert parse_events({"object": "page"}) == []


def test_normalize_number():
    assert WhatsAppClient.normalize_number("+57 300 477 1554") == "573004771554"
    assert WhatsAppClient.normalize_number("3004771554") == "573004771554"
    assert WhatsAppClient.normalize_number("1 (555) 633-1020") == "15556331020"
