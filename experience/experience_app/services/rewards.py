"""Premios por acciones verificadas en el servidor, aislados por cuenta y organización."""
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.registry.client import RegistryUnavailable, TenantNotFound
from experience_app.models import CartLine, DinerAccount, DinerFeedback, DinerReward, Order, PaymentAttempt
from experience_app.services import benefits


def actions(tenant):
    key = f'benefit-actions:{tenant.restaurant_slug}/{tenant.venue_slug}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        result = OdooClient(tenant.odoo).call_kw('pos.config', 'waiter_benefit_actions', [[tenant.odoo.pos_config_id]])
    except OdooError:
        result = []
    # Una versión antigua del addon no debe impedir consultar el carrito.
    result = result if isinstance(result, list) else []
    cache.set(key, result, min(settings.MENU_CACHE_SECONDS, 30))
    return result


def _scope(tenant, account):
    return {'account': account, 'restaurant_slug': tenant.restaurant_slug, 'venue_slug': ''}


def _eligible(row, config_id):
    configs = row.prize_snapshot.get('configs') or []
    return not configs or config_id in configs


def _references(tenant, account):
    venue = {'order__session__restaurant_slug': tenant.restaurant_slug}
    opinions = DinerFeedback.objects.filter(diner__account=account, order__state=Order.SENT, **venue)
    paid = PaymentAttempt.objects.filter(diner__account=account, status='APPROVED', **venue).exists()
    return {'cuenta': [''], 'novedades': [''] if account.marketing else [],
            'opinion': list(dict.fromkeys(str(value) for value in opinions.values_list('order_id', flat=True))),
            'pago_en_linea': [''] if paid else []}


def sync(tenant, account):
    """Concede una vez cada acción y reintenta los puntos aunque la acción ya se haya desactivado."""
    if account is None:
        return
    account = DinerAccount.objects.filter(pk=account.pk, organization_slug=tenant.restaurant_slug, verified=True).first()
    if account is None:
        return
    available = actions(tenant)
    references = _references(tenant, account) if available else {}
    for action in available:
        prize = action['premio']
        if action['accion'] == 'cuenta' and prize['tipo'] == 'descuento':
            continue  # La primera compra conserva sus reservas y su protección por dispositivo/teléfono.
        for reference in references.get(action['accion'], []):
            DinerReward.objects.get_or_create(**_scope(tenant, account), action=action['accion'], reference=reference,
                defaults={'reward': prize['tipo'], 'percent': Decimal(str(prize.get('porcentaje', 0))),
                          'coupon_code': prize.get('codigo', ''), 'points': prize.get('puntos', 0),
                          'prize_snapshot': dict(prize), 'state': 'pendiente' if prize['tipo'] == 'puntos' else 'disponible'})
    for row in DinerReward.objects.filter(**_scope(tenant, account), reward='puntos', state='pendiente'):
        try:
            OdooClient(tenant.odoo).call_kw('pos.config', 'waiter_grant_points', [[tenant.odoo.pos_config_id],
                {'id': str(account.id), 'name': account.name, 'email': account.email, 'phone': account.phone},
                f'{row.action}:{account.id}:{row.reference}', row.points, f'Premio por {row.action}'])
        except OdooError:
            continue
        DinerReward.objects.filter(pk=row.pk, state='pendiente').update(state='acreditado', used_at=timezone.now())


def sync_for_diner(diner):
    if diner.account_id:
        try:
            sync(benefits.tenant_for(diner.session), diner.account)
        except (RegistryUnavailable, TenantNotFound):
            pass  # Una caída del registro no impide ver la cuenta ni guardar una opinión.


