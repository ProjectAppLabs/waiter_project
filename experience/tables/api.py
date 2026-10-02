"""Salón, planos e imágenes públicas limitados a la organización."""

from django.core.files.storage import default_storage
from django.http import FileResponse
from django.utils import timezone
from rest_framework.response import Response

from accounts.authentication import resolve_organization
from catalog.api import PosView
from catalog.services import manager, restaurant_for, valid
from sales.api import get_shift
from sales.policy import permit
from sales.services import event, integer, text, writing
from tenancy.http import ContractView, payload, require

from . import services as s
from .models import Floor, Table


def get_floor(account, pk):
    floor = (
        Floor.objects.filter(pk=pk, restaurant__organization=account.organization).select_related("restaurant").first()
    )
    require(floor, "No encontramos el piso.", "not_found", 404)
    restaurant_for(account, floor.restaurant_id)
    return floor


class FloorsView(PosView):
    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        qs = Floor.objects.filter(restaurant=restaurant).prefetch_related("tables")
        if request.query_params.get("all") != "1":
            qs = qs.filter(active=True)
        from reservations.reading import reserved_at
        floors = list(qs.order_by('sequence', 'id'))
        reserved = reserved_at(self.org, [t for f in floors for t in f.tables.all()])
        return Response({"floors": [s.floor_dict(f, reserved) for f in floors]})

    def post(self, request):
        manager(self.account)
        data = payload(request.data, ("restaurant_id", "name"), ("restaurant_id", "name"))
        restaurant = restaurant_for(self.account, data["restaurant_id"])
        with writing(self.org, restaurant):
            floor = Floor.objects.create(restaurant=restaurant, name=text(data["name"], 100, True))
            event(restaurant, "tables")
        return Response({"floor": s.floor_dict(floor)}, status=201)

    def patch(self, request, pk):
        manager(self.account)
        data = payload(request.data, ("name", "active", "sequence"))
        with writing(self.org):
            floor = get_floor(self.account, pk)
            if "name" in data:
                floor.name = text(data["name"], 100, True)
            if "sequence" in data:
                floor.sequence = integer(data["sequence"], low=-(2**31), high=2**31 - 1)
            if "active" in data:
                valid(type(data["active"]) is bool)
                if not data["active"] and floor.active:
                    s.closed(floor.restaurant)
                    s.another_floor(floor)
                    s.no_drafts(floor.tables.all())
                floor.active = data["active"]
            floor.save()
            event(floor.restaurant, "tables")
        return Response({"floor": s.floor_dict(floor)})

    def delete(self, request, pk):
        manager(self.account)
        with writing(self.org):
            floor = get_floor(self.account, pk)
            s.closed(floor.restaurant)
            if floor.active:
                s.another_floor(floor)
            s.no_drafts(floor.tables.all())
            restaurant = floor.restaurant
            if floor.tables.filter(orders__state="paid").exists() or floor.tables.filter(reservations__isnull=False).exists():
                floor.active = False
                floor.save()
                floor.tables.update(active=False)
                result = "archived"
            else:
                floor.delete()
                result = "removed"
            event(restaurant, "tables")
        return Response({"result": result})


class PlanView(PosView):
    def get(self, request, pk):
        return Response(s.document(get_floor(self.account, pk)))

    def put(self, request, pk):
        manager(self.account)
        with writing(self.org):
            result = s.save_plan(get_floor(self.account, pk), request.data)
        return Response(result)


class ZoneStaffView(PosView):
    def get(self, request, pk):
        floor = get_floor(self.account, pk)
        shift_id = request.query_params.get("shift_id")
        shift = None
        if shift_id:
            valid(shift_id.isdecimal())
            shift = get_shift(self.account, int(shift_id))
            require(shift.restaurant_id == floor.restaurant_id, "No encontramos el turno.", "not_found", 404)
        return Response(s.zone_staff(floor, shift))

    def put(self, request, pk):
        manager(self.account)
        data = payload(request.data, ("assignments",), ("assignments",))
        with writing(self.org):
            floor = get_floor(self.account, pk)
            floor.zone_staff = s.assignments(floor, data["assignments"])
            floor.save()
            event(floor.restaurant, "tables")
        return Response(s.zone_staff(floor))


class ShiftZonesView(PosView):
    def put(self, request, pk):
        manager(self.account)
        data = payload(request.data, ("floor_id", "assignments"), ("floor_id", "assignments"))
        with writing(self.org):
            shift = get_shift(self.account, pk, True)
            require(shift.state == "open", "La caja ya está cerrada.", "shift_closed", 409)
            floor = get_floor(self.account, integer(data["floor_id"], high=2**63 - 1))
            require(floor.restaurant_id == shift.restaurant_id, "No encontramos el piso.", "not_found", 404)
            if data["assignments"] is None:
                shift.zone_staff.pop(str(floor.pk), None)
            else:
                shift.zone_staff[str(floor.pk)] = s.assignments(floor, data["assignments"])
            shift.save()
            event(floor.restaurant, "tables")
        return Response(s.zone_staff(floor, shift))


class CallsView(PosView):
    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        qs = Table.objects.filter(floor__restaurant=restaurant, floor__active=True, active=True).exclude(call="none")
        return Response(
            {
                "calls": [
                    {
                        "table_id": t.pk,
                        "table_number": t.number,
                        "kind": t.call,
                        "since": s.fields(t, "call_at")["call_at"],
                    }
                    for t in qs
                ]
            }
        )

    def put(self, request, pk):
        permit(self.account, "serve_orders")
        data = payload(request.data, ("kind",), ("kind",))
        valid(data["kind"] in ("none", "ordering", "assist", "bill"))
        with writing(self.org):
            table = (
                Table.objects.filter(pk=pk, floor__restaurant__organization=self.org, active=True, floor__active=True)
                .select_related("floor__restaurant")
                .first()
            )
            require(table, "No encontramos la mesa.", "not_found", 404)
            restaurant_for(self.account, table.floor.restaurant_id)
            table.call = data["kind"]
            table.call_at = None if table.call == "none" else timezone.now()
            table.save()
            event(table.floor.restaurant, "tables")
        return Response({"table": s.table_dict(table)})


class ImageView(ContractView):
    def get(self, request, pk, image_id=None):
        org = resolve_organization(request)
        floor = Floor.objects.filter(pk=pk, restaurant__organization=org, active=True).first()
        require(floor, "No encontramos el piso.", "not_found", 404)
        name = (
            next((i["file"] for i in floor.plan.get("images", []) if i["id"] == image_id), "")
            if image_id
            else floor.background.name
        )
        require(name and default_storage.exists(name), "No encontramos la imagen.", "not_found", 404)
        response = FileResponse(default_storage.open(name, "rb"), content_type="image/webp")
        response["Cache-Control"] = "public, max-age=86400, immutable"
        response["Vary"] = "X-Waiter-Org"
        return response
