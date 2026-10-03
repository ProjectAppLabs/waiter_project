"""Identidades públicas: nunca se serializan contraseñas ni códigos."""
from tenancy.http import json_value, model_dict
from .services import restaurants_for


def account_dict(account, status=False):
    result = model_dict(account, ('id', 'name', 'username', 'email', 'role'))
    result['restaurant_ids'] = list(account.restaurants.order_by('id').values_list('id', flat=True))
    result['shift'] = None if account.shift_start is None or account.shift_end is None else {'from': account.shift_start, 'to': account.shift_end}
    if status:
        result['status'] = 'active' if account.activated else 'pending'
    return result


def session_dict(session, attendance=None):
    from tenancy.modules import active_modules
    account = session.account
    attendance = attendance or account.attendances.filter(check_out__isnull=True).first()
    return {'modules': active_modules(account.organization),
            'restaurant_modules': {str(r.pk): active_modules(account.organization, r) for r in restaurants_for(account)},
            'account': account_dict(account), 'attendance_id': attendance.id if attendance else None,
            'session_ends': json_value(session.expires),
            'restaurants': list(restaurants_for(account).order_by('id').values('id', 'name'))}
