from dataclasses import replace
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from experience_app.models import DinerAccount, DinerFavorite
from experience_app.services.sessions import open_session
from experience_app.tests.conftest import TABLE
from experience_app.plantillas import services
from experience_app.plantillas.seed import seed

pytestmark = pytest.mark.django_db


def client_for(name='Ana'):
    _, diner = open_session(TABLE, None)
    diner.account = DinerAccount.objects.create(organization_slug='burger-house', name=name, email=f'{name}@example.com', verified=True)
    diner.save()
    client = APIClient()
    client.cookies['waiter_diner'] = diner.key
    return client, diner


# Falla si los favoritos se pierden, se duplican o se filtran a otra cuenta.
def test_favorites_persist_are_idempotent_and_private(catalog_stub):
    a, ana = client_for()
    b, _ = client_for('Beto')
    detail = reverse('account-favorite', args=['burger-house', 'poblado', 3])
    listing = reverse('account-favorites', args=['burger-house', 'poblado'])
    with patch('experience_app.adapters.core.pos.resolve', return_value=TABLE):
        assert a.put(detail).json() == {'favoritos': [3]}
        assert a.put(detail).json() == {'favoritos': [3]}
        assert DinerFavorite.objects.count() == 1
        fresh = APIClient()
        fresh.cookies['waiter_diner'] = ana.key
        assert fresh.get(listing).json() == {'favoritos': [3]}
        assert b.get(listing).json() == {'favoritos': []}
        assert b.delete(detail).json() == {'favoritos': []}
        assert a.get(listing).json() == {'favoritos': [3]}
        assert a.put(reverse('account-favorite', args=['burger-house', 'poblado', 999])).status_code == 400
        assert a.delete(detail).json() == {'favoritos': []}
        assert a.delete(detail).json() == {'favoritos': []}


# Falla si los favoritos no requieren cuenta o se pierden al cambiar de sede.
def test_favorites_require_account_and_are_shared_between_venues(catalog_stub):
    a, diner = client_for()
    with patch('experience_app.adapters.core.pos.resolve', return_value=TABLE):
        a.put(reverse('account-favorite', args=['burger-house', 'poblado', 3]))
    with patch('experience_app.adapters.core.pos.resolve', return_value=replace(TABLE, venue_slug='otra')):
        assert a.get(reverse('account-favorites', args=['burger-house', 'otra'])).json() == {'favoritos': [3]}
    assert a.get(reverse('account-favorites', args=['otra-organizacion', 'centro'])).status_code == 403
    diner.account = None
    diner.save()
    assert a.get(reverse('account-favorites', args=['burger-house', 'poblado'])).status_code == 401
    assert APIClient().get(reverse('account-favorites', args=['burger-house', 'poblado'])).status_code == 404


# Falla si guardar el diseño pierde la marca o crea otro diseño activo.
def test_single_design_and_branding_survive_save():
    seed()
    assert [p['codigo'] for p in services.catalog_view()['plantillas']] == ['S1']
    old = services.MenuTemplate.objects.get(code='B1')
    services.VenueMenuSettings.objects.create(restaurant_slug='old', venue_slug='venue', template=old)
    spec, palette, typography = services._spec_for('old', 'venue')
    assert spec['codigo'] == 'S1' and palette == {} and typography == {}
    services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'acento': '#234567', 'tintaTerciaria': '#FFAA22'}, 'tipografia': {'display': 'DM Sans'}})
    spec, palette, typography = services._spec_for('burger-house', 'poblado')
    resolved = services.build(spec, {'color': '#CC0000', 'fuente': 'Lora', 'radio': 4}, palette, typography, 5)
    assert resolved['tokens']['acento'] == '#234567'
    assert resolved['tokens']['tintaTerciaria'] == '#FFAA22'
    assert resolved['tokens']['displayFont'] == 'DM Sans'
    assert resolved['tokens']['cuerpoFont'] == 'Mulish'
    assert resolved['tokens']['radioTarjeta'] == 16
    with pytest.raises(services.InvalidSettings):
        services.save('burger-house', 'poblado', {'plantilla': 'B1'})
    with pytest.raises(services.InvalidSettings):
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'superficie': '#32324D'}})


