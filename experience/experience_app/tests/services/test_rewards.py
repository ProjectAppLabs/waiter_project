"""Contrato N2: concesión, aislamiento, prioridad y consumo de premios reales del servidor."""
from dataclasses import replace
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone

from django.db import OperationalError
from experience_app.adapters.core.pos import PlacedOrder, OrderStatus
from experience_app.models import CartLine, Diner, DinerAccount, DinerFeedback, DinerReward, Order, PaymentAttempt, PaymentGateway, TableSession
from experience_app.services import benefits, discount, online_payments, orders, rewards, sessions
from experience_app.tests.conftest import ANGUS, LIMONADA, TABLE

pytestmark = pytest.mark.django_db
SENT = PlacedOrder(id=13, reference='260-1-1', state='draft', total=87822, tax=14022, paid=0)


def action(key, kind='descuento', **values):
    return {'accion': key, 'premio': {'tipo': kind, **values}}


@pytest.fixture
def rpc():
    configured = []
    grants = []

    def call(model, method, args, kwargs=None):
        if method == 'waiter_benefit_actions':
            return list(configured)
        if method == 'waiter_grant_points':
            grants.append(args)
            return {'tarjeta': 71, 'puntos': args[3], 'otorgados': args[3]}
        if method == 'waiter_diner_benefits':
            return {'tarjeta': 71, 'puntos': sum(g[3] for g in grants), 'ganados': 0}
        if method == 'waiter_coupon_quote':
            return {'codigo': args[1], 'nombre': 'Cupón', 'porcentaje': 20, 'monto': round(args[2] * .2, 2)}
        if method == 'waiter_gateway_paid':
            return {'paid': True}
        raise AssertionError(method)

    with patch('experience_app.adapters.core.pos.Client.call_kw', side_effect=call) as mock, \
            patch('experience_app.services.benefits.tenant_for', return_value=TABLE), \
            patch('experience_app.views.benefits.resolve', return_value=TABLE):
        yield configured, grants, mock


@pytest.fixture
def table(two_diners, catalog_stub, rpc):
    session, ana, beto = two_diners
    account = DinerAccount.objects.create(organization_slug='burger-house', name='Ana', email='ana@example.invalid', verified=True, discount_used_at=timezone.now())
    ana.account = account
    ana.save(update_fields=['account'])
    sessions.add_line(session, ana, ANGUS, 2)
    sessions.add_line(session, beto, LIMONADA, 1)
    return session, ana, beto


@pytest.fixture
def sending():
    with patch('experience_app.services.orders.resolve', return_value=TABLE), \
            patch('experience_app.services.orders.pos.ensure_open_session', return_value=4), \
            patch('experience_app.services.orders.pos.create_order', return_value=SENT) as create, \
            patch('experience_app.services.orders.pos.fire_course'), patch('experience_app.services.orders.pos.set_table_call'):
        yield create


def earned(diner, action_key='opinion', **values):
    defaults = {'account': diner.account, 'restaurant_slug': diner.session.restaurant_slug, 'venue_slug': diner.session.venue_slug,
                'action': action_key, 'reward': 'descuento', 'percent': 15, 'prize_snapshot': {'tipo': 'descuento', 'porcentaje': 15}}
    return DinerReward.objects.create(**{**defaults, **values})


def payment(diner, status='APPROVED', order=None):
    gateway, _ = PaymentGateway.objects.get_or_create(restaurant_slug=diner.session.restaurant_slug,
        venue_slug=diner.session.venue_slug, defaults={'environment': 'prod'})
    order = order or Order.objects.create(session=diner.session, state=Order.SENT, odoo_order_id=13)
    return PaymentAttempt.objects.create(gateway=gateway, session=diner.session, diner=diner, order=order,
        status=status, amount_in_cents=8782200, method='CARD', credentials_cipher='', payment_method_id=1)


def test_actions_cache_is_short_scoped_and_failure_is_empty(rpc):
    # Falla si una caída rompe el menú, se mezclan sedes o cada lectura repite el RPC.
    configured, _, mock = rpc
    configured.append(action('opinion', porcentaje=12))
    assert rewards.actions(TABLE) == configured
    assert rewards.actions(TABLE) == configured
    assert mock.call_count == 1
    other = replace(TABLE, venue_slug='centro')
    with patch.object(cache, 'set', wraps=cache.set) as save:
        rewards.actions(other)
        assert save.call_args.args[2] <= 30
    mock.side_effect = OperationalError('Sin conexión')
    cache.clear()
    assert rewards.actions(TABLE) == []


