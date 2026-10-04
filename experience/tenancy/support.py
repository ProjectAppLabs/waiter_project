"""Permisos temporales del dueño y canje atómico de entrada de soporte."""

import secrets
from datetime import timedelta
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from accounts.authentication import platform_session, pos_session, resolve_organization, set_cookie
from accounts.models import Account, Session
from accounts.serialization import session_dict
from accounts.services import digest
from notifications.models import Notification

from .audit import set_actor
from .http import ContractView, json_value, payload, require
from .models import Organization, SupportGrant, SupportToken
from .services import audit


def grant_dict(grant):
    state = "vencido" if grant.state == "vigente" and grant.until <= timezone.now() else grant.state
    return {
        "id": grant.pk,
        "reason": grant.reason,
        "hours": grant.hours,
        "since": json_value(grant.since),
        "until": json_value(grant.until),
        "state": state,
        "created_at": json_value(grant.created_at),
        "requested_by": {"id": grant.requested_by_id, "name": grant.requested_by.name}
        if grant.requested_by_id
        else None,
        "approved_by": {"id": grant.approved_by_id, "name": grant.approved_by.name} if grant.approved_by_id else None,
    }


def valid_grant(grant):
    return grant and grant.state == "vigente" and grant.since <= timezone.now() < grant.until


def grant_data(raw):
    data = payload(raw, ("reason", "hours"), ("reason",))
    reason, hours = data["reason"], data.get("hours", 24)
    require(
        isinstance(reason, str) and 0 < len(reason.strip()) <= 1000,
        "Indica un motivo de hasta 1000 caracteres.",
        "invalid_data",
        400,
    )
    require(type(hours) is int and 1 <= hours <= 72, "El acceso debe durar entre 1 y 72 horas.", "invalid_data", 400)
    return reason.strip(), hours


def organization(slug):
    org = Organization.objects.filter(slug=slug).first()
    require(org, "No encontramos esta organización.", "not_found", 404)
    return org


class SupportView(ContractView):
    platform = False
    action = None

    def access(self, request, slug):
        if self.platform:
            actor = platform_session(request).user
            return actor, organization(slug)
        session = pos_session(request)
        require(
            session.account.role == "owner" and not session.support_grant_id,
            "Solo el dueño puede administrar los accesos de soporte.",
        )
        return session.account, session.account.organization

    def get(self, request, slug=None):
        _, org = self.access(request, slug)
        grants = (
            SupportGrant.objects.filter(organization=org).select_related("requested_by", "approved_by").order_by("-id")
        )
        return Response({"grants": [grant_dict(grant) for grant in grants]})

    def post(self, request, slug=None, pk=None):
        actor, org = self.access(request, slug)
        with transaction.atomic():
            # Este mismo bloqueo ordena aprobación, revocación y canje del token.
            org = Organization.objects.select_for_update().get(pk=org.pk)
            if self.action == "enter":
                require(org.status != "suspended", "La organización está suspendida.", "organization_suspended")
                grant = (
                    SupportGrant.objects.filter(
                        organization=org, state="vigente", since__lte=timezone.now(), until__gt=timezone.now()
                    )
                    .filter(requested_by__in=[actor])
                    .first()
                )
                if grant is None:
                    grant = SupportGrant.objects.filter(
                        organization=org,
                        requested_by__isnull=True,
                        state="vigente",
                        since__lte=timezone.now(),
                        until__gt=timezone.now(),
                    ).first()
                require(grant, "Necesitas un acceso de soporte vigente.", "forbidden")
                token = secrets.token_urlsafe(32)
                SupportToken.objects.create(
                    grant=grant, agent=actor, token_hash=digest(token), expires=timezone.now() + timedelta(minutes=2)
                )
                base = urlsplit(settings.POS_URL)
                url = urlunsplit((base.scheme, f"{org.slug}.{base.netloc}", "/soporte", f"token={token}", ""))
                audit(actor, org, "support.enter", {"grant_id": grant.pk})
                return Response({"url": url})
            if pk is None:
                reason, hours = grant_data(request.data)
                grant = SupportGrant(organization=org, reason=reason, hours=hours)
                if self.platform:
                    grant.requested_by = actor
                else:
                    grant.approved_by, grant.since = actor, timezone.now()
                    grant.until, grant.state = grant.since + timedelta(hours=hours), "vigente"
                grant.save()
                if self.platform:
                    owners = list(org.accounts.filter(role="owner", active=True))
                    for owner in owners:
                        Notification.objects.create(
                            organization=org,
                            recipient=owner,
                            kind="system",
                            title="ProjectApp solicita acceso de soporte",
                            body=f"{actor.name}: {reason}",
                            res_model="support",
                            res_id=grant.pk,
                        )
                    recipients = [o.email for o in owners if o.email]
                    if recipients:
                        transaction.on_commit(
                            lambda: EmailMessage(
                                subject="Solicitud de soporte de ProjectApp",
                                body=f"{actor.name} pide acceso durante {hours} horas. Motivo: {reason}. Aprueba el acceso en Soporte de tu consola.",
                                from_email=settings.EMAIL_FROM,
                                to=recipients,
                            ).send(using="waiter"),
                            robust=True,
                        )
            else:
                grant = SupportGrant.objects.select_for_update().filter(pk=pk, organization=org).first()
                require(grant, "No encontramos este acceso.", "not_found", 404)
                payload(request.data, ())
                if self.action == "approve":
                    require(grant.state == "pedido", "Este acceso ya no está pendiente.", "conflict", 409)
                    grant.approved_by, grant.since = actor, timezone.now()
                    grant.until, grant.state = grant.since + timedelta(hours=grant.hours), "vigente"
                else:
                    grant.state = "revocado"
                    Session.objects.filter(support_grant=grant).delete()
                    SupportToken.objects.filter(grant=grant).delete()
                grant.save()
            if self.platform:
                audit(actor, org, "support.requested", {"grant_id": grant.pk})
        return Response({"grant": grant_dict(grant)}, status=201 if pk is None else 200)


class SupportLoginView(ContractView):
    def post(self, request):
        org = resolve_organization(request)
        data = payload(request.data, ("token",), ("token",))
        require(isinstance(data["token"], str), "El token no es válido.", "invalid_token", 400)
        with transaction.atomic():
            Organization.objects.select_for_update().get(pk=org.pk)
            item = (
                SupportToken.objects.select_for_update()
                .select_related("grant", "agent")
                .filter(token_hash=digest(data["token"]), grant__organization=org, expires__gt=timezone.now())
                .first()
            )
            require(
                item and valid_grant(item.grant) and item.agent.active and item.agent.activated,
                "El acceso de soporte no es válido o ha vencido.",
                "invalid_token",
                403,
            )
            from .two_factor import required

            require(
                item.agent.two_factor or not required(item.agent),
                "Activa el doble factor para continuar.",
                "two_factor_required",
            )
            owner = (
                Account.objects.filter(organization=org, role="owner", active=True, activated=True)
                .order_by("id")
                .first()
            )
            require(owner, "La organización no tiene un dueño activo.", "forbidden")
            raw_token = secrets.token_urlsafe(32)
            session = Session.objects.create(
                account=owner,
                token_hash=digest(raw_token),
                support_grant=item.grant,
                support_agent=item.agent,
                expires=item.grant.until,
            )
            set_actor(item.agent, support=True)
            audit(item.agent, org, "support.started", {"grant_id": item.grant_id})
            item.delete()
        return set_cookie(Response(session_dict(session)), "waiter_sid", raw_token, session.expires)
