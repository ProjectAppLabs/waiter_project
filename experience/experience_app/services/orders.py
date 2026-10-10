"""Confirmación del carrito y estado del pedido propio.

Cada visita conserva un pedido con UUID estable entre reintentos. Confirmar
reserva las líneas y sus beneficios; el pago habilita el envío a cocina.
"""
from experience_app.adapters.core import pos
from experience_app.adapters.core.pos import Client
import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction
from tenancy.http import Problem
from django.utils import timezone

from django.db import DatabaseError
from experience_app.adapters.core.pos import resolve
from experience_app.models import CartLine, Diner, DinerAccount, Order, TableSession, SignupDiscountClaim
from experience_app.services import benefits, discount, rewards
from experience_app.services.sessions import PAID_STATES, close_paid, open_lines
from experience_app.utils.errors import ConfirmationBusy, NothingToConfirm, SessionAlreadyPaid

STATUS_BY_KITCHEN = {'none': 'enviado', 'received': 'enviado', 'cooking': 'en_cocina', 'ready': 'listo', 'served': 'servido'}


def _line_uuid(order: Order, line: CartLine) -> str:
    # Estable entre reintentos: el sistema propio casa las líneas por uuid y no las duplica.
    return str(uuid.uuid5(order.id, str(line.id)))


def _to_order_lines(order: Order, lines: list[CartLine]) -> list[pos.OrderLine]:
    return [pos.OrderLine(uuid=_line_uuid(order, line), product_id=line.product_id, name=line.name, unit_price=float(line.unit_price),
                          qty=line.qty, note=' · '.join(part for part in [('Para llevar' if line.takeaway else ''), line.note, ('Notas del comensal: ' + line.checkout_note if line.checkout_note else ''), ('ALERGIAS / ALÉRGENOS: ' + line.allergens if line.allergens else '')] if part), tax_ids=list(line.tax_ids), discount=float(line.discount), loyalty_card_id=line.loyalty_card_id, coupon_code=line.coupon_code) for line in lines]


def _first_purchase_discount(tenant, diner: Diner | None, new_lines: list[CartLine], order: Order) -> tuple[Decimal, list[CartLine]]:
    """Reserva atómica antes de RPC; un resultado remoto incierto conserva las líneas del reintento."""
    if diner is None or diner.account_id is None or diner.coupon_code:
        return Decimal(0), []
    reserved = [line for line in new_lines if line.discount and line.diner_id == diner.id]
    if reserved:
        return reserved[0].discount, reserved
    percent = Decimal(str(discount.percent_for(tenant)))
    mine = [line for line in new_lines if line.diner_id == diner.id]
    if not mine or percent <= 0:
        return Decimal(0), []
    try:
        with transaction.atomic():
            SignupDiscountClaim.objects.bulk_create([SignupDiscountClaim(key=key, order=order, organization_slug=diner.session.restaurant_slug) for key in discount.claim_keys(diner)])
            return _reserve_account_discount(diner, mine, order, percent)
    except IntegrityError:
        return Decimal(0), []


def _reserve_account_discount(diner, mine, order, percent):
    with transaction.atomic():
        claimed = DinerAccount.objects.filter(id=diner.account_id, organization_slug=diner.session.restaurant_slug, verified=True, discount_used_at=None,
                                              discount_order=None).update(discount_order=order)
        if not claimed:
            raise IntegrityError('beneficio no disponible')
        CartLine.objects.filter(id__in=[line.id for line in mine]).update(discount=percent)
    for line in mine:
        line.discount = percent
    return percent, mine


def confirm(session: TableSession, diner: Diner | None = None, takeaway: bool | None = None, *, prepay: bool = False, checkout_note: str | None = None, allergens: str | None = None) -> tuple[Order, bool]:
    # CAS persistente: serializa confirmaciones de una mesa incluso en SQLite.
    if not TableSession.objects.filter(id=session.id, confirming=False, state__in=TableSession.OPEN_STATES).update(confirming=True):
        raise ConfirmationBusy()
    try:
        return _confirm(session, diner, takeaway, prepay=prepay, checkout_note=checkout_note, allergens=allergens)
    finally:
        TableSession.objects.filter(id=session.id).update(confirming=False)


