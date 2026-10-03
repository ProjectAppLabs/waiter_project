"""Reservas del POS y consulta pública del anticipo, sin datos de contacto."""

import secrets

from django.conf import settings
from rest_framework.response import Response

from accounts.authentication import resolve_organization
from catalog.api import PosView
from catalog.services import manager, restaurant_for, valid, writing
from loyalty.promotions import iso_date
from sales.policy import permit
from sales.services import integer
from tables.models import Floor, Table
from tenancy.http import ContractView, payload, require

from . import services as s
from .models import Reservation, ReservationSchedule
from .reading import ACTIVE, available_tables, card, detail, reservations, timeline
from .schedule import clean_schedule, local_now, schedule, slots


def query_number(request, key, default=None, whole=False):
    raw = request.query_params.get(key)
    if raw is None:
        return default
    try:
        return int(raw) if whole else float(raw)
    except (ValueError, OverflowError):
        valid(False, "Indica un número válido.")


class ReservationView(PosView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if getattr(self, 'action', '') == 'deposit-paid':
            policy = self.org.role_policy.get(self.account.role, {})
            require(self.account.role in ('owner', 'admin') or 'reservations' in policy.get('views', []))
        else:
            permit(self.account, "reservations")

    def row(self, pk, lock=False):
        row = (
            Reservation.objects.select_for_update().filter(pk=pk, organization=self.org).first()
            if lock
            else reservations().filter(pk=pk, organization=self.org).first()
        )
        require(row, "No encontramos la reserva.", "not_found", 404)
        restaurant_for(self.account, row.restaurant_id)
        return row


class ReservationsView(ReservationView):
    def get(self, request, pk=None):
        if pk is not None:
            return Response(detail(self.row(pk)))
        table_id = query_number(request, "table_id", whole=True)
        table = (
            Table.objects.filter(pk=integer(table_id, high=2**63 - 1), floor__restaurant__organization=self.org)
            .select_related("floor")
            .first()
        )
        require(table, "No encontramos la mesa.", "not_found", 404)
        restaurant_for(self.account, table.floor.restaurant_id)
        return Response(
            {
                "reservations": [
                    card(r) for r in reservations().filter(organization=self.org, tables=table, state__in=ACTIVE)
                ]
            }
        )

    def post(self, request):
        row = s.create(self.account, request.data)
        return Response(detail(self.row(row.pk)), status=201)


class CalendarView(ReservationView):
    mode = "timeline"

    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        day = iso_date(request.query_params.get("date", local_now(self.org).date().isoformat()))
        if self.mode == "slots":
            return Response(slots(self.org, restaurant, day))
        if self.mode == "tables":
            start = s.time_value(query_number(request, "time_start"))
            valid(start + 1.5 <= 24)
            people = integer(query_number(request, "people", whole=True))
            prep = s.prep_value(request.query_params.get("prep", "30"))
            exclude = query_number(request, "exclude_id", whole=True)
            if exclude is not None:
                row = self.row(integer(exclude, high=2**63 - 1))
                require(row.restaurant_id == restaurant.pk, "La reserva no pertenece al restaurante.", "not_found", 404)
            include = request.query_params.get("include_unavailable", "false")
            valid(include in ("0", "1", "false", "true"))
            return Response(available_tables(restaurant, day, start, people, prep, exclude, include in ("1", "true")))
        floor = query_number(request, "floor_id", whole=True)
        if floor is not None:
            require(
                Floor.objects.filter(pk=integer(floor, high=2**63 - 1), restaurant=restaurant, active=True).exists(),
                "No encontramos el piso.",
                "not_found",
                404,
            )
        return Response(timeline(self.org, restaurant, day, floor))


class ReservationActionView(ReservationView):
    action = ""

    def apply(self, request, pk):
        if self.action in ("deposit", "deposit-paid"):
            manager(self.account)
        with writing(self.org, operational=True):
            row = self.row(pk, True)
            if self.action == "tables":
                data = payload(request.data, ("table_ids",), ("table_ids",))
                s.set_tables(row, data["table_ids"])
            elif self.action == "deposit":
                data = payload(request.data, ("amount",), ("amount",))
                s.set_deposit(row, data["amount"])
            elif self.action == "deposit-paid":
                data = payload(request.data, ("reference",))
                s.mark_paid(row, data.get("reference") or f"Registrado en el POS por {self.account.name}")
            else:
                payload(request.data, ())
                s.change_state(row, self.account, self.action)
        return Response(detail(self.row(pk)))

    def put(self, request, pk):
        return self.apply(request, pk)

    def post(self, request, pk):
        return self.apply(request, pk)


class ScheduleView(ReservationView):
    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        return Response(schedule(restaurant))

    def put(self, request):
        manager(self.account)
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        data = clean_schedule(request.data)
        with writing(self.org, operational=True):
            ReservationSchedule.objects.update_or_create(restaurant=restaurant, defaults=data)
        return Response(data)


class PublicDepositView(ContractView):
    def get(self, request, token):
        org = resolve_organization(request)
        from tenancy.modules import require_module
        from .models import Reservation
        row = Reservation.objects.filter(organization=org, pay_token=token).first()
        if row:
            require_module(org, 'reservas', row.restaurant)
        result = s.public_deposit(org, token)
        require(result, "No encontramos la reserva.", "not_found", 404)
        response = Response(result)
        response["Cache-Control"] = "no-store"
        return response


class DepositPaidView(ContractView):
    def post(self, request, token):
        expected = settings.EXPERIENCE_INTERNAL_KEY
        supplied = request.headers.get("X-Internal-Key", "")
        require(
            expected and secrets.compare_digest(expected, supplied), "La clave interna no es válida.", "forbidden", 403
        )
        org = resolve_organization(request)
        data = payload(request.data, ("reference", "amount"), ("reference", "amount"))
        return Response(s.deposit_paid(org, token, data["reference"], data["amount"]))
