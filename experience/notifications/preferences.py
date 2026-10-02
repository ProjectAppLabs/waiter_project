"""Preferencias personales y acción de compra desde la campana."""

from rest_framework.response import Response

from accounts.models import Account, default_notify_prefs
from catalog.api import PosView
from catalog.services import manager, restaurant_for, valid, writing
from inventory.services import create_request
from tenancy.http import payload, require

from .services import visible_notifications


class NotifyPrefsView(PosView):
    def get(self, request):
        return Response({"prefs": {**default_notify_prefs(), **self.account.notify_prefs}})

    def put(self, request):
        data = payload(request.data, ("prefs",), ("prefs",))
        prefs = payload(data["prefs"], default_notify_prefs())
        valid(all(type(value) is bool for value in prefs.values()), "Las preferencias deben ser booleanos.")
        with writing(self.org, operational=True):
            account = Account.objects.select_for_update().get(pk=self.account.pk)
            account.notify_prefs = {**default_notify_prefs(), **account.notify_prefs, **prefs}
            account.save(update_fields=["notify_prefs"])
        return Response({"prefs": account.notify_prefs})


class RequestIngredientView(PosView):
    def post(self, request, pk):
        manager(self.account)
        payload(request.data, ())
        with writing(self.org, operational=True):
            row = visible_notifications(self.account).select_for_update().filter(pk=pk).first()
            require(row, "No encontramos el aviso.", "not_found", 404)
            require(
                row.kind == "inventory" and row.res_model == "catalog.Product" and row.action == "request_ingredient",
                "Este aviso no solicita un ingrediente.",
                "invalid_data",
                400,
            )
            require(not row.action_done, "La solicitud de este aviso ya fue atendida.", "notification_done", 409)
            restaurant_for(self.account, row.restaurant_id)
            result = create_request(self.account, {"restaurant_id": row.restaurant_id, "ingredient_id": row.res_id})
            row.action_done = True
            row.save(update_fields=["action_done"])
            from sales.services import event

            event(row.restaurant, "notify")
        return Response({"request": result["request"]})