# Falla si el perfil acepta datos inválidos, pierde cambios o modifica otra cuenta.
def test_profile_edit_is_validated_persistent_and_scoped_to_cookie():
    client, diner = client_for()
    _, other = client_for('Beto')
    url = reverse('account-profile')
    response = client.patch(url, {'nombre': 'Ana María', 'celular': '+57 300 1234567', 'novedades': True}, format='json')
    assert response.status_code == 200
    diner.account.refresh_from_db()
    other.account.refresh_from_db()
    assert diner.account.name == 'Ana María'
    assert diner.account.marketing is True
    assert other.account.name == 'Beto'
    assert client.get(url).json()['cuenta']['celular'] == '+57 300 1234567'
    for payload in [{'nombre': ''}, {'novedades': 'false'}, {'correo': 'other@example.com'}, {'id': str(other.account_id)}, {'nombre': 'Changed', 'celular': 'invalid'}]:
        assert client.patch(url, payload, format='json').status_code == 400
    diner.account.refresh_from_db()
    assert diner.account.name == 'Ana María'
    assert APIClient().patch(url, {'nombre': 'Guest'}, format='json').status_code == 404


# Falla si la opinión se duplica, se pierde o permite acceso a otra persona.
def test_feedback_persists_is_idempotent_and_excludes_other_diners():
    from experience_app.models import CartLine, DinerFeedback, Order
    a, ana = client_for()
    b, _ = client_for('Beto')
    order = Order.objects.create(session=ana.session, state=Order.SENT)
    CartLine.objects.create(session=ana.session, diner=ana, order=order, product_id=3, name='Plato', qty=1, unit_price=10)
    url = reverse('order-feedback', args=[order.id])
    payload = {'rating': 4, 'comment': 'Muy bien', 'dishes': {'3': 5}}
    assert a.put(url, payload, format='json').status_code == 200
    assert a.put(url, payload, format='json').status_code == 200
    assert DinerFeedback.objects.count() == 1
    assert a.get(url).json()['feedback'] == payload
    CartLine.objects.create(session=ana.session, diner=ana, order=order, product_id=3, name='Plato', qty=2, unit_price=10)
    assert a.get(url).json()['items'] == [{'product_id': 3, 'name': 'Plato', 'qty': 3}]
    assert b.get(url).status_code == 404
    assert b.put(url, payload, format='json').status_code == 404
    for patch in [{'rating': True}, {'rating': 6}, {'comment': 'x' * 251}, {'dishes': {'999': 5}}]:
        assert a.put(url, {**payload, **patch}, format='json').status_code == 400


# Falla si cerrar sesión pierde el historial o permite acceder a él sin autenticación.
def test_password_login_preserves_private_history_after_logout():
    from django.contrib.auth.hashers import check_password, make_password
    from django.core.cache import cache
    from experience_app.models import CartLine, Order
    cache.clear()
    a, ana = client_for()
    order = Order.objects.create(session=ana.session, state=Order.SENT)
    CartLine.objects.create(session=ana.session, diner=ana, order=order, product_id=3, name='Plato', qty=1, unit_price=10)
    url = reverse('account-password')
    password = 'Una clave de prueba 42'
    assert a.post(url, {'nueva': password}, format='json').status_code == 403
    ana.account.password = make_password(password)
    ana.account.save(update_fields=['password'])
    ana.account.refresh_from_db()
    assert ana.account.password != password and check_password(password, ana.account.password)
    assert a.post(url, {'actual': 'incorrecta', 'nueva': 'Una clave diferente'}, format='json').status_code == 403
    assert a.post(reverse('account-logout')).status_code == 200
    fresh, other = client_for('Other')
    assert fresh.post(reverse('account-login'), {'correo': 'Ana@example.com', 'clave': 'wrong'}, format='json').status_code == 400
    response = fresh.post(reverse('account-login'), {'correo': 'Ana@example.com', 'clave': password}, format='json')
    assert response.status_code == 200
    assert response.json()['pedidos'][0]['lineas'][0]['nombre'] == 'Plato'
    assert response.json()['pedidos'][0]['total'] == 10
    assert APIClient().post(url, {'nueva': password}, format='json').status_code == 404