def reserve(tenant, diner, new_lines, order):
    """CAS antes del envío a Odoo; las líneas reservadas conservan su descuento ante un resultado incierto."""
    if diner is None or diner.account_id is None or diner.coupon_code:
        return
    mine = [line for line in new_lines if line.diner_id == diner.id]
    if not mine or any(line.discount or line.coupon_code for line in mine):
        return
    if not DinerAccount.objects.filter(pk=diner.account_id, organization_slug=diner.session.restaurant_slug, verified=True).exists():
        return
    with transaction.atomic():
        candidates = DinerReward.objects.filter(**_scope(tenant, diner.account), reward='descuento')
        row = candidates.filter(state='reservado', order=order).first()
        if row is None:
            for candidate in candidates.filter(state='disponible').order_by('-percent', 'created_at', 'pk'):
                if not _eligible(candidate, tenant.odoo.pos_config_id):
                    continue
                if DinerReward.objects.filter(pk=candidate.pk, state='disponible').update(state='reservado', order=order):
                    row = candidate
                    break
        if row is None:
            return
        CartLine.objects.filter(pk__in=[line.pk for line in mine]).update(discount=row.percent)
        for line in mine:
            line.discount = row.percent


def use_reserved(order):
    DinerReward.objects.filter(order=order, state='reservado', reward='descuento').update(state='usado', used_at=timezone.now())


def use_coupon(tenant, diner, code, order):
    if not diner.account_id or not diner.account.verified:
        return
    # Dos acciones pueden conceder el mismo cupón: consumirlo gasta un solo premio, el más antiguo.
    candidates = DinerReward.objects.filter(**_scope(tenant, diner.account), reward='cupon', coupon_code=code,
                                             state='disponible').order_by('created_at', 'pk')
    for row in candidates:
        if not _eligible(row, tenant.odoo.pos_config_id):
            continue
        if DinerReward.objects.filter(pk=row.pk, state='disponible').update(state='usado', order=order, used_at=timezone.now()):
            break


def discount_view(lines, diner):
    """Proyecta el mayor descuento disponible o explica el premio ya aplicado a estas líneas."""
    if not diner.account_id or not DinerAccount.objects.filter(pk=diner.account_id, organization_slug=diner.session.restaurant_slug, verified=True).exists():
        return None
    rows = DinerReward.objects.filter(account_id=diner.account_id, restaurant_slug=diner.session.restaurant_slug,
                                      venue_slug='', reward='descuento')
    mine = [line for line in lines if line.diner_id == diner.id]
    pending = [line for line in mine if line.status == CartLine.OPEN and line.order_id is None and not line.discount]
    row = None
    if pending:
        row = rows.filter(state='reservado', order__session=diner.session).first()
        if row is None:
            config_id = None
            for candidate in rows.filter(state='disponible').order_by('-percent', 'created_at', 'pk'):
                if candidate.prize_snapshot.get('configs') and config_id is None:
                    try:
                        config_id = benefits.tenant_for(diner.session).odoo.pos_config_id
                    except (RegistryUnavailable, TenantNotFound):
                        continue
                if _eligible(candidate, config_id):
                    row = candidate
                    break
    projected = sum((line.subtotal for line in pending), Decimal(0)) * row.percent / 100 if row else Decimal(0)
    can_apply = row is not None
    if row is None:
        row = rows.filter(state__in=['reservado', 'usado'], order_id__in={line.order_id for line in mine if line.discount},
                          percent__in={line.discount for line in mine if line.discount}).order_by('-created_at').first()
    if row is None:
        return None
    applied = sum((line.discount_amount for line in mine), Decimal(0))
    return {'porcentaje': float(row.percent), 'monto': float(applied + projected.quantize(Decimal('0.01'))),
            'aplicable': can_apply, 'aplicado': applied > 0, 'registrado': True, 'accion': row.action}


def view(tenant, account):
    rows = [row for row in DinerReward.objects.filter(**_scope(tenant, account)).order_by('created_at', 'pk')
            if _eligible(row, tenant.odoo.pos_config_id)]
    done = {row.action for row in rows}
    references = _references(tenant, account)
    return {'beneficios': [{'id': row.pk, 'accion': row.action, 'premio': row.prize_snapshot,
                           'estado': row.state, 'fecha': row.created_at.isoformat()} for row in rows if row.state != 'pendiente'],
            # La opinión se premia una vez por pedido: sigue siendo una acción pendiente aunque ya se haya ganado antes.
            'acciones': [{**action, 'hecha': action['accion'] != 'opinion' and (action['accion'] in done or bool(references.get(action['accion'])))}
                         for action in actions(tenant)]}
