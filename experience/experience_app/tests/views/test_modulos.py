"""Módulos del comensal y finalización de operaciones comprometidas."""
from unittest.mock import patch
from uuid import uuid4

import pytest

from experience_app.models import DinerAccount, DinerReward, Order
from experience_app.services import online_payments, rewards
from experience_app.tests.views.test_online_payments import configuration, setup, attempt
from tenancy.models import Restaurant, UsageRecord
from tenancy.modules import set_module

pytestmark = pytest.mark.django_db


# Falla si el menú publica el chat apagado o el endpoint todavía llama al modelo.
def test_chat_apagado_y_configuracion(api_client, table_tenant, catalog_stub, two_diners):
    local = Restaurant.objects.get(pk=1)
    sesion, ana, _ = two_diners
    api_client.cookies['waiter_diner'] = ana.key
    set_module(None, local.organization, 'asistente_menu', False, local)
    respuesta = api_client.get('/api/v1/burger-house/poblado/')
    assert respuesta.status_code == 200
    assert 'asistente_menu' not in respuesta.json()['modulos']
    with patch('experience_app.services.waiter_agent.propose') as modelo:
        respuesta = api_client.post(f'/api/v1/sesiones/{sesion.pk}/asistente/', {'id': str(uuid4()), 'mensaje': 'Hola'}, format='json')
    assert respuesta.status_code == 403 and respuesta.json()['module'] == 'asistente_menu'
    modelo.assert_not_called()


# Falla si el mensaje respondido o sus tokens se cuentan dos veces al repetir el UUID.
def test_medicion_chat_y_tokens(api_client, two_diners, settings):
    from experience_app.services import agent_chat
    from unittest.mock import Mock
    from assistant.evaluator import JevEvaluator
    settings.TYPESAFE_API_KEY = 'prueba'
    settings.OPENAI_API_KEY = ''
    evaluador = JevEvaluator()
    evaluador.usage = {'input_tokens': 12, 'output_tokens': 8}
    evaluador.evaluate = Mock(return_value={'ruta': {'choice': 'menu', 'confidence': .99}})
    chat = agent_chat.conversation('burger-house', 'poblado', 'menu', 'ana')
    clave = uuid4()
    with patch('assistant.engine.JevEvaluator', return_value=evaluador):
        agent_chat.send(chat, clave, 'Una sugerencia diferente', lambda: [])
        agent_chat.send(chat, clave, 'Una sugerencia diferente', lambda: [])
    assert evaluador.evaluate.call_count == 1
    assert UsageRecord.objects.get(unit='mensaje_ia').quantity == 1
    assert UsageRecord.objects.get(unit='tokens_ia').quantity == 20
    detalle = UsageRecord.objects.get(unit='tokens_ia').detail
    assert detalle['input_tokens'] == 12 and detalle['output_tokens'] == 8
    assert detalle['evaluator_version'] == settings.ASSISTANT_JEV_MODEL



# Falla si apagar los módulos impide liberar al POS un pedido ya pagado y consumir su premio reservado.
def test_pago_aprobado_termina_con_modulos_apagados(setup):
    sesion, ana, _, pedido, pasarela = setup
    pasarela.environment = 'prod'
    pasarela.save()
    pedido.requires_payment = True
    pedido.state = Order.CHECKOUT
    pedido.save()
    cuenta = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@ejemplo.co', verified=True)
    premio = DinerReward.objects.create(account=cuenta, restaurant_slug='burger-house', venue_slug='',
        action='opinion', reference='premio', reward='descuento', percent=10, state='reservado', order=pedido)
    pago = attempt(setup, status='APPROVED')
    local = Restaurant.objects.get(pk=1)
    for modulo in ('asistente_menu', 'fidelizacion', 'pagos_en_linea', 'menu_comensal'):
        set_module(None, local.organization, modulo, False, local)
    with patch('experience_app.adapters.core.pos.Client.call_kw', return_value={'paid': True}) as pos:
        online_payments.reconcile(pago)
    pedido.refresh_from_db()
    premio.refresh_from_db()
    assert pago.reconciled and pedido.state == Order.SENT and premio.state == 'usado'
    assert pos.call_args.args[1] == 'waiter_gateway_paid'


# Falla si la solicitud de un código demo no deja una unidad de consumo.
def test_codigo_demo_medido(api_client, two_diners, settings):
    settings.DINER_DEMO_ENABLED = True
    settings.IS_PRODUCTION = False
    _, ana, _ = two_diners
    api_client.cookies['waiter_diner'] = ana.key
    respuesta = api_client.post('/api/v1/cuenta/registro/', {'nombre': 'Ana', 'correo': 'ana@ejemplo.co',
                                                         'celular': '', 'aceptaDatos': True}, format='json')
    assert respuesta.status_code == 201
    fila = UsageRecord.objects.get(module='fidelizacion')
    assert fila.unit == 'codigo_verificacion' and fila.quantity == 1 and fila.restaurant_id == 1


# Falla si sin Salón se abre una sesión de mesa o se impide consultar el menú público.
def test_sin_salon_se_puede_ver_menu_pero_no_abrir_mesa(api_client, table_tenant, catalog_stub):
    local = Restaurant.objects.get(pk=1)
    set_module(None, local.organization, 'salon', False, local)
    assert api_client.get('/api/v1/burger-house/poblado/').status_code == 200
    response = api_client.post('/api/v1/sesiones/', {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}, format='json')
    assert response.status_code == 403 and response.json()['module'] == 'salon'


# Falla si una sesión abierta antes de apagar Salón todavía permite confirmar un pedido desde la mesa.
def test_sesion_de_mesa_existente_respeta_salon(api_client, two_diners):
    session, ana, _ = two_diners
    api_client.cookies['waiter_diner'] = ana.key
    local = Restaurant.objects.get(pk=1)
    set_module(None, local.organization, 'salon', False, local)
    response = api_client.post(f'/api/v1/sesiones/{session.pk}/confirmar/', {}, format='json')
    assert response.status_code == 403 and response.json()['module'] == 'salon'


# Falla si apagar Salón impide abrir una sesión para llevar sin token de mesa.
def test_sesion_para_llevar_sigue_disponible_sin_salon(api_client):
    local = Restaurant.objects.get(pk=1)
    set_module(None, local.organization, 'salon', False, local)
    response = api_client.post('/api/v1/sesiones/', {'restaurante': 'burger-house', 'sede': 'poblado'}, format='json')
    assert response.status_code == 201, response.data
