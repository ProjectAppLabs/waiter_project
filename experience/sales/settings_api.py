"""Política de permisos, prepago, tolerancia y parámetros operativos."""

from datetime import date

from rest_framework.response import Response

from accounts.services import restaurants_for
from catalog.api import PosView
from catalog.services import manager, owner, restaurant_for, valid
from tenancy.http import payload

from .models import RestaurantSettings
from .policy import can, validate_policy
from .reading import fields
from .services import event, integer, money, writing

SETTINGS = "alert_late_minutes alert_bill_minutes roi_hour_cost roi_minutes_per_order roi_baseline_hours_per_100 roi_monthly_cost roi_start_date kitchen_prepay_roles"


def settings_dict(account, restaurant):
    return {
        "restaurant": fields(restaurant.settings, SETTINGS),
        "role_policy": account.organization.role_policy,
        "can_charge": can(account, "charge_orders"),
        "can_edit_inventory": can(account, "edit_inventory"),
        # La tolerancia de caja de la organización: Cuadres la muestra y el cierre avisa al superarla.
        "cash_tolerance": float(account.organization.cash_tolerance),
    }


class SettingsView(PosView):
    def get(self, request):
        return Response(
            settings_dict(self.account, restaurant_for(self.account, request.query_params.get("restaurant_id")))
        )

    def patch(self, request):
        manager(self.account)
        restaurant = restaurant_for(self.account, request.query_params.get("restaurant_id"))
        data = payload(request.data, SETTINGS.split())
        with writing(self.org, restaurant):
            obj = RestaurantSettings.objects.select_for_update().get(restaurant=restaurant)
            for key, value in data.items():
                if key == "kitchen_prepay_roles":
                    owner(self.account)
                    valid(
                        isinstance(value, list)
                        and all(isinstance(r, str) and r in ("owner", "admin", "cashier", "waiter") for r in value)
                    )
                    value = list(dict.fromkeys(value))
                elif key == "roi_start_date":
                    if value is not None:
                        try:
                            value = date.fromisoformat(value)
                        except (ValueError, TypeError):
                            valid(False, "Indica una fecha YYYY-MM-DD.")
                elif key.startswith("alert_"):
                    value = integer(value, low=0, high=1440)
                else:
                    value = money(value)
                setattr(obj, key, value)
            obj.save()
            event(restaurant, "orders")
        restaurant.refresh_from_db()
        return Response(settings_dict(self.account, restaurant))


class CashSettingsView(PosView):
    def put(self, request):
        owner(self.account)
        data = payload(request.data, ("tolerance",), ("tolerance",))
        with writing(self.org):
            self.org.cash_tolerance = money(data["tolerance"])
            self.org.save(update_fields=["cash_tolerance"])
            for restaurant in restaurants_for(self.account):
                event(restaurant, "cash")
        return Response({"tolerance": float(self.org.cash_tolerance)})


class RolesView(PosView):
    def put(self, request):
        owner(self.account)
        policy = validate_policy(request.data)
        with writing(self.org):
            self.org.role_policy = policy
            self.org.save(update_fields=["role_policy"])
            for restaurant in restaurants_for(self.account):
                event(restaurant, "orders")
        return Response({"role_policy": policy})
