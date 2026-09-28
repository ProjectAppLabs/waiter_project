"""Contrato O2: identidad aislada y diseño compartido por organización."""
from dataclasses import replace
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from experience_app.adapters.registry.client import TenantNotFound
from experience_app.diseno import borradores, decoraciones
from experience_app.mcp import keys
from experience_app.models import DinerAccount, DinerFavorite, DinerReward, Order, CartLine
from experience_app.plantillas import services as templates
from experience_app.services import account, discount, sessions, rewards
from experience_app.tests.conftest import DELIVERY
from experience_app.tests.diseno.test_decoraciones import png, b64


pytestmark = pytest.mark.django_db


def diner_client(tenant):
    _, diner = sessions.open_session(tenant, None)
    client = APIClient()
    client.cookies['waiter_diner'] = diner.key
    return diner, client


def test_same_email_registers_and_logs_in_independently_in_each_organization(settings):
    # Falla si el correo de una organización impide registrarse en otra o permite entrar con su contraseña.
    settings.DINER_DEMO_ENABLED = True
    settings.IS_PRODUCTION = False
    first, one = diner_client(DELIVERY)
    second, two = diner_client(replace(DELIVERY, restaurant_slug='frisby'))
    payload = {'nombre': 'Ana', 'correo': 'ana@example.com', 'aceptaDatos': True, 'clave': 'Primera clave 123'}
    a = account.register(payload, first)
    b = account.register({**payload, 'clave': 'Segunda clave 123'}, second)
    with patch('experience_app.services.rewards.sync_for_diner'):
        account.verify(a, first, '123456')
        account.verify(b, second, '123456')
    assert a.pk != b.pk
    assert (a.organization_slug, b.organization_slug) == ('burger-house', 'frisby')
    assert two.post('/api/v1/cuenta/entrar/', {'correo': payload['correo'], 'clave': payload['clave']}).status_code == 400
    assert one.post('/api/v1/cuenta/entrar/', {'correo': payload['correo'], 'clave': payload['clave']}).json()['cuenta']['id'] == str(a.pk)
    assert two.post('/api/v1/cuenta/entrar/', {'correo': payload['correo'], 'clave': 'Segunda clave 123'}).json()['cuenta']['id'] == str(b.pk)


def test_account_and_discount_follow_organization_when_changing_restaurant():
    # Falla si cambiar de local pierde la cuenta del grupo o si cambiar de organización hereda esa cuenta o su descuento.
    first, _ = diner_client(DELIVERY)
    first.account = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@example.com',
                                               verified=True, phone='3001234567')
    first.save()
    _, sibling = sessions.open_session(replace(DELIVERY, venue_slug='laureles'), first.key)
    _, stranger = sessions.open_session(replace(DELIVERY, restaurant_slug='frisby'), first.key)
    assert sibling.account_id == first.account_id
    assert stranger.account_id is None
    assert discount.claim_keys(first) == discount.claim_keys(sibling)
    assert not set(discount.claim_keys(first)) & set(discount.claim_keys(stranger))


def test_theme_decorations_keys_and_drafts_are_shared_between_restaurants(company_brand_stub):
    # Falla si un restaurante de la organización ve otro tema, galería, clave o borrador.
    with patch('experience_app.services.discount.percent_for', return_value=5), patch('experience_app.services.rewards.actions', return_value=[]):
        row = templates.save('burger-house', 'poblado', {'plantilla': 'S1', 'tema': {'fundamentos': {'densidad': .9}}})
        assert row.venue_slug == ''
        assert templates.resolve_template(DELIVERY) == templates.resolve_template(replace(DELIVERY, venue_slug='laureles'))
        assert templates.settings_view('frisby', 'poblado')['tema']['fundamentos']['densidad'] == 1
        decoration = decoraciones.create('burger-house', 'poblado', 'Hoja', b64(png()))
        assert decoration.venue_slug == ''
        assert decoraciones.get('burger-house', 'laureles', 'hoja').pk == decoration.pk
        assert decoraciones.get('frisby', 'poblado', 'hoja') is None
        key, _ = keys.create('burger-house', 'poblado', 'Diseño')
        assert key.venue_slug == ''
        assert keys.listing('burger-house', 'laureles')[0]['id'] == key.pk
        draft = borradores.create(DELIVERY, templates.settings_view('burger-house', 'poblado')['tema'], key=key)
        assert draft.venue_slug == ''
        assert borradores.get('burger-house', 'laureles', draft.preview_token).pk == draft.pk
        assert '/burger-house/poblado/carta?' in borradores.result(draft)['url']
        with pytest.raises(borradores.InvalidDraft):
            borradores.get('frisby', 'poblado', draft.preview_token)