# Falla si la recuperación permite reutilizar códigos vencidos o conserva sesiones anteriores.
def test_reset_email_single_use_expiration_and_session_revocation(settings):
    import re
    from django.core import mail
    from django.core.cache import cache
    from experience_app.models import DinerPasswordReset
    settings.DINER_EMAIL_ENABLED = True
    settings.MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    cache.clear()
    a, ana = client_for()
    with patch('experience_app.views.password_reset.resolve', return_value=TABLE):
        response = a.post(reverse('account-reset-request'), {'correo': 'Ana@example.com', 'restaurante': 'burger-house', 'sede': 'poblado'}, format='json')
    assert response.status_code == 200 and len(mail.outbox) == 1
    token = re.search(r'token=([\w-]+)', mail.outbox[0].body).group(1)
    assert token not in DinerPasswordReset.objects.get().token_hash
    payload = {'token': token, 'nueva': 'Otra clave de prueba 52'}
    assert a.post(reverse('account-reset'), payload, format='json').status_code == 200
    assert a.post(reverse('account-reset'), payload, format='json').status_code == 400
    ana.refresh_from_db()
    assert ana.account_id is None
    assert a.post(reverse('account-reset'), {**payload, 'token': 'invalid'}, format='json').status_code == 400

    import hashlib
    from django.utils import timezone
    expired_token = 'expired-token-for-test-only'
    DinerPasswordReset.objects.create(account_id=DinerPasswordReset.objects.first().account_id, token_hash=hashlib.sha256(expired_token.encode()).hexdigest(), expires_at=timezone.now()-timezone.timedelta(seconds=1))
    assert a.post(reverse('account-reset'), {'token': expired_token, 'nueva': 'Another password 42'}, format='json').status_code == 400


# Falla si agregar varios platos deja cambios parciales o acepta precios del cliente.
def test_bundle_is_atomic_and_uses_catalog_prices(catalog_stub):
    from experience_app.models import CartLine
    a, diner = client_for()
    url = reverse('add-bundle', args=[diner.session_id])
    with patch('experience_app.views.sessions.resolve', return_value=TABLE):
        response = a.post(url, {'lineas': [{'producto_id': 3, 'cantidad': 2, 'nota': 'Sin cebolla'}, {'producto_id': 999, 'cantidad': 1}]}, format='json')
        assert response.status_code == 400
        assert CartLine.objects.count() == 0
        response = a.post(url, {'lineas': [{'producto_id': 3, 'cantidad': 2, 'nota': 'Sin cebolla'}, {'producto_id': 3, 'cantidad': 1, 'nota': 'Extra'}]}, format='json')
        assert response.status_code == 201
        assert CartLine.objects.count() == 2
        assert all(line.unit_price > 0 for line in CartLine.objects.all())


# Falla si la cocina pierde la indicación para llevar o se modifica la nota original.
def test_takeaway_is_sent_to_kitchen_without_changing_the_original_note():
    from experience_app.models import CartLine, Order
    from experience_app.services.orders import _to_order_lines
    _, diner = client_for()
    order = Order.objects.create(session=diner.session)
    line = CartLine.objects.create(session=diner.session, diner=diner, product_id=3, name='Plato', qty=1, unit_price=10, note='Sin cebolla', takeaway=True)
    assert _to_order_lines(order, [line])[0].note == 'Para llevar · Sin cebolla'
    line.refresh_from_db()
    assert line.note == 'Sin cebolla'


