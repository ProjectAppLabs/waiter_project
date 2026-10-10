import json
from datetime import timedelta
from unittest.mock import Mock

import pytest
from django.utils import timezone

from assistant.models import AssistantProfile, AssistantStanding, AssistantConversationState, AssistantDecisionCache, AssistantTurn
from assistant.profiles import identity
from catalog.models import Product
from experience_app.models import Diner, DinerAccount, TableSession
from tenancy.models import OrganizationAudit, OrganizationModule
from tenancy.tests.helpers import account, organization, pos_client, restaurant
from .conftest import respuesta_voz

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1/assistant'


# Falla si las etiquetas alteran atributos ajenos, se aceptan etiquetas libres o la propuesta se marca revisada.
def test_etiquetas_contrato_y_propuesta(entorno, settings, monkeypatch):
    _, _, _, cliente, plato, _ = entorno
    plato.diner_attributes['ingredientes'] = ['Carne', 'Pan']
    plato.save()
    respuesta = cliente.get(BASE + '/tags')
    assert set(respuesta.json()) == {'vocabulary', 'products'}
    assert len(respuesta.json()['vocabulary']) == 13
    respuesta = cliente.patch(f'{BASE}/tags/{plato.pk}', {'tags': ['picante', 'para_compartir']}, format='json')
    assert respuesta.json()['product']['reviewed'] is True
    plato.refresh_from_db()
    assert plato.diner_attributes['ingredientes'] == ['Carne', 'Pan']
    assert cliente.patch(f'{BASE}/tags/{plato.pk}', {'tags': ['inventada']}, format='json').status_code == 400
    respuesta = cliente.post(BASE + '/tags/propose', {'product_ids': [plato.pk]}, format='json')
    assert respuesta.status_code == 503 and respuesta.json()['error'] == 'assistant_llm_not_configured'
    settings.OPENAI_API_KEY = 'secreto'
    post = Mock(return_value=respuesta_voz(json.dumps({str(plato.pk): ['picante']})))
    monkeypatch.setattr('requests.post', post)
    respuesta = cliente.post(BASE + '/tags/propose', {'product_ids': [plato.pk]}, format='json')
    assert respuesta.status_code == 200 and respuesta.json()['products'][0]['reviewed'] is False
    assert 'Carne' in post.call_args.kwargs['json']['input'][-1]['content']
    assert cliente.get(BASE + '/tags/propose').status_code == 405


# Falla si un empleado, otra organización o un módulo apagado accede a la consola.
def test_permisos_y_aislamiento_consola(entorno):
    org, local, _, cliente, plato, _ = entorno
    ajena = organization('ajena')
    producto = Product.objects.create(organization=ajena, name='Ajeno', kind='dish')
    fila = AssistantStanding.objects.create(organization=ajena, participant='huella', channel='menu')
    assert cliente.patch(f'{BASE}/tags/{producto.pk}', {'tags': []}, format='json').status_code == 404
    assert cliente.post(f'{BASE}/participants/{fila.pk}/lift', {}, format='json').status_code == 404
    assert cliente.post(BASE + '/tags/propose', {'product_ids': [producto.pk]}, format='json').status_code == 404
    assert producto.pk not in [p['id'] for p in cliente.get(BASE + '/tags').json()['products']]
    empleado = account(org, role='waiter', username='mesero', restaurants=[local])
    assert pos_client(empleado).get(BASE + '/tags').status_code == 403
    for modulo in ('asistente_menu', 'asistente_whatsapp'):
        OrganizationModule.objects.update_or_create(organization=org, restaurant=None, key=modulo,
                                                   defaults={'active': False, 'starts': timezone.now()})
    assert cliente.get(BASE + '/tags').status_code == 403


# Falla si quitar una restricción no deja auditoría o el estado publica claves externas.
def test_restricciones_auditoria_y_estado(entorno, settings):
    org, _, _, cliente, _, _ = entorno
    settings.TYPESAFE_API_KEY, settings.OPENAI_API_KEY = 'jev-reservado', 'voz-reservada'
    fila = AssistantStanding.objects.create(organization=org, participant='huella', channel='menu', level='restricted',
                                           until=timezone.now()+timedelta(minutes=30), reason='Fuera de tema')
    assert cliente.get(BASE + '/participants?restricted=1').json()['participants'][0]['id'] == fila.pk
    assert cliente.post(f'{BASE}/participants/{fila.pk}/lift', {}, format='json').json()['participant']['status'] == ''
    assert cliente.get(BASE + '/participants?restricted=1').json()['participants'] == []
    assert OrganizationAudit.objects.filter(entity='assistant.assistantstanding', actor_kind='account').exists()
    respuesta = cliente.get(BASE + '/status')
    assert respuesta.json()['configured'] == {'jev': True, 'voice': True}
    assert 'reservad' not in respuesta.content.decode()