def test_public_organization_index_has_exact_contract_and_local_addresses(api_client):
    # Falla si la portada publica credenciales, omite restaurantes o usa la dirección legal para todos.
    sibling = replace(DELIVERY, venue_slug='laureles', venue_name='Laureles', odoo=replace(DELIVERY.odoo, pos_config_id=2))
    with patch('experience_app.views.organization.list_restaurants', return_value=[{'slug': 'poblado', 'name': 'Poblado'}, {'slug': 'laureles', 'name': 'Laureles'}]), \
            patch('experience_app.views.organization.resolve', side_effect=[DELIVERY, sibling]), \
            patch('experience_app.views.organization.brand_view', return_value={'nombre': 'Burger House'}), \
            patch('experience_app.views.organization.read_restaurant_location', side_effect=[{'direccion': 'Calle 10'}, {'direccion': 'Carrera 70'}]):
        response = api_client.get('/api/v1/burger-house/')
    assert response.status_code == 200
    assert response.json() == {'organizacion': {'slug': 'burger-house', 'nombre': 'Burger House', 'marca': {'nombre': 'Burger House'}},
                               'restaurantes': [{'slug': 'poblado', 'nombre': 'Poblado', 'direccion': 'Calle 10'},
                                                {'slug': 'laureles', 'nombre': 'Laureles', 'direccion': 'Carrera 70'}]}
    with patch('experience_app.views.organization.list_restaurants', side_effect=TenantNotFound):
        assert api_client.get('/api/v1/desconocida/').status_code == 404


def test_favorites_rewards_and_history_are_available_across_the_group():
    # Falla si favoritos, premios o historial se pierden al cambiar de restaurante del mismo grupo.
    diner, _ = diner_client(DELIVERY)
    diner.account = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@example.com', verified=True)
    diner.save()
    favorite = DinerFavorite.objects.create(account=diner.account, restaurant_slug='burger-house', venue_slug='poblado', product_id=3)
    prize = DinerReward.objects.create(account=diner.account, restaurant_slug='burger-house', venue_slug='poblado', action='opinion', reward='descuento', percent=10)
    order = Order.objects.create(session=diner.session, state=Order.SENT)
    CartLine.objects.create(session=diner.session, diner=diner, account=diner.account, order=order, product_id=3, name='Plato', qty=1, unit_price=10)
    assert favorite.venue_slug == prize.venue_slug == ''
    assert len(rewards.view(replace(DELIVERY, venue_slug='laureles'), diner.account)['beneficios']) == 1
    assert rewards.view(replace(DELIVERY, restaurant_slug='frisby'), diner.account)['beneficios'] == []
    assert account.history(diner.account)[0]['id'] == str(order.pk)


def test_password_recovery_uses_cookie_organization_and_rejects_foreign_token(settings):
    # Falla si los slugs enviados por el navegador recuperan la cuenta de otra organización.
    from experience_app.models import DinerPasswordReset
    settings.DINER_EMAIL_ENABLED = True
    first, one = diner_client(DELIVERY)
    second, two = diner_client(replace(DELIVERY, restaurant_slug='frisby'))
    for organization in ('burger-house', 'frisby'):
        DinerAccount.objects.create(organization_slug=organization, name='Ana', email='ana@example.com', verified=True,
                                    password=make_password('Una clave inicial 123'))
    with patch('experience_app.views.password_reset.resolve', return_value=DELIVERY) as resolve, \
            patch('experience_app.views.password_reset.send_mail'), \
            patch('experience_app.views.password_reset.secrets.token_urlsafe', return_value='token-de-prueba'):
        response = one.post('/api/v1/cuenta/recuperar/', {'correo': 'ana@example.com', 'restaurante': 'frisby', 'sede': 'otra'})
    assert response.status_code == 200
    resolve.assert_called_once_with('burger-house', 'poblado')
    assert DinerPasswordReset.objects.get().account.organization_slug == 'burger-house'
    assert two.post('/api/v1/cuenta/restablecer/', {'token': 'token-de-prueba', 'nueva': 'Una nueva clave 123'}).status_code == 400
