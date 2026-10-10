"""Registro transaccional compartido por servicios, sin contraseñas ni secretos."""

from contextvars import ContextVar
from functools import wraps

from django.db import transaction

from .http import json_value

_context = ContextVar("actor_historial", default=None)

# Lista cerrada: los nombres y las acciones son estables para el filtro del POS.
ENTITIES = {
    "catalog.product": "Producto",
    "catalog.category": "Categoría",
    "catalog.recipe": "Receta",
    "catalog.recipeline": "Ingrediente de receta",
    "catalog.restaurantprice": "Precio por local",
    "catalog.restaurantunavailable": "Disponibilidad por local",
    "inventory.stock": "Existencias",
    "inventory.stockmove": "Movimiento de inventario",
    "loyalty.coupon": "Cupón",
    "loyalty.benefitaction": "Beneficio",
    "loyalty.banner": "Promoción",
    "loyalty.loyaltyprogram": "Programa de puntos",
    "sales.order": "Pedido",
    "sales.orderline": "Plato del pedido",
    "sales.refund": "Devolución",
    "sales.cashshift": "Turno de caja",
    "sales.cashmove": "Movimiento de caja",
    "accounts.account": "Persona del equipo",
    "tenancy.organization": "Organización",
    "tenancy.restaurant": "Local",
    "tenancy.organizationmodule": "Módulo",
    "experience_app.paymentgateway": "Pasarela de pago",
    "tenancy.supportgrant": "Acceso de soporte",
}
SUPPORT_ENTITIES = {
    "catalog.supplier": "Proveedor",
    "catalog.productphoto": "Foto del producto",
    "sales.restaurantsettings": "Ajustes del local",
    "sales.paymentmethod": "Medio de pago",
    "sales.payment": "Pago",
    "sales.refundpayment": "Pago devuelto",
    "loyalty.customer": "Cliente",
    "loyalty.loyaltycard": "Tarjeta de puntos",
    "tables.floor": "Piso",
    "tables.table": "Mesa",
    "reservations.reservationschedule": "Horario de reservas",
    "reservations.reservation": "Reserva",
    "reservations.reservationline": "Plato reservado",
    "billing.billingsettings": "Ajustes de facturación",
    "billing.resolution": "Resolución de facturación",
    "billing.salesdocument": "Documento de venta",
}
ENTITIES['assistant.assistantstanding'] = 'Aviso del asistente'
ENTITIES.update(SUPPORT_ENTITIES)
VERBS = {"created": "Creación", "updated": "Cambio", "deleted": "Eliminación"}
ACTIONS = {
    f"{entity}.{verb}": f"{label}: {name.lower()}" for entity, label in ENTITIES.items() for verb, name in VERBS.items()
}
ACTIONS.update(
    {
        "support.enter": "Entrada de soporte solicitada",
        "support.started": "Sesión de soporte iniciada",
        "support.requested": "Acceso de soporte solicitado",
        "organization.invite_resent": "Invitación del dueño reenviada",
    }
)
EXCLUDED = {
    "password",
    "invite_code_hash",
    "invite_expires",
    "invite_attempts",
    "invite_sent_at",
    "last_login",
    "secrets_cipher",
    "brand_logo",
    "image",
    "created_at",
    "updated_at",
    "billing_history_starts",
    "account_credit",
}


def set_actor(actor, support=False):
    _context.set((actor, support))


def snapshot(obj):
    if obj is not None and obj._meta.label_lower == 'assistant.assistantstanding':
        return {name: json_value(getattr(obj, name)) for name in ('level', 'reason', 'until', 'restricted_day')}
    if obj is None:
        return {}
    data = {}
    for field in obj._meta.fields:
        if field.generated or field.name in EXCLUDED:
            continue
        value = getattr(obj, field.attname)
        if isinstance(value, bytes):
            continue
        from django.db.models.fields.files import FieldFile

        data[field.attname] = value.name if isinstance(value, FieldFile) else json_value(value)
    if obj.pk:
        for field in obj._meta.many_to_many:
            data[field.name] = list(getattr(obj, field.name).order_by("pk").values_list("pk", flat=True))
    if obj._meta.label_lower == "experience_app.paymentgateway":
        import hashlib

        data["credentials_version"] = (
            hashlib.sha256(obj.secrets_cipher.encode()).hexdigest() if obj.secrets_cipher else ""
        )
    return data