def comensal(org, local, cliente):
    sesion = TableSession.objects.create(restaurant_slug=org.slug, venue_slug=local.slug)
    cuenta = DinerAccount.objects.create(organization_slug=org.slug, name='Ana', email='ana@ejemplo.co', verified=True, allergens='Maní')
    diner = Diner.objects.create(session=sesion, account=cuenta)
    cliente.cookies['waiter_diner'] = diner.key
    return diner, cuenta


# Falla si la memoria se ve desde otra organización, otra persona o queda memoria derivada al borrarla, o si el comensal
# recibe claves sin los nombres de sus gustos y platos.
def test_perfil_privado_y_borrado_completo(entorno):
    org, local, _, cliente, plato, _ = entorno
    diner, cuenta = comensal(org, local, cliente)
    clave, _ = identity('menu', diner, org)
    AssistantProfile.objects.create(organization=org, participant=clave, preferences={'picante': 2}, favorites={str(plato.pk): 1})
    AssistantConversationState.objects.create(restaurant=local, participant=clave, channel='menu', selection=[plato.pk])
    AssistantTurn.objects.create(restaurant=local, participant=clave, channel='menu', route='menu', source='shortcut')
    AssistantDecisionCache.objects.create(restaurant=local, fingerprint='huella', decision={'ruta': 'menu'}, expires_at=timezone.now()+timedelta(minutes=10))
    ruta = f'/api/v1/{org.slug}/{local.slug}/assistant/profile'
    respuesta = cliente.get(ruta).json()
    datos = respuesta['profile']
    assert datos['preferences'] == {'picante': 2} and datos['allergens'] == 'Maní'
    assert respuesta['labels'] == {'preferences': {'picante': 'Picante'}, 'products': {str(plato.pk): plato.name}}
    ajena = organization('ajena')
    otra = restaurant(ajena)
    assert cliente.get(f'/api/v1/{ajena.slug}/{otra.slug}/assistant/profile').status_code == 404
    assert cliente.delete(ruta, HTTP_ORIGIN='https://ajeno.co').status_code == 403
    assert cliente.delete(ruta).json() == {'ok': True}
    assert not AssistantProfile.objects.exists() and not AssistantConversationState.objects.exists()
    assert not AssistantTurn.objects.exists() and not AssistantDecisionCache.objects.exists()
    assert cliente.get(ruta).json()['profile']['preferences'] == {}
    cliente.cookies.clear()
    assert cliente.get(ruta).status_code == 404


# Falla si una propuesta inválida del proveedor deja etiquetas parcialmente guardadas.
def test_propuesta_invalida_es_atomica(entorno, settings, monkeypatch):
    _, _, _, cliente, plato, bebida = entorno
    settings.OPENAI_API_KEY = 'reservada'
    monkeypatch.setattr('requests.post', Mock(return_value=respuesta_voz(json.dumps({str(plato.pk): ['picante'], str(bebida.pk): ['ilegal']}))))
    assert cliente.post(BASE + '/tags/propose', {'product_ids': [plato.pk, bebida.pk]}, format='json').status_code == 503
    plato.refresh_from_db()
    assert plato.diner_attributes['etiquetas_revisadas'] is True


# Falla si dos cuentas de la misma organización pueden leer o borrar la memoria de la otra.
def test_memoria_aislada_entre_cuentas_de_la_misma_organizacion(entorno):
    org, local, _, cliente, _, _ = entorno
    diner, cuenta = comensal(org, local, cliente)
    clave, _ = identity('menu', diner, org)
    AssistantProfile.objects.create(organization=org, participant=clave, preferences={'picante': 9})
    otra = DinerAccount.objects.create(organization_slug=org.slug, name='Luisa', email='luisa@ejemplo.co', verified=True)
    otro = Diner.objects.create(session=diner.session, account=otra)
    cliente.cookies['waiter_diner'] = otro.key
    ruta = f'/api/v1/{org.slug}/{local.slug}/assistant/profile'
    assert cliente.get(ruta).json()['profile']['preferences'] == {}
    assert cliente.delete(ruta).status_code == 200
    assert AssistantProfile.objects.get(participant=clave).preferences == {'picante': 9}
