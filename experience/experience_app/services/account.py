"""Cuenta del comensal (Plan H): registro en tres campos, verificación por código y el historial de sus pedidos.

El proveedor de códigos aún no está integrado. En demo, seis dígitos ASCII verifican solo
la cuenta pendiente solicitada por esta cookie, durante diez minutos y una sola vez.
Nunca se recuperan cuentas existentes por correo. En producción se rechaza el flujo.
"""
import re

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from experience_app.adapters.registry.client import resolve, RegistryUnavailable, TenantNotFound
from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.services.sessions import close_paid, PAID_STATES

from experience_app.models import CartLine, Diner, DinerAccount, Order, TableSession

CODE_RE = re.compile(r'[0-9]{6}')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PHONE_RE = re.compile(r'^\+?[\d\s\-]{7,20}$')


class InvalidRegistration(Exception):
    """Un campo del registro no sirve; el mensaje va tal cual al comensal."""


class InvalidCode(Exception):
    pass


def _clean(data: dict) -> dict:
    name = str(data.get('nombre') or '').strip()
    email = str(data.get('correo') or '').strip().lower()
    phone = re.sub(r'\s+', ' ', str(data.get('celular') or '').strip())
    if not name or len(name) > 60:
        raise InvalidRegistration('Dinos tu nombre (hasta 60 caracteres).')
    if not EMAIL_RE.match(email) or len(email) > 120:
        raise InvalidRegistration('Ese correo no parece válido.')
    if phone and not PHONE_RE.match(phone):
        raise InvalidRegistration('Ese celular no parece válido.')
    if data.get('aceptaDatos') is not True:
        raise InvalidRegistration('Para crear la cuenta hay que aceptar la política de datos.')
    return {'name': name, 'email': email, 'phone': phone, 'accepts_data': True, 'marketing': bool(data.get('novedades'))}


def require_demo() -> None:
    if settings.IS_PRODUCTION or not settings.DINER_DEMO_ENABLED:
        raise DemoUnavailable()


class DemoUnavailable(Exception):
    pass


def register(data: dict, diner: Diner) -> DinerAccount:
    """Una cuenta nueva vinculada al dispositivo; demo nunca recupera identidades por correo."""
    require_demo()
    fields = _clean(data)
    password = data.get('clave')
    if password is not None:
        if not isinstance(password, str) or not 10 <= len(password) <= 128 or password.isnumeric() or password.lower() in {fields['email'], fields['name'].lower()}:
            raise InvalidRegistration('Usa una contraseña de 10 a 128 caracteres que no sea solo numérica ni tu nombre o correo.')
        from django.contrib.auth.hashers import make_password
        fields['password'] = make_password(password)
    pending = DinerAccount.objects.filter(email=fields['email'], verified=False, registration_key=diner.key).first()
    if pending:
        pending.created_at = timezone.now()
        pending.save(update_fields=['created_at'])
        return pending
    if DinerAccount.objects.filter(email=fields['email']).exists():
        raise InvalidRegistration('Este correo no está disponible para un registro demo.')
    return DinerAccount.objects.create(**fields, registration_key=diner.key)


@transaction.atomic
def verify(account: DinerAccount, diner: Diner, code) -> DinerAccount:
    require_demo()
    if not CODE_RE.fullmatch(str(code or '').strip()):
        raise InvalidCode()
    updated = DinerAccount.objects.filter(id=account.id, registration_key=diner.key, verified=False,
                                         created_at__gte=timezone.now() - timezone.timedelta(minutes=10)).update(
        verified=True, verified_at=timezone.now(), registration_key='')
    if not updated:
        raise InvalidCode()
    account.refresh_from_db()
    diner.account = account
    diner.save(update_fields=['account'])
    from experience_app.services import rewards
    rewards.sync_for_diner(diner)
    return account


def logout(diner: Diner) -> None:
    if diner.account_id is not None:
        CartLine.objects.filter(diner=diner, order__isnull=False, account__isnull=True).update(account=diner.account)
        diner.account = None
        diner.save(update_fields=['account'])


def profile_view(account: DinerAccount) -> dict:
    return {'id': str(account.id), 'nombre': account.name, 'correo': account.email, 'celular': account.phone, 'alergenos': account.allergens,
            'tieneClave': bool(account.password), 'novedades': account.marketing, 'verificada': account.verified,
            'descuentoDisponible': account.discount_available,
            'descuentoUsado': account.discount_used_at.isoformat() if account.discount_used_at else None,
            'creada': account.created_at.isoformat()}


def history(account: DinerAccount) -> list[dict]:
    """Pedidos enviados de las sesiones donde participó un comensal con esta cuenta, del más reciente al más viejo.

    El estado sale de la sesión (pagada por el salón o no), sin ir a Odoo por cada pedido viejo.
    """
    orders = (Order.objects.filter(Q(lines__account=account) | Q(lines__account__isnull=True, session__diners__account=account), state__in=(Order.SENT, Order.CHECKOUT))
              .distinct().select_related('session').order_by('-created_at'))
    orders = list(orders)
    groups = {}
    for order in orders:
        if order.session.state != TableSession.PAID and order.odoo_order_id:
            groups.setdefault((order.session.restaurant_slug, order.session.venue_slug), []).append(order)
    for (restaurant, venue), pending in groups.items():
        try:
            client = OdooClient(resolve(restaurant, venue).odoo)
            states = client.call_kw('pos.order', 'read', [[o.odoo_order_id for o in pending], ['state']])
            paid = {row['id'] for row in states if row['state'] in PAID_STATES}
            for order in pending:
                if order.requires_payment and order.odoo_order_id in paid:
                    from experience_app.services.orders import status_view
                    order._diner_status = status_view(order)['estado']
                elif order.odoo_order_id in paid and not order.requires_payment:
                    close_paid(order.session)
        except (OdooError, RegistryUnavailable, TenantNotFound):
            pass  # Historial disponible con el último estado conocido si el salón no responde.
    diner_ids = set(account.diners.values_list('id', flat=True))
    lines = CartLine.objects.filter(Q(account=account) | Q(account__isnull=True, diner_id__in=diner_ids), order__in=orders).order_by('created_at')
    mine_by_order: dict = {}
    lines_by_order: dict = {}
    for line in lines:
        mine, saved = mine_by_order.get(line.order_id, (0, 0))
        mine_by_order[line.order_id] = (mine + line.net_subtotal, saved + line.discount_amount)
        lines_by_order.setdefault(line.order_id, []).append(
            {'producto_id': line.product_id, 'nombre': line.name, 'cantidad': line.qty, 'precio': float(line.shown_unit_price)})
    out = []
    for order in orders:
        mine, saved = mine_by_order.get(order.id, (0, 0))
        mine_lines = lines_by_order.get(order.id, [])
        # `local` es el nombre legible del restaurante; la sesión solo guarda slugs (el nombre real llega con el contexto).
        out.append({'id': str(order.id), 'fecha': order.created_at.isoformat(), 'total': float(mine), 'totalMesa': float(order.total or 0),
                    'mio': float(mine), 'descuento': float(saved), 'mesa': order.session.table_number,
                    'estado': getattr(order, '_diner_status', 'pagado' if order.session.state == TableSession.PAID else 'pendiente_pago' if order.state == Order.CHECKOUT else 'enviado'),
                    'restaurante': order.session.restaurant_slug, 'sede': order.session.venue_slug,
                    'local': order.session.restaurant_slug.replace('-', ' ').title(),
                    'items': sum(line['cantidad'] for line in mine_lines), 'lineas': mine_lines})
    return out
