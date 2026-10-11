from datetime import timedelta
from unittest.mock import Mock

import pytest
from django.utils import timezone

from catalog.models import Category, Product
from tenancy.tests.helpers import account, organization, pos_client, restaurant
from tenancy.models import OrganizationModule


@pytest.fixture(autouse=True)
def sin_red(settings, monkeypatch):
    settings.OPENAI_API_KEY = ''
    settings.TYPESAFE_API_KEY = ''
    settings.WA_AGENT_MODEL = 'modelo-simulado'
    settings.WA_AGENT_REASONING_EFFORT = ''
    settings.WA_AGENT_TEMPERATURE = ''
    settings.ASSISTANT_DAILY_PER_PARTICIPANT = 30
    settings.AGENT_DAILY_LIMIT = 200
    def prohibida(*args, **kwargs):
        raise AssertionError('Se intentó una conexión real.')
    monkeypatch.setattr('requests.sessions.Session.request', prohibida)


@pytest.fixture
def entorno(db):
    org = organization()
    local = restaurant(org)
    owner = account(org)
    client = pos_client(owner)
    OrganizationModule.objects.create(organization=org, key='asistente_whatsapp', active=True, starts=timezone.now())
    plato = Product.objects.create(organization=org, name='Hamburguesa Ángus', kind='dish', price='25000',
        diner_attributes={'etiquetas': ['picante'], 'etiquetas_revisadas': True})
    bebida = Product.objects.create(organization=org, name='Limonada', kind='dish', price='6000',
        diner_attributes={'etiquetas': ['bebida_fria'], 'etiquetas_revisadas': True})
    # Como en la carta del comensal, el asistente solo ve lo que está en alguna categoría.
    carta = Category.objects.create(organization=org, name='Carta')
    plato.categories.add(carta)
    bebida.categories.add(carta)
    return org, local, owner, client, plato, bebida


@pytest.fixture
def reloj(monkeypatch):
    actual = [timezone.now()]
    monkeypatch.setattr('assistant.engine.timezone.now', lambda: actual[0])
    def avanzar(segundos=4):
        actual[0] += timedelta(seconds=segundos)
        return actual[0]
    return avanzar


def respuesta_voz(texto):
    return Mock(status_code=200, json=lambda: {'status': 'completed', 'output': [
        {'type': 'message', 'content': [{'type': 'output_text', 'text': texto}]}],
        'usage': {'input_tokens': 10, 'output_tokens': 4}})
