"""Wompi Colombia direct API; fixed hosts, bounded timeouts, no sensitive response echo."""
import hashlib
import hmac
import html
import re
from urllib.parse import urlsplit

import requests

from .crypto import PaymentUnavailable

METHODS = ['BANCOLOMBIA_TRANSFER', 'BANCOLOMBIA_QR', 'NEQUI', 'CARD']
BASES = {'test': 'https://sandbox.wompi.co/v1', 'prod': 'https://production.wompi.co/v1'}


def api(environment, path, private_key='', payload=None, headers=None):
    try:
        response = requests.request('POST' if payload is not None else 'GET', BASES[environment] + path,
            headers=headers or ({'Authorization': f'Bearer {private_key}'} if private_key else {}),
            json=payload, timeout=(4, 12), allow_redirects=False)
        if response.status_code not in (200, 201):
            raise PaymentUnavailable()
        data = response.json()['data']
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (requests.RequestException, ValueError, KeyError, TypeError):
        raise PaymentUnavailable() from None


def merchant(environment, public_key):
    return api(environment, '/merchants/info', headers={'x-merchant-public-key': public_key})


def signature(reference, amount, secret):
    return hashlib.sha256(f'{reference}{amount}COP{secret}'.encode()).hexdigest()


def create(environment, credentials, attempt, data, return_url):
    method = {'type': attempt.method}
    if attempt.method == 'CARD':
        method.update(token=data['token'], installments=data['installments'])
    elif attempt.method == 'NEQUI':
        method['phone_number'] = data['phone_number']
    else:
        method['payment_description'] = 'Cuenta restaurante'
        if attempt.method == 'BANCOLOMBIA_TRANSFER':
            method.update(user_type='PERSON', ecommerce_url=return_url)
        elif environment == 'test':
            method['sandbox_status'] = 'APPROVED'
    payload = {'amount_in_cents': attempt.amount_in_cents, 'currency': 'COP', 'reference': attempt.reference,
        'signature': signature(attempt.reference, attempt.amount_in_cents, credentials['integrity']),
        'customer_email': data['email'], 'payment_method': method, 'redirect_url': return_url,
        'acceptance_token': data['acceptance_token'], 'accept_personal_auth': data['accept_personal_auth']}
    if attempt.method == 'CARD':
        payload['customer_data'] = {'browser_info': data['browser_info']}
        payload['is_three_ds'] = True
        if environment == 'test':
            payload['three_ds_auth_type'] = 'challenge_v2'
    return api(environment, '/transactions', credentials['private_key'], payload)


def read(environment, credentials, transaction_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', transaction_id):
        raise PaymentUnavailable()
    return api(environment, '/transactions/' + transaction_id, credentials['private_key'])


def verified_event(event, secret):
    try:
        signature_data = event['signature']
        properties = signature_data['properties']
        if not isinstance(properties, list) or not 1 <= len(properties) <= 30 or type(event['timestamp']) is not int:
            return False
        # Accept varying property order/sets; never trust unsigned identity/status/amount.
        if not {'transaction.id', 'transaction.status', 'transaction.amount_in_cents'}.issubset(properties):
            return False
        values = []
        for path in properties:
            value = event['data']
            for segment in path.split('.'):
                value = value[segment]
            if type(value) not in (str, int):
                return False
            values.append(str(value))
        digest = hashlib.sha256((''.join(values) + str(event['timestamp']) + secret).encode()).hexdigest()
        received = signature_data['checksum']
        return isinstance(received, str) and bool(re.fullmatch('[0-9a-fA-F]{64}', received)) and hmac.compare_digest(digest, received.lower())
    except (KeyError, TypeError, AttributeError):
        return False


def safe_extras(data):
    extra = (data.get('payment_method') or {}).get('extra') or {}
    qr = extra.get('qr_image', '')
    if not isinstance(qr, str) or len(qr) > 250000 or not re.fullmatch(r'[A-Za-z0-9+/=\s]*', qr):
        qr = ''
    url = extra.get('async_payment_url', '')
    # Lo que la pasarela mande que no sea texto (un número, una lista) no es un enlace: se descarta como uno inseguro.
    if not isinstance(url, str):
        return qr, ''
    try:
        parsed = urlsplit(url)
        if len(url) > 2048 or parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            url = ''
    except (ValueError, TypeError):
        url = ''
    return qr, url


def challenge(data):
    extra = (data.get('payment_method') or {}).get('extra') or {}
    auth = extra.get('three_ds_auth') or {}
    markup = auth.get('three_ds_method_data', '')
    if not isinstance(markup, str) or len(markup) > 200000 or auth.get('current_step') == 'AUTHENTICATION':
        markup = ''
    brand = extra.get('brand', '')
    return html.unescape(markup), brand if brand in ('MASTERCARD', 'VISA', 'AMEX') else ''
