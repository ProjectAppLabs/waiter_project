"""Sesión de mesa, comensales y carrito con atribución por persona."""
from experience_app.adapters.backend import backend_for, client_for
from decimal import Decimal

from django.utils import timezone

from experience_app.adapters.odoo import pos
from experience_app.adapters.odoo.client import OdooClient, OdooError
from experience_app.adapters.odoo.pos import Product
from experience_app.adapters.registry.client import Tenant
from experience_app.models import CartLine, Diner, Order, TableSession
from experience_app.services import discount, rewards
from experience_app.utils.errors import ConfirmationBusy, NotOwner

PAID_STATES = {'paid', 'done', 'invoiced'}


def close_paid(session: TableSession) -> None:
    """El salón cobró la cuenta: la visita terminó y el siguiente toque al NFC empieza limpio."""
    if session.state != TableSession.PAID:
        session.state = TableSession.PAID
        session.closed_at = timezone.now()
        session.save(update_fields=['state', 'closed_at'])


def _settled_in_odoo(session: TableSession, tenant: Tenant) -> bool:
    order = session.orders.filter(state__in=(Order.SENT, Order.CHECKOUT)).exclude(odoo_order_id=None).order_by('-created_at').first()
    if order is None:
        return False
    try:
        if order.requires_payment:
            status = backend_for(tenant.restaurant_slug).read_order_status(client_for(tenant, OdooClient), order.odoo_order_id)
            return status.state in PAID_STATES and status.kitchen == 'served'
        return backend_for(tenant.restaurant_slug).read_order_state(client_for(tenant, OdooClient), order.odoo_order_id) in PAID_STATES
    except OdooError:
        return False  # sin Odoo no se cierra nada: la sesión sigue hasta poder verificar


def _open_table_session(tenant: Tenant) -> TableSession | None:
    session = TableSession.objects.filter(restaurant_slug=tenant.restaurant_slug, venue_slug=tenant.venue_slug,
                                          table_token=tenant.table_token, state__in=TableSession.OPEN_STATES).first()
    if session is not None and _settled_in_odoo(session, tenant):
        close_paid(session)
        return None
    return session


def open_session(tenant: Tenant, diner_key: str | None) -> tuple[TableSession, Diner]:
    """Mesa: todos los que tocan el NFC caen en la misma sesión abierta. Domicilio: la sesión es de quien la abre."""
    diner = Diner.objects.select_related('session').filter(key=diner_key).first() if diner_key else None
    if tenant.table_token:
        session = _open_table_session(tenant) or TableSession.objects.create(
            restaurant_slug=tenant.restaurant_slug, venue_slug=tenant.venue_slug, table_token=tenant.table_token,
            table_number=tenant.table_number, odoo_table_id=tenant.odoo_table_id)
    elif diner and diner.session.is_delivery and diner.session.state in TableSession.OPEN_STATES \
            and (diner.session.restaurant_slug, diner.session.venue_slug) == (tenant.restaurant_slug, tenant.venue_slug):
        session = diner.session
    else:
        session = TableSession.objects.create(restaurant_slug=tenant.restaurant_slug, venue_slug=tenant.venue_slug)
    if diner is None or diner.session_id != session.id:
        # La cuenta verificada (Plan H) viaja con la cookie: otra visita es otro comensal, pero la misma persona.
        previous = diner
        diner = Diner.objects.create(session=session, account=previous.account if previous and previous.account_id and previous.account.organization_slug == tenant.restaurant_slug else None,
                                     **({'benefit_key': previous.benefit_key} if previous else {}))
    return session, diner


def add_line(session: TableSession, diner: Diner, product: Product, qty: int, note: str = '') -> CartLine:
    return CartLine.objects.create(session=session, diner=diner, product_id=product.id, name=product.name,
                                   unit_price=Decimal(str(product.price)), final_unit_price=Decimal(str(product.final_price)),
                                   qty=qty, note=note, tax_ids=product.tax_ids)