def test_verification_and_account_discount_keep_the_existing_path(table, rpc):
    # Falla si una cuenta pendiente gana premios o primera compra crea un DinerReward duplicado.
    _, ana, _ = table
    configured, grants, _ = rpc
    configured.extend([action('cuenta', porcentaje=5), action('novedades', 'puntos', puntos=10, programa='Club')])
    ana.account.marketing = True
    ana.account.verified = False
    ana.account.save()
    rewards.sync(TABLE, ana.account)
    assert not DinerReward.objects.exists()
    ana.account.verified = True
    ana.account.save()
    rewards.sync(TABLE, ana.account)
    rewards.sync(TABLE, ana.account)
    assert list(DinerReward.objects.values_list('action', 'state', 'points')) == [('novedades', 'acreditado', 10)]
    assert len(grants) == 1
    assert grants[0][1]['id'] == str(ana.account_id)
    assert grants[0][2] == f'novedades:{ana.account_id}:'


def test_coupon_prize_is_copied_once_and_isolated_by_account_and_venue(table, rpc):
    # Falla si cambiar el POS reescribe un premio concedido o si otra cuenta u organización ve ese premio.
    _, ana, beto = table
    configured, _, _ = rpc
    prize = action('cuenta', 'cupon', codigo='HOLA20', nombre='Bienvenida', porcentaje=20, minimo=10000)
    configured.append(prize)
    rewards.sync(TABLE, ana.account)
    row = DinerReward.objects.get()
    configured[0] = action('cuenta', porcentaje=99)
    cache.clear()
    rewards.sync(TABLE, ana.account)
    row.refresh_from_db()
    assert row.prize_snapshot == prize['premio']
    assert (row.coupon_code, row.percent, row.state) == ('HOLA20', 20, 'disponible')
    other = replace(TABLE, venue_slug='centro')
    assert len(rewards.view(other, ana.account)['beneficios']) == 1
    assert rewards.view(replace(TABLE, restaurant_slug='otra-organizacion'), ana.account)['beneficios'] == []
    beto.account = DinerAccount.objects.create(organization_slug='burger-house', name='Beto', email='beto@example.invalid', verified=True)
    assert rewards.view(TABLE, beto.account)['beneficios'] == []
    with pytest.raises(IntegrityError), transaction.atomic():
        earned(ana, 'cuenta')


def test_opinion_is_once_per_sent_order_and_only_in_its_venue(table, rpc):
    # Falla si editar una opinión o repetirla con otra cookie duplica el premio, o se premian pedidos de otra organización.
    session, ana, beto = table
    rpc[0].append(action('opinion', porcentaje=12))
    order = Order.objects.create(session=session, state=Order.SENT)
    beto.account = ana.account
    beto.save()
    DinerFeedback.objects.create(order=order, diner=ana, rating=1)
    DinerFeedback.objects.create(order=order, diner=beto, rating=5)
    other_session = TableSession.objects.create(restaurant_slug='otra-organizacion', venue_slug='centro')
    other_order = Order.objects.create(session=other_session, state=Order.SENT)
    DinerFeedback.objects.create(order=other_order, diner=ana, rating=4)
    pending = Order.objects.create(session=session, state=Order.CHECKOUT)
    DinerFeedback.objects.create(order=pending, diner=ana, rating=5)
    rewards.sync(TABLE, ana.account)
    DinerFeedback.objects.filter(order=order, diner=ana).update(comment='Una corrección')
    rewards.sync(TABLE, ana.account)
    assert list(DinerReward.objects.values_list('action', 'reference')) == [('opinion', str(order.id))]
    second = Order.objects.create(session=session, state=Order.SENT)
    DinerFeedback.objects.create(order=second, diner=ana, rating=5)
    rewards.sync(TABLE, ana.account)
    assert DinerReward.objects.count() == 2


