"""Asignación explícita de vistas y alcance local de la API operativa."""
from .modules import require_module

APP_MODULES = {'inventory': 'inventario', 'billing': 'facturacion', 'reservations': 'reservas',
               'loyalty': 'fidelizacion', 'tables': 'salon', 'kitchen': 'cocina'}
VIEW_MODULES = {'catalog.api.RecipeView': 'inventario', 'reports.api.ProfitabilityView': 'inventario',
                'notifications.preferences.RequestIngredientView': 'inventario'}


def check_pos_view(view, request, kwargs):
    from accounts.services import restaurants_for
    from django.apps import apps
    cls = type(view)
    module = VIEW_MODULES.get(f'{cls.__module__}.{cls.__name__}', APP_MODULES.get(cls.__module__.split('.')[0], 'nucleo'))
    # Los datos fiscales de empresa y marca son parte del Núcleo.
    if cls.__module__ == 'billing.company':
        module = 'nucleo'
    # Un documento en contingencia debe poder terminar después de apagar facturación.
    if cls.__module__ == 'billing.api' and cls.__name__ == 'RetryView':
        return
    if cls.__module__ == 'reservations.api' and getattr(view, 'action', '') == 'deposit-paid':
        return
    if cls.__module__ == 'kitchen.api' and getattr(view, 'action', '') == 'serve':
        module = 'salon'
    view.account._required_module = module
    data = request.data if isinstance(request.data, dict) else {}
    rid = kwargs.get('restaurant_id') or request.query_params.get('restaurant_id') or data.get('restaurant_id')
    # El recurso de la URL manda sobre cualquier local enviado en el cuerpo.
    resources = {
        'inventory.api.MarkView': ('inventory.PurchaseRequest', 'restaurant_id', 'restaurant__organization'),
        'notifications.preferences.RequestIngredientView': ('notifications.Notification', 'restaurant_id', 'organization'),
        'tables.api.FloorsView': ('tables.Floor', 'restaurant_id', 'restaurant__organization'),
        'tables.api.PlanView': ('tables.Floor', 'restaurant_id', 'restaurant__organization'),
        'tables.api.ZoneStaffView': ('tables.Floor', 'restaurant_id', 'restaurant__organization'),
        'tables.api.ShiftZonesView': ('sales.CashShift', 'restaurant_id', 'restaurant__organization'),
        'tables.api.CallsView': ('tables.Table', 'floor__restaurant_id', 'floor__restaurant__organization'),
        'kitchen.api.CourseView': ('sales.Course', 'order__restaurant_id', 'order__organization'),
        'reservations.api.ReservationsView': ('reservations.Reservation', 'restaurant_id', 'organization'),
        'reservations.api.ReservationActionView': ('reservations.Reservation', 'restaurant_id', 'organization'),
        'billing.api.ReviewView': ('sales.Order', 'restaurant_id', 'organization'),
        'billing.api.EmitView': ('sales.Order', 'restaurant_id', 'organization'),
        'billing.api.DocumentsView': ('billing.SalesDocument', 'restaurant_id', 'organization'),
        'billing.api.DetailView': ('billing.SalesDocument', 'restaurant_id', 'organization'),
        'billing.api.PrintView': ('billing.SalesDocument', 'restaurant_id', 'organization'),
        'loyalty.api.RedeemView': ('sales.Order', 'restaurant_id', 'organization'),
    }
    if cls.__module__ == 'kitchen.api' and cls.__name__ == 'LinesView':
        ids = data.get('line_ids')
        if isinstance(ids, list) and all(type(pk) is int for pk in ids):
            locals_ = list(restaurants_for(view.account).filter(pk__in=apps.get_model('sales.OrderLine').objects.filter(pk__in=ids, order__organization=view.org).values('order__restaurant_id')).distinct())
            for local in locals_:
                require_module(view.org, module, local)
            if locals_:
                view.account._module_restaurant = locals_[0]
                return
    resource = resources.get(f'{cls.__module__}.{cls.__name__}')
    if resource and kwargs.get('pk'):
        model, field, scope = resource
        rid = apps.get_model(model).objects.filter(pk=kwargs['pk'], **{scope: view.org}).values_list(field, flat=True).first()
    if rid is not None:
        # La guarda comercial no adelanta los errores de rol/alcance de cada vista.
        local = restaurants_for(view.account).filter(pk=rid).first() if str(rid).isdecimal() else None
        if local:
            view.account._module_restaurant = local
    else:
        local = getattr(view.account, '_module_restaurant', None)
    require_module(view.org, module, local)
