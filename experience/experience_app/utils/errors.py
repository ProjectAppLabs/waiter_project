"""Errores de dominio y su traducción a respuestas (manejador de DRF)."""
from rest_framework.response import Response
from rest_framework.views import exception_handler

from django.db import OperationalError
from experience_app.adapters.core.context import RestaurantNotFound


class NotOwner(Exception):
    """Un comensal intenta tocar la línea de otro."""


class ProductNotFound(Exception):
    pass


class ConfirmationBusy(Exception):
    pass


class NothingToConfirm(Exception):
    pass


class SessionAlreadyPaid(Exception):
    """La cuenta de esta visita ya se pagó (la cobró el salón): la sesión termina y hay que abrir otra."""


MAPPING = [
    (ConfirmationBusy, 423, 'El pedido se está confirmando; espera y vuelve a intentar'),
    (RestaurantNotFound, 404, 'Esta mesa no está disponible'),
    (ProductNotFound, 400, 'Ese producto no está en la carta'),
    (NotOwner, 403, 'Solo quien agregó el plato puede cambiarlo'),
    (NothingToConfirm, 400, 'No hay nada que confirmar'),
    (SessionAlreadyPaid, 409, 'La cuenta de esta mesa ya se pagó. Vuelve a tocar el NFC para empezar una nueva.'),
    (OperationalError, 503, 'El restaurante no responde; tu pedido se conserva, intenta de nuevo'),
]


def handle(exc, context):
    from tenancy.http import Problem
    if isinstance(exc, Problem):
        return Response(exc.body, status=exc.status)
    for kind, status, message in MAPPING:
        if isinstance(exc, kind):
            # El código deja al menú distinguir «la cuenta ya se pagó» (abrir otra visita) de otros conflictos.
            return Response({'detail': message, **({'error': 'session_paid'} if kind is SessionAlreadyPaid else {})}, status=status)
    return exception_handler(exc, context)
