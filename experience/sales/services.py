"""Operaciones atómicas de venta; el servidor decide precios, horas y saldos."""

from tenancy.audit import audited
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from django.db.models import Max, Q
from django.utils import timezone

from catalog.reading import CatalogData, tax_dict
from catalog.services import number, restaurant_for, valid
from catalog.services import writing as catalog_writing
from tenancy.http import payload, require
from tenancy.models import Restaurant

from .models import CashShift, Course, Order, OrderLine, Payment, PaymentMethod, RestaurantSettings

CENT = Decimal("0.01")


def rounded(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def money(value, positive=False):
    result = number(value, positive=positive)
    valid(result == rounded(result), "Usa hasta dos decimales para los importes.")
    return result


def text(value, maximum=500, required=False):
    valid(isinstance(value, str) and len(value.strip()) <= maximum and (not required or bool(value.strip())))
    return value.strip()


def uuid_value(value):
    try:
        valid(isinstance(value, str))
        return UUID(value)
    except (ValueError, AttributeError):
        valid(False, "Indica un UUID válido.")


def integer(value, low=1, high=999):
    valid(type(value) is int and low <= value <= high)
    return value


@contextmanager
def writing(org, restaurant=None):
    # Serializa operaciones de la organización sin invalidar la revisión de la carta.
    with catalog_writing(org, operational=True):
        if restaurant is not None:
            Restaurant.objects.select_for_update().get(pk=restaurant.pk, organization=org)
        yield


def seed_organization(org):
    for name in ("Datáfono", "QR", "Pago en línea"):
        PaymentMethod.objects.get_or_create(organization=org, name=name, type="bank")


def seed_restaurant(restaurant, source=None):
    from tables.models import Floor

    defaults = {}
    if source:
        defaults = {
            f.name: getattr(source.settings, f.name)
            for f in RestaurantSettings._meta.fields
            if not f.generated
            if f.name not in ("id", "restaurant")
        }
    if source:
        valid(
            source.organization_id == restaurant.organization_id,
            "La sede de referencia debe ser de la misma organización.",
        )
        copied, _ = RestaurantSettings.objects.update_or_create(restaurant=restaurant, defaults=defaults)
        restaurant.settings = copied
    else:
        RestaurantSettings.objects.get_or_create(restaurant=restaurant)
    if not PaymentMethod.objects.filter(
        organization=restaurant.organization, type="cash", restaurants=restaurant
    ).exists():
        method = PaymentMethod.objects.create(organization=restaurant.organization, name="Efectivo", type="cash")
        method.restaurants.add(restaurant)
    if not restaurant.floors.exists():
        Floor.objects.create(restaurant=restaurant, name="Salón")


def event(restaurant, *kinds):
    from realtime.models import SalesEvent

    SalesEvent.objects.filter(created_at__lt=timezone.now() - timedelta(days=1)).delete()
    SalesEvent.objects.bulk_create(
        [
            SalesEvent(organization_id=restaurant.organization_id, restaurant=restaurant, kind=k)
            for k in dict.fromkeys(kinds)
        ]
    )


def period(org, start=None, end=None):
    zone = ZoneInfo(org.timezone)
    today = timezone.now().astimezone(zone).date()
    try:
        first = date.fromisoformat(start) if start else today
        last = date.fromisoformat(end) if end else first
        valid(first <= last and (not start or first.isoformat() == start) and (not end or last.isoformat() == end))
        return datetime.combine(first, time.min, zone), datetime.combine(last + timedelta(days=1), time.min, zone)
    except (ValueError, TypeError, OverflowError):
        valid(False, "Indica fechas válidas YYYY-MM-DD.")


def happened_at(value, shift):
    """La hora en que ocurrió algo hecho sin conexión (plan V), ajustada al turno: nunca antes de abrir la caja ni
    después de ahora. Sin hora, ahora. Un reloj mal puesto en el equipo no hace perder la venta."""
    now = timezone.now()
    if value in (None, ""):
        return now
    valid(isinstance(value, str), "Indica una fecha válida.")
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        valid(False, "Indica una fecha válida.")
    valid(timezone.is_aware(moment), "La fecha debe llevar zona horaria.")
    return min(max(moment, shift.opened_at), now)


def get_order(account, pk, lock=False):
    qs = Order.objects.select_for_update() if lock else Order.objects
    order = qs.filter(pk=pk, organization=account.organization).first()
    require(order, "No encontramos el pedido.", "not_found", 404)
    restaurant_for(account, order.restaurant_id)
    return order


def editable(order, lines=()):
    require(
        order.state == "draft" and not order.payments.exists(),
        "El pedido tiene pagos o ya no se puede editar.",
        "not_editable",
        409,
    )
    for line in lines:
        require(
            not (
                line.ready_at
                or line.served_at
                or line.course_id
                and (line.course.preparation_at or line.course.ready_at or line.course.served_at)
            ),
            "Cocina ya empezó a preparar el plato.",
            "not_editable",
            409,
        )


def recalculate(order):
    lines = list(order.lines.filter(cancelled=False))
    order.subtotal = sum((line.subtotal for line in lines), Decimal(0))
    total = sum((line.total for line in lines), Decimal(0))
    valid(0 <= total + order.tip < Decimal("100000000000000"), "El total no puede ser negativo ni superar el máximo permitido.")
    order.tax = total - order.subtotal
    order.total = total + order.tip
    payments = list(order.payments.select_related("method").order_by("id"))
    order.paid = sum((p.amount for p in payments), Decimal(0))
    cash = [p for p in payments if p.method.type == "cash"]
    order.change = (cash[-1].received - cash[-1].amount) if cash and cash[-1].received is not None else Decimal(0)
    order.save()


def add_lines(order, raw):
    valid(isinstance(raw, list) and 1 <= len(raw) <= 500)
    data = CatalogData(order.organization, [order.restaurant])

    def create(item, parent=None):
        allowed = (
            ("uuid", "product_id", "qty") if parent else ("uuid", "product_id", "qty", "note", "options", "children")
        )
        item = payload(item, allowed, ("uuid", "product_id", "qty"))
        pk = integer(item["product_id"], high=2**63 - 1)
        uid = uuid_value(item["uuid"])
        qty = number(item["qty"], positive=True)
        valid(qty <= 999)
        existing = order.lines.filter(uuid=uid).first()
        if existing:
            require(
                existing.product_id == pk and existing.qty == qty and existing.parent_id == (parent.pk if parent else None),
                "El UUID ya corresponde a otra línea o cantidad.", "uuid_conflict", 409,
            )
            if parent is None and "children" in item:
                children = item["children"]
                valid(isinstance(children, list))
                stored = {str(child.uuid): child for child in existing.children.all()}
                require(len(children) == len(stored), "Los componentes no coinciden con el combo aceptado.", "uuid_conflict", 409)
                seen = set()
                for child in children:
                    child = payload(child, ("uuid", "product_id", "qty"), ("uuid", "product_id", "qty"))
                    child_uid = str(uuid_value(child["uuid"]))
                    require(child_uid in stored and child_uid not in seen, "El UUID no corresponde al componente aceptado.", "uuid_conflict", 409)
                    seen.add(child_uid)
                    create(child, existing)
            return existing
        editable(order)
        product = data.products.get(pk)
        require(
            product and product.kind == "dish" and not data.sold_out(pk, order.restaurant_id),
            f"No está disponible: {product.name if product else 'producto'}.",
            "unavailable",
            400,
        )
        servings = data.servings(pk, order.restaurant_id)
        require(servings is None or qty <= servings, f"No está disponible: {product.name}.", "unavailable", 400)
        options = item.get("options", [])
        valid(isinstance(options, list) and len(options) <= 50)
        extra = Decimal(0)
        clean_options = []
        for option in options:
            option = payload(option, ("group", "name", "price_extra"), ("group", "name", "price_extra"))
            amount = money(option["price_extra"])
            clean_options.append(
                {
                    "group": text(option["group"], 100, True),
                    "name": text(option["name"], 100, True),
                    "price_extra": float(amount),
                }
            )
            extra += amount
        taxes = list(product.taxes.all())
        effective = data.prices.get((order.restaurant_id, pk), product.price)
        excluded = sum((t.amount / 100 for t in taxes if not t.included), Decimal(0))
        included = sum((t.amount / 100 for t in taxes if t.included), Decimal(0))
        price = rounded(effective * (1 + excluded) + extra) if parent is None else Decimal(0)
        total = rounded(price * qty)
        subtotal = rounded(total / (1 + excluded) / (1 + included))
        line = OrderLine.objects.create(
            order=order,
            uuid=uid,
            product=product,
            name=product.name,
            qty=qty,
            unit_price=price,
            taxes=[tax_dict(t) for t in taxes],
            options=clean_options,
            parent=parent,
            note=text(item.get("note", "")),
            total=total,
            subtotal=subtotal,
        )
        if parent is None:
            children = item.get("children", [])
            valid(isinstance(children, list))
            expected = {i["producto"]: Decimal(i["cantidad"]) * qty for i in product.diner_attributes.get("combo", [])}
            valid(len(children) == len(expected), "Incluye los componentes del combo.")
            seen = set()
            for child in children:
                valid(isinstance(child, dict) and type(child.get("product_id")) is int)
                cid = child["product_id"]
                valid(
                    cid in expected and cid not in seen and number(child.get("qty"), positive=True) == expected[cid],
                    "Revisa las cantidades del combo.",
                )
                seen.add(cid)
                create(child, line)
        if not product.diner_attributes.get("combo"):
            for ingredient, needed in data.requirements(pk).items():
                data.pending[(order.restaurant_id, ingredient)] += needed * qty
        return line

    for item in raw:
        create(item)
    recalculate(order)


def fire(order, account):
    require(order.state != "cancelled", "El pedido está cancelado.", "not_editable", 409)
    lines = order.lines.filter(course__isnull=True, cancelled=False, points_cost=0)
    if not lines.exists():
        return None
    require(order.origin != 'diner' or order.state == 'paid',
            'El pedido del menú debe pagarse antes de enviar a cocina.', 'prepay_required', 409)
    roles = order.restaurant.settings.kitchen_prepay_roles
    require(
        order.state == "paid" or (account is not None and account.role not in roles) or (account is None and order.origin == "ai" and order.channel == "whatsapp"),
        "Tu rol debe cobrar antes de enviar a cocina",
        "prepay_required",
        409,
    )
    index = (order.courses.aggregate(value=Max("index"))["value"] or 0) + 1
    course = Course.objects.create(order=order, index=index)
    lines.update(course=course)
    event(order.restaurant, "kitchen")
    return course.pk


def table_for(order, pk):
    from tables.models import Table

    table = Table.objects.filter(
        pk=integer(pk, high=2**63 - 1), active=True, floor__active=True, floor__restaurant=order.restaurant
    ).first()
    require(table, "Selecciona una mesa activa del restaurante.", "not_found", 404)
    return table


@audited
def create_order(account, raw, *, allow_empty=False, restaurant=None):
    data = payload(
        raw,
        (
            "restaurant_id",
            "uuid",
            "service",
            "table_id",
            "guests",
            "baby_chair",
            "customer_name",
            "delivery_address",
            "delivery_phone",
            "note",
            "lines",
            "fire",
            "created_at",
        ),
        ("restaurant_id", "uuid", "service", "lines", "fire"),
    )
    if account is not None:
        restaurant = restaurant_for(account, data["restaurant_id"])
    else:
        valid(restaurant is not None and restaurant.pk == data["restaurant_id"])
    org = restaurant.organization
    uid = uuid_value(data["uuid"])
    with writing(org, restaurant):
        existing = Order.objects.filter(organization=org, uuid=uid).first()
        if existing:
            if account is not None:
                restaurant_for(account, existing.restaurant_id)
            require(
                existing.restaurant_id == restaurant.pk, "El UUID corresponde a otro restaurante.", "uuid_conflict", 409
            )
            return existing, False
        shift = CashShift.objects.select_for_update().filter(restaurant=restaurant, state="open").first()
        require(shift, "Abre la caja antes de crear pedidos.", "shift_closed", 409)
        valid(data["service"] in ("dine_in", "takeout", "delivery"))
        valid(type(data["fire"]) is bool and type(data.get("baby_chair", False)) is bool)
        prefix = {"dine_in": "DI", "takeout": "TA", "delivery": "DE"}[data["service"]]
        created_at = happened_at(data.get("created_at"), shift)
        day = created_at.astimezone(ZoneInfo(org.timezone)).date().isoformat()
        start, end = period(org, day, day)
        tracking = (
            Order.objects.filter(
                restaurant=restaurant, prefix=prefix, created_at__gte=start, created_at__lt=end
            ).aggregate(value=Max("tracking"))["value"]
            or 0
        ) + 1
        order = Order(
            organization=org,
            restaurant=restaurant,
            shift=shift,
            uuid=uid,
            service=data["service"],
            prefix=prefix,
            tracking=tracking,
            number=f"{prefix}-{tracking:03d}",
            created_by=account,
            created_at=created_at,
            guests=integer(data.get("guests", 1)),
            baby_chair=data.get("baby_chair", False),
        )
        for key, maximum in [("customer_name", 120), ("delivery_address", 500), ("delivery_phone", 40), ("note", 500)]:
            setattr(order, key, text(data.get(key, ""), maximum))
        if order.service == "dine_in":
            valid(data.get("table_id") is not None, "Selecciona una mesa para comer aquí.")
            order.table = table_for(order, data["table_id"])
        else:
            valid(data.get("table_id") is None, "Este servicio no utiliza mesa.")
        order.save()
        if data["lines"] or not allow_empty:
            add_lines(order, data["lines"])
        if data["fire"]:
            fire(order, account)
        event(restaurant, "orders", "tables")
        return order, True


def methods_for(org, restaurant):
    return (
        PaymentMethod.objects.filter(organization=org, active=True)
        .filter(Q(restaurants=restaurant) | Q(restaurants__isnull=True))
        .distinct()
    )


def add_payment(order, account, raw):
    data = payload(
        raw, ("method_id", "amount", "received", "reference", "request_key"), ("method_id", "amount", "request_key")
    )
    key = text(data["request_key"], 80, True)
    valid(len(key) >= 16)
    amount = money(data["amount"], True)
    received = money(data["received"]) if data.get("received") is not None else None
    ref = text(data.get("reference", ""), 60)
    method_id = integer(data["method_id"], high=2**63 - 1)
    existing = Payment.objects.filter(organization=order.organization, request_key=key).first()
    if existing:
        require(
            existing.order_id == order.pk
            and existing.method_id == method_id
            and existing.amount == amount
            and existing.received == received
            and existing.reference == ref,
            "El identificador ya se usó para otro pago.",
            "request_key_conflict",
            409,
        )
        return
    require(order.state == "draft", "El pedido ya terminó.", "not_editable", 409)
    method = methods_for(order.organization, order.restaurant).filter(pk=method_id).first()
    require(method, "No encontramos el método de pago.", "not_found", 404)
    valid(
        received is None or method.type == "cash" and received >= amount, "El efectivo entregado debe cubrir el pago."
    )
    require(order.paid + amount <= order.total, "El pago supera el saldo del pedido.", "overpaid", 400)
    Payment.objects.create(
        organization=order.organization,
        order=order,
        method=method,
        amount=amount,
        received=received,
        reference=ref,
        request_key=key,
        account=account,
    )
    recalculate(order)
    event(order.restaurant, "orders", "cash")


def pay(order, account, at=None):
    if order.state == "paid":
        return
    require(order.state == "draft", "El pedido ya terminó.", "not_editable", 409)
    require(order.paid >= order.total, "Falta pagar el saldo del pedido.", "unpaid", 400)
    order.state, order.paid_at, order.paid_by = "paid", happened_at(at, order.shift), account
    order.billing, order.billing_at = False, None
    order.save()
    fire(order, account)
    from loyalty.services import settle_points
    settle_points(order)
    from inventory.services import apply_sale

    data = CatalogData(order.organization, [order.restaurant])
    requirements = defaultdict(Decimal)
    usage = {}
    # Los componentes ya están materializados: no se cuenta también su padre.
    lines = list(order.lines.filter(cancelled=False).order_by("id"))
    parents = {line.parent_id for line in lines if line.parent_id is not None}
    for line in lines:
        if line.pk in parents:
            continue
        usage[line.pk] = {ingredient: qty * line.qty for ingredient, qty in data.requirements(line.product_id).items()}
        for ingredient, qty in usage[line.pk].items():
            requirements[ingredient] += qty
    for pk, qty in requirements.items():
        apply_sale(account, data.products[pk], order, qty)
    from inventory.models import StockMove

    movements = {m.ingredient_id: m for m in StockMove.objects.filter(
        organization=order.organization, request_key__in=[f"order:{order.pk}:ingredient:{pk}" for pk in requirements]
    )}
    allocated, consumed = defaultdict(Decimal), defaultdict(Decimal)
    for line in lines:
        line.stock_usage = []
        for pk, qty in usage.get(line.pk, {}).items():
            if not requirements[pk]:
                continue
            allocated[pk] += qty
            target = (-movements[pk].qty * allocated[pk] / requirements[pk]).quantize(
                Decimal("0.000001"), rounding=ROUND_HALF_UP)
            line.stock_usage.append({"ingredient_id": pk, "unit_id": movements[pk].unit_id,
                                    "qty": str(target - consumed[pk])})
            consumed[pk] = target
    OrderLine.objects.bulk_update(lines, ["stock_usage"])
    if order.table_id and not Order.objects.filter(table_id=order.table_id, state="draft").exists():
        from tables.models import Table

        Table.objects.filter(pk=order.table_id).update(call="none", call_at=None)
    event(order.restaurant, "orders", "tables", "cash")
