"""Premio concedido: conserva sus condiciones y su consumo independientemente del POS."""
from django.db import models


class DinerReward(models.Model):
    ACTIONS = [(value, value) for value in ('cuenta', 'opinion', 'novedades', 'pago_en_linea')]
    REWARDS = [(value, value) for value in ('descuento', 'cupon', 'puntos')]
    STATES = [(value, value) for value in ('disponible', 'reservado', 'usado', 'acreditado', 'pendiente')]

    account = models.ForeignKey('DinerAccount', on_delete=models.CASCADE, related_name='rewards')
    restaurant_slug = models.SlugField(max_length=60)
    venue_slug = models.SlugField(max_length=60)
    action = models.CharField(max_length=20, choices=ACTIONS)
    reference = models.CharField(max_length=64, blank=True, default='')
    reward = models.CharField(max_length=10, choices=REWARDS)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    coupon_code = models.CharField(max_length=32, blank=True, default='')
    points = models.IntegerField(default=0)
    # Nombre, mínimo del cupón y programa también deben sobrevivir a cambios de configuración.
    prize_snapshot = models.JSONField(default=dict)
    state = models.CharField(max_length=10, choices=STATES, default='disponible')
    order = models.ForeignKey('Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='rewards')
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['account', 'restaurant_slug', 'venue_slug', 'action', 'reference'],
                                                name='unique_account_venue_action_reward')]
