"""Destinatarios y visibilidad de avisos sin cruces entre organizaciones."""
from django.db.models import Q

from accounts.models import Account
from accounts.services import restaurants_for
from .models import Notification


def notify_outside_hours(account, restaurant, window):
    recipients = Account.objects.filter(organization=account.organization, active=True).filter(
        Q(role='owner') | Q(role='admin', restaurants=restaurant)).distinct()
    Notification.objects.bulk_create([Notification(
        organization=account.organization, restaurant=restaurant, recipient=recipient, kind='access',
        title='Intento de acceso fuera de turno',
        body=f'{account.name} intentó entrar a las {window["local_time"]}, fuera de su turno ({window["label"]})',
        res_model='accounts.Account', res_id=account.id,
    ) for recipient in recipients])


def visible_notifications(account):
    return Notification.objects.filter(organization=account.organization).filter(
        Q(recipient=account) | Q(recipient__isnull=True, restaurant__in=restaurants_for(account))).order_by('-created_at', '-id')


def notify_low_stock():
    """Un aviso por episodio de escasez; pedir al proveedor no abre otro hasta recuperarse."""
    from catalog.services import writing
    from inventory.models import Stock
    from tenancy.models import Organization
    from sales.services import event

    created = 0
    for org in Organization.objects.all().iterator():
        with writing(org, operational=True):
            stocks = list(Stock.objects.filter(restaurant__organization=org, restaurant__active=True,
                ingredient__active=True, ingredient__track_stock=True).select_related('restaurant', 'ingredient'))
            existing = {(n.restaurant_id, n.res_id): n for n in Notification.objects.filter(
                organization=org, kind='inventory', res_model='catalog.Product', low_stock_open=True)}
            changed = {}
            low = set()
            for stock in stocks:
                key = (stock.restaurant_id, stock.ingredient_id)
                if stock.qty >= stock.min:
                    continue
                low.add(key)
                if key in existing:
                    continue
                Notification.objects.create(organization=org, restaurant=stock.restaurant, kind='inventory', title='Stock bajo',
                    body=f'{stock.ingredient.name}: quedan {stock.qty:g} (mínimo {stock.min:g}). Pide al proveedor pronto.',
                    res_model='catalog.Product', res_id=stock.ingredient_id, action='request_ingredient', low_stock_open=True)
                changed[stock.restaurant_id] = stock.restaurant
                created += 1
            recovered = [row.pk for key, row in existing.items() if key not in low]
            if recovered:
                Notification.objects.filter(pk__in=recovered).update(action_done=True, low_stock_open=False)
                from tenancy.models import Restaurant
                changed.update({r.pk: r for r in Restaurant.objects.filter(pk__in=[key[0] for key in existing if key not in low])})
            for restaurant in changed.values():
                event(restaurant, 'notify')
    return created