def _confirm(session: TableSession, diner: Diner | None = None, takeaway: bool | None = None, *, prepay: bool = False, checkout_note: str | None = None, allergens: str | None = None) -> tuple[Order, bool]:
    """Devuelve (pedido, hubo_algo_nuevo). Sin líneas nuevas, comprueba en el sistema propio que sigue abierto y devuelve el pedido.

    `diner` es quien confirma: si tiene cuenta verificada con el descuento de primera compra sin usar, SUS líneas nuevas
    van al sistema propio con `discount` y la cuenta queda marcada; las de los demás comensales de la mesa no.
    """
    if diner is not None and takeaway is not None:
        open_lines(session).filter(diner=diner, order__isnull=True).update(takeaway=takeaway)
    from experience_app.services.online_payments import ACTIVE, PaymentConflict
    if session.payments.filter(status__in=ACTIVE).exists():
        raise PaymentConflict('Hay un pago en curso. Espera su resultado antes de modificar la cuenta.')
    if diner is not None:
        details = {}
        if checkout_note is not None:
            details['checkout_note'] = checkout_note
        if allergens is not None:
            details['allergens'] = allergens
        elif diner.account_id and diner.account.verified:
            details['allergens'] = diner.account.allergens
        if details:
            open_lines(session).filter(diner=diner, order__isnull=True).update(**details)
    new_lines = list(open_lines(session))
    order = session.orders.order_by('created_at').first()
    if not new_lines and (order is None or order.state not in (Order.SENT, Order.CHECKOUT)):
        raise NothingToConfirm()
    tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token)
    if diner is not None and diner.account_id:
        rewards.sync(tenant, diner.account)
    client = Client(tenant)
    prepay = True
    pos.ensure_open_session(client, tenant.config_id)
    # También se verifica al pagar sin líneas nuevas: el POS puede haber cobrado entretanto.
    if order is not None and order.state in (Order.SENT, Order.CHECKOUT) and order.odoo_order_id:
        status = pos.read_order_status(client, order.odoo_order_id)
        if status.state in PAID_STATES:
            if order.requires_payment and status.kitchen != 'served':
                raise PaymentConflict('Este pedido ya está pagado. Puedes seguir su preparación desde el estado del pedido.')
            close_paid(session)
            raise SessionAlreadyPaid()
    if not new_lines:
        return order, False
    order = order or Order.objects.create(session=session, requires_payment=prepay)
    with transaction.atomic():
        session.lines.filter(id__in=[line.id for line in new_lines]).update(order=order)
        # Releer después de reservar: PATCH/DELETE solo pueden tocar líneas sin pedido.
        new_lines = list(open_lines(session).filter(order=order))
        benefits.reserve(tenant, new_lines)
        _first_purchase_discount(tenant, diner, new_lines, order)
        rewards.reserve(tenant, diner, new_lines, order)
    all_lines = list(session.lines.filter(status=CartLine.CONFIRMED).order_by('created_at')) + new_lines
    try:
        pos_session_id = pos.ensure_open_session(client, tenant.config_id)
        placed_order = pos.create_order(client, pos_session_id=pos_session_id, table_id=session.odoo_table_id, order_uuid=str(order.id),
                                      guests=max(1, session.diners.count()), lines=_to_order_lines(order, all_lines),
                                      date_order=timezone.now().strftime('%Y-%m-%d %H:%M:%S'), requires_payment=order.requires_payment)
        if not order.requires_payment:
            pos.fire_course(client, placed_order.id)
    except (DatabaseError, Problem) as exc:
        order.state, order.attempts, order.last_error = Order.FAILED, order.attempts + 1, exc.body['message'] if isinstance(exc, Problem) else str(exc)
        order.save(update_fields=['state', 'attempts', 'last_error'])
        raise
    if session.odoo_table_id is not None:
        try:
            pos.set_table_call(client, session.odoo_table_id, 'none')
        except (DatabaseError, Problem):
            pass  # La comanda ya llegó; un fallo al limpiar la llamada no invalida la confirmación.
    with transaction.atomic():
        order.state, order.attempts, order.last_error = (Order.CHECKOUT if order.requires_payment else Order.SENT), order.attempts + 1, ''
        order.odoo_order_id, order.total, order.tax, order.sent_at = placed_order.id, Decimal(str(placed_order.total)), Decimal(str(placed_order.tax)), (None if order.requires_payment else timezone.now())
        order.save()
        for line in new_lines:
            if line.diner.account_id and not line.account_id:
                line.account_id = line.diner.account_id
                line.save(update_fields=['account'])
        session.lines.filter(id__in=[line.id for line in new_lines]).update(status=CartLine.CONFIRMED, order=order)
        from assistant.profiles import record_order
        record_order(order, new_lines)
        if not order.requires_payment:
            DinerAccount.objects.filter(discount_order=order, discount_used_at=None).update(discount_used_at=timezone.now())
            rewards.use_reserved(order)
        session.state = TableSession.CONFIRMED
        session.save(update_fields=['state'])
    return order, True


def status_view(order: Order, *, remote_status=None) -> dict:
    saved = sum((line.discount_amount for line in order.lines.all()), 0)
    pct = max((line.discount for line in order.lines.all()), default=0)
    base = {'id': str(order.id), 'sesion': str(order.session_id), 'total': float(order.total or 0), 'impuestos': float(order.tax or 0), 'intentos': order.attempts,
            'descuento': {'porcentaje': float(pct), 'monto': float(saved), 'aplicado': bool(saved)}}
    if order.state not in (Order.SENT, Order.CHECKOUT):
        return {**base, 'estado': 'fallido', 'detalle': order.last_error}
    session = order.session
    status = remote_status
    if status is None:
        tenant = resolve(session.restaurant_slug, session.venue_slug, session.table_token)
        status = pos.read_order_status(Client(tenant), order.odoo_order_id)
    if order.requires_payment:
        if status.state not in PAID_STATES:
            # El pedido autónomo espera el pago antes de pasar a cocina.
            return {**base, 'estado': 'pendiente_pago' if status.kitchen == 'none' else STATUS_BY_KITCHEN[status.kitchen]}
        Order.objects.filter(id=order.id, state=Order.CHECKOUT).update(state=Order.SENT, sent_at=timezone.now())
        DinerAccount.objects.filter(discount_order=order, discount_used_at=None).update(discount_used_at=timezone.now())
        rewards.use_reserved(order)
        if status.kitchen != 'served':
            return {**base, 'estado': STATUS_BY_KITCHEN[status.kitchen]}
    if status.state in PAID_STATES:
        close_paid(session)  # la siguiente sesión de la mesa empieza limpia
        return {**base, 'estado': 'pagado'}
    return {**base, 'estado': STATUS_BY_KITCHEN[status.kitchen]}