def test_online_payment_only_approved_payer_and_once_per_account(table, rpc):
    # Falla si un intento pendiente, el pago de otro comensal o una segunda compra conceden el premio.
    session, ana, beto = table
    rpc[0].append(action('pago_en_linea', porcentaje=8))
    attempt = payment(beto, 'PENDING')
    rewards.sync(TABLE, ana.account)
    assert not DinerReward.objects.exists()
    attempt.status = 'APPROVED'
    attempt.save()
    rewards.sync(TABLE, ana.account)
    assert not DinerReward.objects.exists()
    attempt.diner = ana
    attempt.save()
    rewards.sync(TABLE, ana.account)
    other_session = TableSession.objects.create(restaurant_slug=TABLE.restaurant_slug, venue_slug=TABLE.venue_slug)
    another = Diner.objects.create(session=other_session, account=ana.account)
    payment(another)
    rewards.sync(TABLE, ana.account)
    assert list(DinerReward.objects.values_list('action', 'reference')) == [('pago_en_linea', '')]


def test_points_failure_is_pending_and_retry_keeps_original_key_and_amount(table, rpc):
    # Falla si un timeout pierde el premio, muestra puntos no acreditados o reintenta con un importe/clave distinto.
    _, ana, _ = table
    configured, grants, mock = rpc
    configured.append(action('cuenta', 'puntos', puntos=40, programa='Club'))
    original = mock.side_effect
    keys = []

    def unavailable(model, method, args, kwargs=None):
        if method == 'waiter_grant_points':
            keys.append(args)
            raise OperationalError('El resultado remoto es incierto')
        return original(model, method, args, kwargs)

    mock.side_effect = unavailable
    rewards.sync(TABLE, ana.account)
    row = DinerReward.objects.get()
    assert row.state == 'pendiente'
    assert rewards.view(TABLE, ana.account)['beneficios'] == []
    assert rewards.view(TABLE, ana.account)['acciones'][0]['hecha'] is True
    configured.clear()
    cache.clear()
    mock.side_effect = original
    rewards.sync(TABLE, ana.account)
    rewards.sync(TABLE, ana.account)
    row.refresh_from_db()
    assert row.state == 'acreditado' and row.used_at is not None
    assert len(grants) == 1 and grants[0] == keys[0]
    assert row.prize_snapshot == {'tipo': 'puntos', 'puntos': 40, 'programa': 'Club'}


def test_best_discount_only_on_confirming_diner_and_other_prizes_wait(table, rpc, sending):
    # Falla si se acumulan porcentajes, gana el menor o se descuentan las líneas de otro comensal.
    session, ana, beto = table
    smaller = earned(ana, 'novedades', percent=10)
    best = earned(ana, percent=25)
    order, _ = orders.confirm(session, ana)
    assert [(line.name, line.discount) for line in sending.call_args.kwargs['lines']] == [
        (ANGUS.name, 25), (LIMONADA.name, 0)]
    best.refresh_from_db()
    smaller.refresh_from_db()
    assert (best.state, best.order, smaller.state) == ('reservado', order, 'disponible')
    assert best.used_at is None


def test_restricted_reward_is_shared_but_only_spent_in_its_restaurant(table, rpc, sending):
    # Falla si un premio compartido se aplica fuera de los restaurantes permitidos en su concesión.
    session, ana, _ = table
    restricted = earned(ana, percent=25, prize_snapshot={'tipo': 'descuento', 'porcentaje': 25, 'configs': [2]})
    global_reward = earned(ana, 'novedades', percent=10)
    assert [row['id'] for row in rewards.view(TABLE, ana.account)['beneficios']] == [global_reward.pk]
    sibling = replace(TABLE, venue_slug='laureles', restaurant_id=2)
    assert restricted.pk in [row['id'] for row in rewards.view(sibling, ana.account)['beneficios']]
    order, _ = orders.confirm(session, ana)
    restricted.refresh_from_db()
    global_reward.refresh_from_db()
    assert restricted.state == 'disponible'
    assert (global_reward.state, global_reward.order_id) == ('reservado', order.pk)
    assert sending.call_args.kwargs['lines'][0].discount == 10


@pytest.mark.parametrize('coupon,first_purchase,expected', [(True, True, 20), (False, True, 5), (False, False, 25)])
def test_coupon_then_first_purchase_then_action_and_points_always_add(table, rpc, sending, coupon, first_purchase, expected):
    # Falla si cambia la prioridad cupón > primera compra > acción o si un descuento bloquea sumar puntos.
    session, ana, _ = table
    if first_purchase:
        ana.account.discount_used_at = None
        ana.account.save()
    if coupon:
        ana.coupon_code = 'HOLA20'
        ana.save()
    reward = earned(ana, percent=25)
    rpc[0].append(action('cuenta', 'puntos', puntos=10, programa='Club'))
    orders.confirm(session, ana)
    assert sending.call_args.kwargs['lines'][0].discount == expected
    assert sending.call_args.kwargs['lines'][1].discount == 0
    reward.refresh_from_db()
    assert reward.state == ('reservado' if expected == 25 else 'disponible')
    assert DinerReward.objects.get(action='cuenta').state == 'acreditado'
    assert len(rpc[1]) == 1