def update_line(line: CartLine, diner: Diner, qty: int | None = None, note: str | None = None) -> CartLine:
    if line.diner_id != diner.id:
        raise NotOwner()
    if qty is not None:
        line.qty = qty
    if note is not None:
        line.note = note
    if not CartLine.objects.filter(id=line.id, order=None, status=CartLine.OPEN).update(qty=line.qty, note=line.note):
        raise ConfirmationBusy()
    return line


def remove_line(line: CartLine, diner: Diner) -> None:
    if line.diner_id != diner.id:
        raise NotOwner()
    deleted, _ = CartLine.objects.filter(id=line.id, order=None, status=CartLine.OPEN).delete()
    if not deleted:
        raise ConfirmationBusy()


def open_lines(session: TableSession):
    return session.lines.filter(status=CartLine.OPEN).select_related('diner').order_by('created_at')


def cart_view(session: TableSession, diner: Diner, discount_percent: float = discount.DEFAULT_PERCENT) -> dict:
    """Lo abierto (aún sin confirmar), a precio de lista con impuestos. `descuento` es lo que el comensal descontará al
    confirmar si tiene cuenta verificada con el descuento sin usar; los totales no lo restan porque todavía no se aplicó."""
    rewards.sync_for_diner(diner)
    lines = list(open_lines(session))
    per_diner: dict[str, Decimal] = {}
    for line in lines:
        per_diner[str(line.diner_id)] = per_diner.get(str(line.diner_id), Decimal(0)) + line.subtotal
    total = sum(per_diner.values(), Decimal(0))
    return {
        'sesion': str(session.id),
        'lineas': [{
            'id': line.id, 'comensal': str(line.diner_id), 'mio': line.diner_id == diner.id, 'producto_id': line.product_id,
            'nombre': line.name, 'precio': float(line.shown_unit_price), 'cantidad': line.qty, 'nota': line.note, 'subtotal': float(line.subtotal),
        } for line in lines],
        'total': float(total),
        'mio': float(per_diner.get(str(diner.id), Decimal(0))),
        'por_comensal': [{'comensal': k, 'total': float(v)} for k, v in per_diner.items()],
        'descuento': discount.view(lines, diner, discount_percent),
    }


# ---- Llamadas al salón: viajan por Odoo (adaptador), nunca por un canal paralelo. Un fallo de Odoo no rompe la sesión.
def table_call(tenant: Tenant, session: TableSession, kind: str) -> bool:
    if session.odoo_table_id is None:
        return False
    try:
        backend_for(tenant.restaurant_slug).set_table_call(client_for(tenant, OdooClient), session.odoo_table_id, kind)
        return True
    except OdooError:
        return False


def bill_summary(session: TableSession, diner: Diner, discount_percent: float = discount.DEFAULT_PERCENT, include_open: bool = False) -> dict:
    """Todo / lo mío / dividir sobre lo ya confirmado (lo abierto aún no es cuenta). Los totales son netos: ya restan el
    descuento que viajó a Odoo con cada línea; `descuento` dice cuánto fue (aplicado) y si aún puede aplicarse (aplicable)."""
    rewards.sync_for_diner(diner)
    lines = list(session.lines.filter(status__in=[CartLine.CONFIRMED, CartLine.OPEN] if include_open else [CartLine.CONFIRMED]).select_related('diner'))
    per: dict[str, Decimal] = {}
    for line in lines:
        per[str(line.diner_id)] = per.get(str(line.diner_id), Decimal(0)) + line.net_subtotal
    discount_view = discount.view(lines, diner, discount_percent)
    if include_open and discount_view['aplicable']:
        projected = sum((line.subtotal for line in lines if line.diner_id == diner.id and line.status == CartLine.OPEN and not line.discount), Decimal(0)) * Decimal(str(discount_view['porcentaje'])) / 100
        per[str(diner.id)] = per.get(str(diner.id), Decimal(0)) - projected.quantize(Decimal('0.01'))
    total = sum(per.values(), Decimal(0))
    diners = max(1, session.diners.count())
    return {'total': float(total), 'mio': float(per.get(str(diner.id), Decimal(0))),
            'porComensal': [{'comensal': k, 'total': float(v)} for k, v in per.items()], 'partes': diners, 'porParte': float(round(total / diners)) if total else 0.0,
            'descuento': discount_view}