def scope(obj):
    label = obj._meta.label_lower
    if label == "tenancy.organization":
        return obj, None
    if label == "tenancy.restaurant":
        return obj.organization, obj
    if label == "experience_app.paymentgateway":
        from .models import Restaurant

        local = Restaurant.objects.filter(organization__slug=obj.restaurant_slug, slug=obj.venue_slug).first()
        return (local.organization, local) if local else (None, None)
    if hasattr(obj, "restaurant_id") and obj.restaurant_id:
        return obj.restaurant.organization, obj.restaurant
    if hasattr(obj, "organization_id"):
        return obj.organization, None
    for name in ("order", "shift", "product", "recipe", "floor", "reservation", "refund"):
        if hasattr(obj, name) and getattr(obj, name) is not None:
            linked = getattr(obj, name)
            return scope(linked)
    return getattr(obj, "organization", None), None


def record(obj, before, after, verb="updated"):
    context = _context.get()
    if not enabled(obj._meta.label_lower) or before == after:
        return
    from .models import OrganizationAudit, PlatformUser

    org, local = scope(obj)
    if org is None:
        return
    actor, support = context
    kind = "platform" if isinstance(actor, PlatformUser) else "account" if actor else "system"
    name = (
        (f"ProjectApp · {actor.name}" + (" (soporte)" if support else ""))
        if kind == "platform"
        else actor.name
        if actor
        else "Sistema"
    )
    entity = obj._meta.label_lower
    label = after.get("name") or before.get("name") or after.get("number") or before.get("number") or str(obj.pk)
    OrganizationAudit.objects.create(
        organization=org,
        restaurant=local,
        actor_kind=kind,
        actor_id=actor.pk if actor else None,
        actor_name=name,
        action=f"{entity}.{verb}",
        entity=entity,
        entity_id=str(obj.pk),
        summary=f"{VERBS[verb]} de {ENTITIES[entity].lower()}: {label}",
        before=before,
        after=after,
    )


def audited(function):
    """Conserva soporte al entrar a un servicio; fuera de HTTP toma su actor explícito."""

    @wraps(function)
    def wrapped(*args, **kwargs):
        token = None
        if _context.get() is None:
            actor = next(
                (
                    a
                    for a in (*args, *kwargs.values())
                    if hasattr(a, "_meta") and a._meta.label_lower in ("accounts.account", "tenancy.platformuser")
                ),
                None,
            )
            session = getattr(actor, "_support_session", None)
            token = _context.set((session.support_agent if session else actor, bool(session)))
        try:
            with transaction.atomic():
                return function(*args, **kwargs)
        finally:
            if token is not None:
                _context.reset(token)

    return wrapped


def enabled(entity):
    context = _context.get()
    return context is not None and (entity not in SUPPORT_ENTITIES or context[1])


def before_save(sender, instance, **kwargs):
    if enabled(sender._meta.label_lower):
        old = sender.objects.filter(pk=instance.pk).first() if instance.pk else None
        instance._audit_before = snapshot(old)


def after_save(sender, instance, created, **kwargs):
    if enabled(sender._meta.label_lower):
        before = getattr(instance, "_audit_before", {})
        after = snapshot(instance)
        # El servicio operativo genera muchos cambios técnicos; interesan anulaciones, descuentos y cierres.
        support = _context.get()[1]
        if not support and sender._meta.label_lower == "sales.order" and after.get("state") != "cancelled":
            return
        if (
            not support
            and sender._meta.label_lower == "sales.orderline"
            and not (after.get("discount_pct") or after.get("cancelled"))
        ):
            if before.get("discount_pct") == after.get("discount_pct"):
                return
        if (
            not support
            and sender._meta.label_lower == "sales.cashshift"
            and not (after.get("state") == "closed" and after.get("difference"))
        ):
            return
        record(instance, before, after, "created" if created else "updated")


def after_delete(sender, instance, **kwargs):
    if enabled(sender._meta.label_lower):
        record(instance, snapshot(instance), {}, "deleted")


def relations_changed(sender, instance, action, reverse, **kwargs):
    if _context.get() is None or reverse:
        return
    if action.startswith("pre_"):
        instance._audit_relations = snapshot(instance)
    elif action.startswith("post_"):
        record(instance, getattr(instance, "_audit_relations", {}), snapshot(instance))


def connect():
    from django.apps import apps
    from django.db.models.signals import m2m_changed, post_save, pre_delete, pre_save

    for label in ENTITIES:
        model = apps.get_model(label)
        pre_save.connect(before_save, sender=model, weak=False)
        post_save.connect(after_save, sender=model, weak=False)
        # Antes del borrado aún se pueden consultar relaciones y ámbitos.
        pre_delete.connect(after_delete, sender=model, weak=False)
        for field in model._meta.many_to_many:
            m2m_changed.connect(relations_changed, sender=field.remote_field.through, weak=False)