def test_confirmation_syncs_new_reward_before_reserving(table, rpc, sending):
    # Falla si una acción recién cumplida solo se puede gastar después de abrir la pantalla de recompensas.
    session, ana, _ = table
    ana.account.marketing = True
    ana.account.save()
    rpc[0].append(action('novedades', porcentaje=18))
    orders.confirm(session, ana)
    assert sending.call_args.kwargs['lines'][0].discount == 18
    assert DinerReward.objects.get().state == 'reservado'


# Falla si otra mesa consume el premio reservado tras un resultado incierto.
def test_uncertain_order_reuses_reservation_and_another_session_cannot_spend_it(table, rpc, sending):
    # Falla si un reintento gasta otro premio o una segunda visita consume el premio reservado.
    session, ana, _ = table
    reward = earned(ana)
    sending.side_effect = [OperationalError('Sin respuesta'), SENT, SENT]
    with pytest.raises(OperationalError):
        orders.confirm(session, ana)
    reward.refresh_from_db()
    assert reward.state == 'reservado' and reward.used_at is None
    other_session = TableSession.objects.create(restaurant_slug=TABLE.restaurant_slug, venue_slug=TABLE.venue_slug, table_token='otra-mesa')
    clone = Diner.objects.create(session=other_session, account=ana.account)
    sessions.add_line(other_session, clone, ANGUS, 1)
    orders.confirm(other_session, clone)
    assert sending.call_args.kwargs['lines'][0].discount == 0
    earned(ana, 'novedades', percent=30)
    orders.confirm(session, ana)
    assert sending.call_args.kwargs['lines'][0].discount == 15
    assert DinerReward.objects.get(action='novedades').state == 'disponible'
    reward.refresh_from_db()
    assert reward.state == 'reservado'


@pytest.mark.parametrize('paid_via', ['status', 'online'])
def test_prepayment_keeps_reward_reserved_until_payment(table, rpc, sending, paid_via):
    # Falla si el prepago consume el premio antes de cobrar o no lo consume al conciliar/consultar el pago.
    session, ana, _ = table
    reward = earned(ana)
    order, _ = orders.confirm(session, ana, prepay=True)
    reward.refresh_from_db()
    assert reward.state == 'reservado' and reward.used_at is None
    if paid_via == 'status':
        with patch('experience_app.services.orders.resolve', return_value=TABLE), \
                patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus('paid', 'cooking')):
            orders.status_view(order)
            orders.status_view(order)
    else:
        attempt = payment(ana, order=order)
        with patch('experience_app.services.online_payments.resolve', return_value=TABLE):
            online_payments.reconcile(attempt)
            online_payments.reconcile(attempt)
    reward.refresh_from_db()
    assert reward.state == 'usado' and reward.used_at is not None


def test_coupon_consumes_only_one_matching_account_reward_and_retry_preserves_it(table, rpc):
    # Falla si reservar un cupón consume descuentos, premios de otros códigos o más de una copia al reintentar.
    session, ana, _ = table
    ana.coupon_code = 'HOLA20'
    ana.save()
    first = earned(ana, 'cuenta', reward='cupon', coupon_code='HOLA20')
    second = earned(ana, 'novedades', reward='cupon', coupon_code='HOLA20')
    other = earned(ana, reward='cupon', coupon_code='OTRO')
    order = Order.objects.create(session=session)
    session.lines.update(order=order)
    benefits.reserve(TABLE, list(sessions.open_lines(session)))
    benefits.reserve(TABLE, list(sessions.open_lines(session)))
    first.refresh_from_db()
    second.refresh_from_db()
    other.refresh_from_db()
    assert (first.state, first.order, second.state, other.state) == ('usado', order, 'disponible', 'disponible')


