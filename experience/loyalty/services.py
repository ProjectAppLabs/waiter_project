"""Cotización, premios y puntos: importables también por el comensal en T5."""

from decimal import ROUND_FLOOR, Decimal
from collections import defaultdict
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.db.models import Sum
from django.utils import timezone

from catalog.models import Product
from catalog.services import number, reference, valid, writing
from sales.services import editable, integer, recalculate, rounded, text, uuid_value
from tenancy.http import require

from .models import BenefitGrant, Coupon, Customer, LoyaltyCard, LoyaltyMove, LoyaltyProgram


def seed_organization(org):
    Customer.objects.get_or_create(
        organization=org, vat="222222222222", defaults={"name": "Consumidor final", "id_type": "CC"}
    )
    LoyaltyProgram.objects.get_or_create(organization=org)


def today(org):
    return timezone.now().astimezone(ZoneInfo(org.timezone)).date()


def program_for(org):
    return LoyaltyProgram.objects.filter(organization=org, active=True).first()


def allowed_in(row, restaurant):
    ids = [r.pk for r in row.restaurants.all()]
    return not ids or restaurant.pk in ids


def local_restaurant(org, restaurant):
    valid(restaurant.organization_id == org.pk, "El restaurante no pertenece a la organización.")


def coupon_quote(org, restaurant, code, subtotal):
    local_restaurant(org, restaurant)
    subtotal = number(subtotal)
    valid(subtotal <= 1000000000)
    code = text(code, 32).upper()
    coupon = Coupon.objects.filter(organization=org, code=code, active=True).prefetch_related("restaurants").first()
    day = today(org)
    require(
        coupon
        and allowed_in(coupon, restaurant)
        and (not coupon.start or coupon.start <= day)
        and (not coupon.end or day <= coupon.end),
        "Este cupón no existe, está inactivo o no está vigente.",
        "invalid_coupon",
        400,
    )
    require(
        subtotal >= coupon.minimum,
        f"Este cupón requiere un consumo mínimo de {coupon.minimum:g}.",
        "coupon_minimum",
        400,
    )
    return {
        "codigo": code,
        "nombre": coupon.name,
        "porcentaje": float(coupon.percent),
        "monto": float(rounded(subtotal * coupon.percent / 100)),
    }


def card_for(customer):
    # El llamador ya bloqueó la organización; también serializa la primera tarjeta.
    return LoyaltyCard.objects.get_or_create(organization=customer.organization, customer=customer)[0]


def diner_benefits(org, diner_key, order_uuid=None):
    key = uuid_value(str(diner_key))
    uid = uuid_value(str(order_uuid)) if order_uuid else None
    with writing(org, operational=True):
        customer, _ = Customer.objects.get_or_create(organization=org, diner_key=key, defaults={"name": "Comensal"})
        program = program_for(org)
        card = card_for(customer) if program else None
        earned = 0
        if card and uid:
            earned = (
                LoyaltyMove.objects.filter(
                    organization=org, card=card, kind="earn", order__uuid=uid, order__state="paid"
                ).aggregate(total=Sum("points"))["total"]
                or 0
            )
        return {
            "tarjeta": card.pk if card else None,
            "codigo": card.code if card else "",
            "puntos": float(card.points) if card else 0,
            "ganados": float(earned),
            "programa": program.name if program else "",
            "valorPunto": float(program.value_per_point) if program else 0,
            "minimoCanje": float(program.minimum_points) if program else 0,
        }


def grant_points(org, diner_key, key, points, description):
    account_key = uuid_value(str(diner_key))
    key = text(key, 160, True)
    points = integer(points, high=2147483647)
    description = text(description or "Premio del menú", 500)
    with writing(org, operational=True):
        grant = BenefitGrant.objects.filter(organization=org, key=key).select_related("card__customer").first()
        if grant:
            require(
                grant.card.customer.diner_key == account_key,
                "La clave del premio pertenece a otra cuenta.",
                "grant_key_conflict",
                409,
            )
            return {"tarjeta": grant.card_id, "puntos": float(grant.card.points), "otorgados": 0}
        result = diner_benefits(org, account_key)
        require(result["tarjeta"], "Activa primero un programa de fidelización.", "loyalty_inactive", 400)
        card = LoyaltyCard.objects.select_for_update().get(pk=result["tarjeta"], organization=org)
        grant = BenefitGrant.objects.create(organization=org, key=key, card=card, points=points)
        card.points += points
        card.save(update_fields=["points"])
        LoyaltyMove.objects.create(
            organization=org, card=card, kind="grant", points=points, key=f"grant:{grant.pk}", description=description
        )
        return {"tarjeta": card.pk, "puntos": float(card.points), "otorgados": points}


