"""Consulta del historial con alcance de organización y de locales del encargado."""

from django.db.models import Q
from rest_framework.response import Response

from catalog.api import PosView
from catalog.services import valid
from reports.team import selection

from .audit import ACTIONS
from .http import json_value
from .models import OrganizationAudit


def entries(account, params):
    start, end, locals_ = selection(account, params)
    qs = OrganizationAudit.objects.filter(organization=account.organization, at__gte=start, at__lt=end)
    if account.role == "admin":
        # En equipo, tanto las asignaciones anteriores como las nuevas deben estar dentro del alcance.
        local_ids = {r.pk for r in locals_}
        team_ids = []
        for row in qs.filter(entity="accounts.account").exclude(actor_kind="platform").iterator():
            assigned = set(row.before.get("restaurants", [])) | set(row.after.get("restaurants", []))
            if (
                assigned
                and assigned <= local_ids
                and not any(v.get("role") == "owner" for v in (row.before, row.after))
            ):
                team_ids.append(row.pk)
        qs = qs.filter(Q(restaurant__in=locals_) | Q(pk__in=team_ids)).exclude(actor_kind="platform")
    elif params.get("restaurant_id"):
        qs = qs.filter(restaurant__in=locals_)
    if params.get("account_id"):
        valid(params["account_id"].isdecimal(), "Indica una persona válida.")
        qs = qs.filter(actor_kind="account", actor_id=int(params["account_id"]))
    if params.get("action"):
        qs = qs.filter(action=params["action"])
    if params.get("q"):
        qs = qs.filter(Q(summary__icontains=params["q"]) | Q(actor_name__icontains=params["q"]))
    return qs.select_related("restaurant").order_by("-at", "-id")


def entry_dict(entry):
    return {
        "id": entry.pk,
        "at": json_value(entry.at),
        "restaurant": {"id": entry.restaurant_id, "name": entry.restaurant.name} if entry.restaurant_id else None,
        "actor": {"kind": entry.actor_kind, "id": entry.actor_id, "name": entry.actor_name},
        "action": entry.action,
        "action_name": ACTIONS.get(entry.action, entry.action),
        "entity": entry.entity,
        "entity_id": entry.entity_id,
        "summary": entry.summary,
        "before": entry.before,
        "after": entry.after,
    }


class AuditView(PosView):
    actions = False

    def get(self, request):
        from catalog.services import manager

        manager(self.account)
        if self.actions:
            return Response({"actions": [{"key": key, "name": name} for key, name in ACTIONS.items()]})
        qs = entries(self.account, request.query_params)
        limit, offset = request.query_params.get("limit", "50"), request.query_params.get("offset", "0")
        valid(
            limit.isdecimal() and offset.isdecimal() and 1 <= int(limit) <= 500, "Revisa el límite y el desplazamiento."
        )
        return Response(
            {"entries": [entry_dict(e) for e in qs[int(offset) : int(offset) + int(limit)]], "total": qs.count()}
        )