def test_cart_and_bill_project_sync_and_explain_the_action(table, rpc, sending):
    # Falla si carrito/cuenta omiten el premio, no descuentan el importe propio o pierden la acción tras confirmar.
    session, ana, beto = table
    ana.account.marketing = True
    ana.account.save()
    rpc[0].append(action('novedades', porcentaje=15))
    cart = sessions.cart_view(session, ana)
    assert cart['descuento'] == {'porcentaje': 15, 'monto': 13173.3, 'aplicable': True,
                                 'aplicado': False, 'registrado': True, 'accion': 'novedades'}
    assert cart['total'] == 97722
    assert sessions.bill_summary(session, ana, include_open=True)['mio'] == 74648.7
    assert not sessions.cart_view(session, beto)['descuento']['aplicable']
    orders.confirm(session, ana)
    bill = sessions.bill_summary(session, ana)
    assert bill['mio'] == 74648.7
    assert bill['descuento']['accion'] == 'novedades'
    assert bill['descuento']['aplicado'] and not bill['descuento']['aplicable']


def test_rewards_endpoint_keeps_balance_and_adds_exact_contract(table, rpc, api_client):
    # Falla si la API oculta el saldo anterior, publica puntos pendientes o usa una cuenta enviada por el navegador.
    _, ana, _ = table
    rpc[0].extend([action('cuenta', 'cupon', codigo='HOLA20', nombre='Hola', porcentaje=20, minimo=0),
                   action('novedades', porcentaje=10)])
    api_client.cookies['waiter_diner'] = ana.key
    response = api_client.get(reverse('diner-rewards', args=[TABLE.restaurant_slug, TABLE.venue_slug]), {'account': 'otra'})
    assert response.status_code == 200
    body = response.json()
    row = DinerReward.objects.get()
    assert body['tarjeta'] == 71
    assert body['beneficios'] == [{'id': row.id, 'accion': 'cuenta', 'premio': rpc[0][0]['premio'],
                                  'estado': 'disponible', 'fecha': row.created_at.isoformat()}]
    assert body['acciones'] == [{**rpc[0][0], 'hecha': True}, {**rpc[0][1], 'hecha': False}]


def test_template_actions_stay_fresh_even_with_cached_template(table, rpc):
    # Falla si la plantilla pública omite acciones para quien no tiene cuenta o las guarda en una caché más larga.
    from experience_app.plantillas import services
    rpc[0].append(action('cuenta', 'puntos', puntos=10, programa='Club'))
    with patch.object(services, '_resolve_template_sin_sede', return_value={'descuento': {'porcentaje': 0, 'activo': False}}):
        assert services.resolve_template(TABLE)['acciones'] == rpc[0]
        rpc[0].clear()
        cache.clear()
        assert services.resolve_template(TABLE)['acciones'] == []


def test_verifying_account_grants_server_prize_immediately(table, rpc, api_client, settings):
    # Falla si verificar no concede el premio o si datos del navegador deciden sus puntos.
    settings.IS_PRODUCTION = False
    settings.DINER_DEMO_ENABLED = True
    _, ana, _ = table
    ana.account.verified = False
    ana.account.registration_key = ana.key
    ana.account.save()
    rpc[0].append(action('cuenta', 'puntos', puntos=17, programa='Club'))
    api_client.cookies['waiter_diner'] = ana.key
    response = api_client.post(reverse('account-verify'), {'id': str(ana.account_id), 'codigo': '123456', 'points': 999999}, format='json')
    assert response.status_code == 200
    row = DinerReward.objects.get()
    assert (row.action, row.points, row.state) == ('cuenta', 17, 'acreditado')


def test_marketing_toggle_grants_once_and_retains_prize_when_opted_out(table, rpc, api_client):
    # Falla si apagar/reactivar novedades duplica el premio o se pierde el que ya se ganó.
    _, ana, _ = table
    rpc[0].append(action('novedades', porcentaje=10))
    api_client.cookies['waiter_diner'] = ana.key
    for opted_in in (True, False, True):
        response = api_client.patch(reverse('account-profile'), {'novedades': opted_in}, format='json')
        assert response.status_code == 200
    row = DinerReward.objects.get()
    assert (row.action, row.percent) == ('novedades', 10)


def test_feedback_endpoint_grants_once_regardless_of_rating(table, rpc, api_client):
    # Falla si el premio depende de opinar bien, no se concede al guardar o se duplica al editar.
    session, ana, _ = table
    rpc[0].append(action('opinion', porcentaje=12))
    order = Order.objects.create(session=session, state=Order.SENT)
    session.lines.update(order=order, status=CartLine.CONFIRMED)
    api_client.cookies['waiter_diner'] = ana.key
    for rating in (1, 5):
        response = api_client.put(reverse('order-feedback', args=[order.id]), {'rating': rating, 'comment': 'Mi opinión'}, format='json')
        assert response.status_code == 200
    assert DinerFeedback.objects.count() == 1
    row = DinerReward.objects.get()
    assert (row.reference, row.percent) == (str(order.id), 12)


