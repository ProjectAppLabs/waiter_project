"""Rutas de clientes y promociones con identidad y organización explícitas."""

from django.core.files.storage import default_storage
from django.db.models import Case, Count, F, OuterRef, Q, Subquery, Sum, When
from django.http import FileResponse
from rest_framework.response import Response

from accounts.authentication import resolve_organization
from accounts.services import restaurants_for
from billing.models import SalesDocument
from catalog.api import PosView
from catalog.services import manager, owner, reference, restaurant_for, valid, writing
from sales.policy import permit
from sales.reading import order_response
from sales.services import event, get_order, text, uuid_value
from tenancy.http import ContractView, model_dict, payload, require, save_valid

from . import services as s
from .models import ID_TYPES, Banner, Customer, LoyaltyCard, LoyaltyProgram
from .promotions import banner_settings, benefits_settings, save_banners, save_benefits

CUSTOMER_FIELDS = ("id", "name", "phone", "email", "vat", "id_type", "street", "city")


def customers(org):
    # El comprador fiscal puede ser distinto del contacto del pedido. La subconsulta evita multiplicar importes
    # al combinar varios pedidos y documentos del mismo cliente.
    billed = (
        SalesDocument.objects.filter(organization=org, buyer_id=OuterRef("pk"), state="issued")
        .values("buyer_id")
        .annotate(amount=Sum(Case(When(kind="credit_note", then=-F("total")), default=F("total"))))
        .values("amount")
    )
    return Customer.objects.filter(organization=org).annotate(
        paid_orders=Count("orders", filter=Q(orders__state="paid", orders__organization=org)),
        invoiced=Subquery(billed),
    )


def customer_dict(row):
    return {**model_dict(row, CUSTOMER_FIELDS), "orders": row.paid_orders, "invoiced": float(row.invoiced or 0)}


class CustomersView(PosView):
    def get(self, request, pk=None):
        if pk is not None:
            from .delivery import address_dict, consent_dict, consented, insights
            row = customers(self.org).filter(pk=pk).first()
            require(row, 'No encontramos el cliente.', 'not_found', 404)
            return Response({'customer': {**customer_dict(row),
                'addresses': [address_dict(a) for a in row.addresses.order_by('-last_used_at', 'id')] if consented(row) else [],
                'consent': consent_dict(row), 'insights': insights(row, restaurants_for(self.account))}})
        query = request.query_params.get("q", "").strip()
        rows = customers(self.org).filter(active=True)
        if query:
            rows = rows.filter(Q(name__icontains=query) | Q(vat__icontains=query) | Q(phone__icontains=query))
        return Response({"customers": [customer_dict(c) for c in rows.order_by("name", "id")[:200]]})

    def save(self, request, pk=None):
        manager(self.account)
        data = payload(request.data, (*CUSTOMER_FIELDS[1:], "diner_key", "active"), ("name",) if pk is None else ())
        with writing(self.org, operational=True):
            row = reference(Customer, self.org, pk) if pk else Customer(organization=self.org)
            for key, value in data.items():
                if key == "active":
                    valid(type(value) is bool)
                elif key == "diner_key":
                    value = uuid_value(value) if value is not None else None
                else:
                    value = text(value, row._meta.get_field(key).max_length, key == "name")
                setattr(row, key, value)
            save_valid(row)
        return Response({"customer": customer_dict(customers(self.org).get(pk=row.pk))}, status=200 if pk else 201)

    def post(self, request):
        return self.save(request)

    def patch(self, request, pk):
        return self.save(request, pk)


class CustomerInfoView(PosView):
    mode = "card"

    def get(self, request, pk=None):
        if self.mode == "id-types":
            return Response({"id_types": [{"id": key, "name": name} for key, name in ID_TYPES]})
        row = reference(Customer, self.org, pk)
        if self.mode == "orders":
            orders = row.orders.filter(state="paid", restaurant__in=restaurants_for(self.account)).order_by(
                "-paid_at", "-id"
            )[:20]
            return Response({"orders": [model_dict(o, ("id", "number", "paid_at", "total", "state")) for o in orders]})
        card = LoyaltyCard.objects.filter(organization=self.org, customer=row).first()
        program = LoyaltyProgram.objects.filter(organization=self.org).first()
        return Response(
            {
                "card": {
                    **model_dict(card, ("id", "points", "code", "expires")),
                    "program": program.name if program else "",
                }
                if card
                else None
            }
        )


class ProgramView(PosView):
    def get(self, request):
        program = s.program_for(self.org)
        return Response(
            {
                "program": model_dict(program, ("id", "name", "spend_per_point", "value_per_point", "minimum_points"))
                if program
                else None
            }
        )


class CardView(PosView):
    def get(self, request, code):
        card = LoyaltyCard.objects.filter(organization=self.org, code=code.upper()).select_related("customer").first()
        require(card, "No encontramos la tarjeta.", "not_found", 404)
        return Response(
            {
                "member": {
                    "card_id": card.pk,
                    "code": card.code,
                    "name": card.customer.name,
                    "phone": card.customer.phone,
                    "points": float(card.points),
                }
            }
        )


class RedeemView(PosView):
    def post(self, request, pk):
        permit(self.account, "charge_orders")
        data = payload(request.data, ("card_id",), ("card_id",))
        with writing(self.org, operational=True):
            order = get_order(self.account, pk, True)
            result = s.redeem(order, data["card_id"])
            event(order.restaurant, "orders")
        return Response({**result, **order_response(order)})


class BenefitsView(PosView):
    def get(self, request):
        owner(self.account)
        if "restaurant_id" in request.query_params:
            restaurant_for(self.account, request.query_params["restaurant_id"])
        return Response(benefits_settings(self.org))

    def put(self, request):
        owner(self.account)
        with writing(self.org, operational=True):
            result = save_benefits(self.org, request.data)
        return Response(result)


class BannersView(PosView):
    def get(self, request):
        restaurant = (
            restaurant_for(self.account, request.query_params["restaurant_id"])
            if "restaurant_id" in request.query_params
            else None
        )
        return Response(banner_settings(self.org, restaurant))

    def put(self, request):
        owner(self.account)
        with writing(self.org):
            result = save_banners(self.org, request.data)
        return Response(result)


class BannerImageView(ContractView):
    def get(self, request, pk):
        org = resolve_organization(request)
        from tenancy.modules import require_module
        require_module(org, "fidelizacion")
        row = reference(Banner, org, pk)
        require(row.image and default_storage.exists(row.image.name), "No encontramos la imagen.", "not_found", 404)
        response = FileResponse(default_storage.open(row.image.name, "rb"), content_type="image/webp")
        response["Cache-Control"] = "public, max-age=86400, immutable"
        response["Vary"] = "X-Waiter-Org"
        return response
