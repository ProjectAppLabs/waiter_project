import secrets
import uuid

from django.db import models
from tenancy.fields import ExactCharField


def new_key() -> str:
    return secrets.token_urlsafe(32)


class Diner(models.Model):
    """Comensal sin registro: lo identifica una cookie. Cada línea del carrito sabe de quién es."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey('experience_app.TableSession', on_delete=models.CASCADE, related_name='diners')
    key = ExactCharField(max_length=64, unique=True, default=new_key)
    benefit_key = ExactCharField(max_length=64, default=new_key)
    coupon_code = models.CharField(max_length=32, blank=True)
    name = models.CharField(max_length=60, blank=True)
    # Cuenta verificada desde esta cookie (Plan H). Se hereda al comensal nuevo cuando la misma cookie abre otra visita.
    account = models.ForeignKey('experience_app.DinerAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='diners')
    created_at = models.DateTimeField(auto_now_add=True)