def redeem(order, card_id):
    """El llamador bloquea la organización y el pedido antes de iniciar el canje."""
    editable(order)
    card = reference(LoyaltyCard, order.organization, card_id)
    card = LoyaltyCard.objects.select_for_update().select_related("customer").get(pk=card.pk)
    program = program_for(order.organization)
    require(
        program and (not card.expires or card.expires >= today(order.organization)),
        "La tarjeta está vencida o el programa está inactivo.",
        "invalid_card",
        400,
    )
    previous = order.lines.filter(points_cost__gt=0, cancelled=False).first()
    if previous:
        require(
            previous.loyalty_card_id == card.pk,
            "El pedido ya tiene un canje de otra tarjeta.",
            "redemption_conflict",
            409,
        )
        return {"amount": float(-previous.total), "points": float(previous.points_cost)}
    reserved = (
        LoyaltyMove.objects.filter(card=card, kind__in=["reserve", "release"]).aggregate(total=Sum("points"))["total"]
        or 0
    )
    available = card.points + reserved
    points = min(
        available.to_integral_value(rounding=ROUND_FLOOR),
        (order.total / program.value_per_point).to_integral_value(rounding=ROUND_FLOOR),
    )
    require(
        points >= program.minimum_points,
        "No hay suficientes puntos o consumo para el canje mínimo.",
        "minimum_points",
        400,
    )
    amount = rounded(points * program.value_per_point)
    # Producto técnico oculto; la línea conserva el importe cotizado aunque cambie el programa.
    product = Product.objects.filter(
        organization=order.organization, kind="dish", name="Canje de puntos Waiter", available_in_pos=False
    ).first()
    if not product:
        product = Product.objects.create(
            organization=order.organization, kind="dish", name="Canje de puntos Waiter", available_in_pos=False, price=0
        )
    order.lines.create(
        uuid=uuid4(),
        product=product,
        name=program.name,
        qty=1,
        unit_price=-amount,
        taxes=[],
        subtotal=-amount,
        total=-amount,
        loyalty_card=card,
        points_cost=points,
    )
    LoyaltyMove.objects.create(
        organization=order.organization,
        card=card,
        kind="reserve",
        points=-points,
        order=order,
        key=f"order:{order.pk}:reserve",
        description=f"Canje en {order.number}",
    )
    if not order.customer_id:
        order.customer = card.customer
    recalculate(order)
    return {"amount": float(amount), "points": float(points)}


def release_points(order):
    for move in LoyaltyMove.objects.filter(organization=order.organization, order=order, kind="reserve"):
        LoyaltyMove.objects.get_or_create(
            organization=order.organization,
            key=f"order:{order.pk}:release",
            defaults={
                "card": move.card,
                "order": order,
                "kind": "release",
                "points": -move.points,
                "description": f"Fin de la reserva de puntos de {order.number}",
            },
        )