def test_verified_provider_approval_grants_action_immediately(table, rpc):
    # Falla si un estado aprobado del proveedor no concede el premio hasta otra visita al menú.
    _, ana, _ = table
    rpc[0].append(action('pago_en_linea', porcentaje=9))
    attempt = payment(ana, 'PENDING')
    attempt.provider_id = 'tx-premio'
    attempt.gateway.environment = 'test'
    attempt.gateway.save()
    attempt.save()
    remote = {'id': attempt.provider_id, 'reference': attempt.reference, 'currency': 'COP',
              'amount_in_cents': attempt.amount_in_cents, 'payment_method_type': attempt.method, 'status': 'APPROVED'}
    online_payments.apply_remote(attempt, remote)
    online_payments.apply_remote(attempt, remote)
    assert list(DinerReward.objects.values_list('action', 'percent')) == [('pago_en_linea', Decimal('9'))]


def test_cas_loss_uses_next_available_reward_without_stealing_reserved_one(table):
    # Falla si otra confirmación gana la reserva y aun así esta aplica el porcentaje de ese premio.
    from django.db.models.query import QuerySet
    session, ana, _ = table
    first = earned(ana, percent=25)
    second = earned(ana, 'novedades', percent=10)
    order = Order.objects.create(session=session)
    competitor = Order.objects.create(session=session)
    original_update = QuerySet.update
    raced = False

    def competing_update(query, **values):
        nonlocal raced
        if query.model is DinerReward and values.get('state') == 'reservado' and not raced:
            raced = True
            original_update(DinerReward.objects.filter(pk=first.pk), state='reservado', order=competitor)
        return original_update(query, **values)

    with patch.object(QuerySet, 'update', competing_update):
        rewards.reserve(TABLE, ana, list(sessions.open_lines(session)), order)
    first.refresh_from_db()
    second.refresh_from_db()
    assert first.order == competitor and second.order == order
    assert CartLine.objects.get(diner=ana).discount == 10


def test_reward_reservation_excludes_other_accounts_venues_and_unverified_accounts(table):
    # Falla si reservar usa el mayor porcentaje de otra cuenta u organización o autoriza una cuenta que dejó de estar verificada.
    session, ana, beto = table
    earned(ana, percent=90, restaurant_slug='otra-organizacion')
    beto.account = DinerAccount.objects.create(organization_slug='burger-house', name='Beto', email='beto@example.invalid', verified=True)
    beto.save()
    earned(beto, percent=80)
    own = earned(ana, percent=10)
    order = Order.objects.create(session=session)
    DinerAccount.objects.filter(pk=ana.account_id).update(verified=False)
    rewards.reserve(TABLE, ana, list(sessions.open_lines(session)), order)
    assert CartLine.objects.get(diner=ana).discount == 0
    DinerAccount.objects.filter(pk=ana.account_id).update(verified=True)
    rewards.reserve(TABLE, ana, list(sessions.open_lines(session)), order)
    assert CartLine.objects.get(diner=ana).discount == 10
    own.refresh_from_db()
    assert own.state == 'reservado'


def test_more_lines_before_paying_project_and_reuse_the_reserved_prize(table, sending):
    # Falla si la cuenta anuncia un premio distinto al reservado al agregar platos antes del prepago.
    session, ana, _ = table
    first = earned(ana, percent=15)
    order, _ = orders.confirm(session, ana, prepay=True)
    second = earned(ana, 'novedades', percent=30)
    sessions.add_line(session, ana, LIMONADA, 1)
    cart = sessions.cart_view(session, ana)
    assert cart['descuento']['porcentaje'] == 15
    assert cart['descuento']['monto'] == 1485
    with patch('experience_app.services.orders.pos.read_order_status', return_value=OrderStatus('draft', 'none')):
        orders.confirm(session, ana, prepay=True)
    assert sending.call_args.kwargs['lines'][-1].discount == 15
    first.refresh_from_db()
    second.refresh_from_db()
    assert (first.order, first.state, second.state) == (order, 'reservado', 'disponible')