# Falla si la contraseña no se cifra o las opiniones mezclan sedes.
def test_registration_password_is_hashed_and_rating_totals_are_venue_scoped(catalog_stub):
    from django.contrib.auth.hashers import check_password, make_password
    from django.core.cache import cache
    from experience_app.models import CartLine, Order
    from experience_app.services import account, ratings
    cache.clear()
    _, diner = open_session(TABLE, None)
    payload = {'nombre': 'New Diner', 'correo': 'new@example.com', 'celular': '', 'aceptaDatos': True, 'clave': 'New account password 42'}
    registered = account.register(payload, diner)
    assert registered.password != payload['clave'] and check_password(payload['clave'], registered.password)
    for bad in ['123', '012345678910', 12345678901, 'new@example.com']:
        with pytest.raises(account.InvalidRegistration):
            account.register({**payload, 'clave': bad}, diner)
    account.verify(registered, diner, '123456')
    client = APIClient()
    client.cookies['waiter_diner'] = diner.key
    order = Order.objects.create(session=diner.session, state=Order.SENT)
    CartLine.objects.create(session=diner.session, diner=diner, order=order, product_id=3, name='Plato', qty=1, unit_price=10)
    assert ratings.for_menu('burger-house', 'poblado') == {}
    url = reverse('order-feedback', args=[order.id])
    assert client.put(url, {'rating': 4, 'dishes': {'3': 5}}, format='json').status_code == 200
    assert ratings.for_menu('burger-house', 'poblado') == {3: {'promedio': 5.0, 'cantidad': 1}}
    assert ratings.for_menu('burger-house', 'otra') == {}
    assert client.put(url, {'rating': 4, 'dishes': {'3': 3}}, format='json').status_code == 200
    assert ratings.for_menu('burger-house', 'poblado') == {3: {'promedio': 3.0, 'cantidad': 1}}


# Falla si el cambio de contraseña envía el código a un correo elegido por el cliente.
def test_password_change_sends_verification_to_authenticated_email(settings):
    import re
    from django.core import mail
    from django.core.cache import cache
    from django.contrib.auth.hashers import check_password
    settings.DINER_EMAIL_ENABLED = True
    settings.MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    cache.clear()
    client, diner = client_for()
    original = diner.account.password
    with patch('experience_app.views.password_reset.resolve', return_value=TABLE):
        response = client.post(reverse('account-password'), {'correo': 'attacker@example.com'}, format='json')
    assert response.status_code == 200
    assert mail.outbox[-1].to == ['Ana@example.com']
    diner.account.refresh_from_db()
    assert diner.account.password == original
    token = re.search(r'token=([\w-]+)', mail.outbox[-1].body).group(1)
    assert client.post(reverse('account-reset'), {'token': token, 'nueva': 'Verificada por correo 42'}, format='json').status_code == 200
    diner.account.refresh_from_db()
    assert check_password('Verificada por correo 42', diner.account.password)


# Falla si desactivar el correo permite cambiar la contraseña sin verificar.
def test_password_change_disabled_email_cannot_bypass_verification(settings):
    settings.DINER_EMAIL_ENABLED = False
    client, diner = client_for()
    original = diner.account.password
    assert client.post(reverse('account-password'), {}, format='json').status_code == 503
    assert client.post(reverse('account-password'), {'nueva': 'No debe guardarse 42'}, format='json').status_code == 403
    diner.account.refresh_from_db()
    assert diner.account.password == original


# Falla si los alérgenos se exponen a otra cuenta o no se pueden editar y borrar.
def test_profile_allergens_are_private_editable_and_clearable():
    client, diner = client_for()
    _, other = client_for('Otro')
    url = reverse('account-profile')
    response = client.patch(url, {'alergenos': 'Maní y mariscos'}, format='json')
    assert response.status_code == 200 and response.json()['cuenta']['alergenos'] == 'Maní y mariscos'
    other.account.refresh_from_db()
    assert other.account.allergens == ''
    assert client.patch(url, {'alergenos': ['Maní']}, format='json').status_code == 400
    assert client.patch(url, {'alergenos': 'x'*501}, format='json').status_code == 400
    assert client.patch(url, {'alergenos': ''}, format='json').json()['cuenta']['alergenos'] == ''