def settle_points(order):
    """Abona el consumo neto, sin propina, y liquida una sola vez el canje reservado."""
    with writing(order.organization, operational=True):
        from sales.models import Order

        order = (
            Order.objects.select_for_update(of=("self",)).select_related("customer", "organization").get(pk=order.pk)
        )
        if order.state != "paid":
            return
        program = program_for(order.organization)
        default = card_for(order.customer) if program and order.customer_id else None
        reserves = list(LoyaltyMove.objects.filter(order=order, kind="reserve", organization=order.organization))
        lines = list(order.lines.filter(cancelled=False, points_cost=0))
        menu_cards = {line.loyalty_card_id for line in lines if line.loyalty_card_id} if order.channel == 'menu' else set()
        card_ids = {r.card_id for r in reserves} | ({default.pk} if default else set()) | menu_cards
        cards = {c.pk: c for c in LoyaltyCard.objects.select_for_update().filter(organization=order.organization, pk__in=card_ids).order_by("pk")}
        for move in reserves:
            posted, created = LoyaltyMove.objects.get_or_create(
                organization=order.organization,
                key=f"order:{order.pk}:redeem",
                defaults={
                    "card_id": move.card_id,
                    "order": order,
                    "kind": "redeem",
                    "points": move.points,
                    "description": f"Canje en {order.number}",
                },
            )
            if created:
                cards[move.card_id].points += posted.points
        release_points(order)
        if program and (default or menu_cards):
            net = max(Decimal(0), order.total - order.tip)
            gross = sum((line.total for line in lines), Decimal(0))
            earnings = defaultdict(Decimal)
            if order.channel == 'menu':
                earnings.update({card_id: Decimal(0) for card_id in menu_cards if card_id in cards})
            elif default:
                earnings[default.pk] = Decimal(0)
            if gross > 0 and net >= program.spend_per_point:
                for line in lines:
                    card_id = line.loyalty_card_id if order.channel == 'menu' else default.pk
                    if card_id in cards:
                        earnings[card_id] += rounded(max(Decimal(0), line.total) * net / gross / program.spend_per_point)
            for card_id, earned in earnings.items():
                # La mesa compartida abona por comensal; el canje se liquida antes de repartir el consumo neto.
                key = f'order:{order.pk}:card:{card_id}:earn' if order.channel == 'menu' else f'order:{order.pk}:earn'
                _, created = LoyaltyMove.objects.get_or_create(organization=order.organization, key=key,
                    defaults={'card_id': card_id, 'order': order, 'kind': 'earn', 'points': earned,
                              'description': f'Compra {order.number}'})
                if created:
                    cards[card_id].points += earned
        for card in cards.values():
            card.save(update_fields=["points"])


# Se exportan desde este módulo para que T5 no dependa de las vistas HTTP.
def benefit_actions(org, restaurant):
    from .promotions import diner_actions

    return diner_actions(org, restaurant)


def banners(org, restaurant):
    from .promotions import banner_settings

    local_restaurant(org, restaurant)
    return banner_settings(org, restaurant)


def refund_points(refund, balances):
    """Devuelve el canje y revierte el abono; la deuda no recuperable queda en el movimiento."""
    from sales.refunds import POINT, decimal, proportional

    order = refund.order
    selected = {row["line_id"]: row for row in refund.lines}
    credits = defaultdict(Decimal)
    for pk, row in balances.items():
        if pk not in selected:
            continue
        before, qty = row["returned"]["qty"], decimal(selected[pk]["qty"])
        for card_id, points in row["points"].items():
            credits[card_id] += (proportional(points, before + qty, row["line"].qty, POINT)
                                 - proportional(points, before, row["line"].qty, POINT))
    earned = list(LoyaltyMove.objects.filter(organization=order.organization, order=order, kind="earn"))
    cards = {card.pk: card for card in LoyaltyCard.objects.select_for_update().filter(
        organization=order.organization, pk__in=set(credits) | {m.card_id for m in earned}).order_by("pk")}
    # La reversión del abono precede al reintegro: los puntos canjeados vuelven completos.
    for move in earned:
        relevant = [row for row in balances.values()
                    if order.channel != "menu" or row["line"].loyalty_card_id == move.card_id]
        base = sum((row["amount"] for row in relevant), Decimal(0))
        before = sum((row["returned"]["amount"] for row in relevant), Decimal(0))
        amount = sum((decimal(selected[row["line"].pk]["amount"]) for row in relevant
                      if row["line"].pk in selected), Decimal(0))
        requested = (proportional(move.points, before + amount, base, POINT)
                     - proportional(move.points, before, base, POINT))
        if not requested:
            continue
        card = cards[move.card_id]
        actual = min(card.points, requested)
        card.points -= actual
        LoyaltyMove.objects.create(organization=order.organization, card=card, order=order, kind="reversal",
            points=-actual, key=f"refund:{refund.pk}:earn:{move.pk}",
            description=f"Devolución {refund.pk} de {order.number}; reversión: {requested}; "
                        f"diferencia sin recuperar: {requested - actual}")
    for card_id, points in credits.items():
        if points:
            cards[card_id].points += points
            LoyaltyMove.objects.create(organization=order.organization, card_id=card_id, order=order, kind="reversal",
                points=points, key=f"refund:{refund.pk}:redeem:{card_id}",
                description=f"Reintegro del canje por devolución {refund.pk} de {order.number}")
    for card in cards.values():
        card.save(update_fields=["points"])
