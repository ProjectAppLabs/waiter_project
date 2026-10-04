"""Movimientos y compras serializados por organización, con saldo y auditoría atómicos."""
from tenancy.audit import audited
import uuid
from decimal import Decimal

from django.db.models import Prefetch

from catalog.models import Product
from catalog.services import identifier, manager, number, owner, reference, restaurant_for, valid, writing
from tenancy.http import model_dict, payload, require

from .models import PurchaseRequest, PurchaseRequestLine, Stock, StockMove


def level_for(qty, minimum=5, maximum=20):
    return 'empty' if qty <= 0 else 'low' if qty < minimum else 'medium' if qty < maximum else 'high'


STATUS = {'empty': 'request', 'low': 'request', 'medium': 'normal', 'high': 'good'}
STATE_LABELS = {'draft': 'Borrador', 'sent': 'Enviada', 'received': 'Recibida', 'cancelled': 'Cancelada'}


def move_dict(move, unit=None):
    qty = move.qty * move.unit.factor / unit.factor if unit and move.unit_id else move.qty
    return {**model_dict(move, ('id', 'reason', 'kind')), 'qty': float(qty), 'date': model_dict(move, ('created_at',))['created_at'],
            'account_name': move.account.name if move.account else 'Pedido autónomo'}


def detail(product, restaurant):
    stock = Stock.objects.filter(restaurant=restaurant, ingredient=product).first()
    from catalog.reading import CatalogData
    data = CatalogData(product.organization, [restaurant])
    pending = data.pending[(restaurant.pk, product.pk)]
    return {'stock': float(stock.qty) if stock else 0, 'pending': float(pending), 'cost': float(product.cost),
            'min': float(stock.min) if stock else 5, 'max': float(stock.max) if stock else 20,
            'unit': product.unit.name, 'history': [move_dict(m, product.unit) for m in StockMove.objects.filter(
                restaurant=restaurant, ingredient=product).select_related('account', 'unit').order_by('-created_at', '-id')[:100]]}


@audited
def initial_stock(account, product, data):
    minimum, maximum = number(data.get('min', 5)), number(data.get('max', 20))
    initial = data.get('initial_stock', [])
    valid(isinstance(initial, list))
    quantities = {}
    for item in initial:
        item = payload(item, ('restaurant_id', 'qty'), ('restaurant_id', 'qty'))
        rid = identifier(item['restaurant_id'])
        restaurant_for(account, rid)
        valid(rid not in quantities, 'No repitas restaurantes.')
        quantities[rid] = number(item['qty'])
    for restaurant in account.organization.restaurants.filter(active=True):
        qty = quantities.get(restaurant.pk, Decimal(0))
        Stock.objects.create(restaurant=restaurant, ingredient=product, qty=qty, min=minimum, max=maximum)
        if qty:
            StockMove.objects.create(organization=account.organization, restaurant=restaurant, ingredient=product,
                                     kind='adjust', qty=qty, reason='Existencias iniciales', request_key=uuid.uuid4().hex,
                                     account=account, unit=product.unit, requested_qty=qty, stock_after=qty)


def apply_move(account, product, restaurant, data):
    """Requiere writing() del llamador; las recepciones de compra comparten la transacción."""
    data = payload(data, ('restaurant_id', 'kind', 'qty', 'reason', 'request_key', 'expected_stock'),
                   ('kind', 'qty', 'reason', 'request_key'))
    kind, reason, key = data['kind'], data['reason'], data['request_key']
    valid(kind in ('receipt', 'waste', 'count'))
    valid(isinstance(reason, str) and 1 <= len(reason.strip()) <= 300)
    reason = reason.strip()
    valid(isinstance(key, str) and 16 <= len(key) <= 80)
    qty = number(data['qty'], positive=kind != 'count')
    expected = number(data.get('expected_stock')) if kind == 'count' else None
    existing = StockMove.objects.filter(organization=account.organization, request_key=key).select_related('account').first()
    if existing:
        require(existing.ingredient_id == product.pk and existing.restaurant_id == restaurant.pk and existing.kind == kind
                and existing.requested_qty == qty and existing.reason == reason,
                'El identificador ya se usó para otro movimiento.', 'request_key_conflict', 409)
        return {'stock': float(existing.stock_after), 'move': move_dict(existing)}
    stock, _ = Stock.objects.get_or_create(restaurant=restaurant, ingredient=product)
    stock = Stock.objects.select_for_update().get(pk=stock.pk)
    if kind == 'count':
        require(expected == stock.qty, 'Las existencias cambiaron mientras contabas. Actualiza el conteo.', 'stock_changed', 409)
        delta = qty - stock.qty
    else:
        delta = qty if kind == 'receipt' else -qty
    require(stock.qty + delta >= 0, 'No hay existencias suficientes para esta merma.', 'insufficient_stock', 400)
    stock.qty += delta
    stock.save()
    move = StockMove.objects.create(organization=account.organization, restaurant=restaurant, ingredient=product,
                                    kind=kind, qty=delta, reason=reason, request_key=key, account=account,
                                    unit=product.unit, requested_qty=qty, stock_after=stock.qty)
    return {'stock': float(stock.qty), 'move': move_dict(move)}


@audited
def record_move(account, product, raw):
    manager(account)
    data = payload(raw, ('restaurant_id', 'kind', 'qty', 'reason', 'request_key', 'expected_stock'),
                   ('restaurant_id', 'kind', 'qty', 'reason', 'request_key'))
    restaurant = restaurant_for(account, identifier(data['restaurant_id']))
    with writing(account.organization):
        product = reference(Product, account.organization, product.pk, kind='ingredient', active=True)
        return apply_move(account, product, restaurant, data)


@audited
def settings(account, product, raw):
    manager(account)
    data = payload(raw, ('restaurant_id', 'min', 'max', 'cost'), ('restaurant_id',))
    restaurant = restaurant_for(account, identifier(data.pop('restaurant_id')))
    if 'cost' in data:
        owner(account)
    with writing(account.organization):
        product = reference(Product, account.organization, product.pk, kind='ingredient', active=True)
        stock, _ = Stock.objects.get_or_create(restaurant=restaurant, ingredient=product)
        for key, value in data.items():
            setattr(product if key == 'cost' else stock, key, number(value))
        if 'cost' in data:
            product.save(update_fields=['cost'])
        stock.save()
    return detail(product, restaurant)


def request_dict(request):
    return {'id': request.pk, 'state': request.state, 'state_label': STATE_LABELS[request.state],
            'supplier_name': request.supplier.name, 'date': model_dict(request, ('created_at',))['created_at'],
            'lines': [{**model_dict(line, ('id', 'ingredient_id', 'qty', 'price_unit')), 'name': line.ingredient.name,
                       'unit_name': line.unit.name} for line in request.lines.all()]}


def requests_for(restaurants):
    return PurchaseRequest.objects.filter(restaurant__in=restaurants).select_related('supplier').prefetch_related(
        Prefetch('lines', queryset=PurchaseRequestLine.objects.select_related('ingredient', 'unit').order_by('id'))).order_by('-created_at', '-id')


def create_request(account, raw):
    manager(account)
    data = payload(raw, ('restaurant_id', 'ingredient_id', 'qty'), ('restaurant_id', 'ingredient_id'))
    restaurant = restaurant_for(account, identifier(data['restaurant_id']))
    with writing(account.organization):
        ingredient = reference(Product, account.organization, data['ingredient_id'], kind='ingredient', active=True)
        require(ingredient.supplier_id and ingredient.supplier.active, 'Asigna un proveedor antes de solicitar el ingrediente.', 'no_supplier', 409)
        stock, _ = Stock.objects.get_or_create(restaurant=restaurant, ingredient=ingredient)
        qty = number(data['qty'], positive=True) if 'qty' in data else max(stock.max - stock.qty, Decimal(1))
        purchase, created = PurchaseRequest.objects.get_or_create(restaurant=restaurant, supplier=ingredient.supplier, state='draft',
                                                                 defaults={'account': account})
        line, new = PurchaseRequestLine.objects.get_or_create(request=purchase, ingredient=ingredient,
                         defaults={'qty': qty, 'unit': ingredient.unit, 'price_unit': ingredient.cost})
        if not new:
            line.qty += qty * ingredient.unit.factor / line.unit.factor
            line.save(update_fields=['qty'])
        return {'request': request_dict(requests_for([restaurant]).get(pk=purchase.pk)), 'created': created}


def mark_request(account, pk, raw):
    manager(account)
    data = payload(raw, ('state',), ('state',))
    state = data['state']
    valid(state in ('sent', 'received', 'cancelled'))
    with writing(account.organization):
        purchase = PurchaseRequest.objects.filter(pk=pk, restaurant__organization=account.organization).first()
        require(purchase, 'No encontramos la solicitud.', 'not_found', 404)
        restaurant = restaurant_for(account, purchase.restaurant_id)
        require(purchase.state == state or purchase.state in ('draft', 'sent'),
                'La solicitud ya está finalizada.', 'invalid_state', 409)
        if purchase.state != state:
            if state == 'received':
                for line in purchase.lines.select_related('ingredient__unit', 'unit'):
                    qty = line.qty * line.unit.factor / line.ingredient.unit.factor
                    apply_move(account, line.ingredient, restaurant, {'kind': 'receipt', 'qty': qty,
                               'reason': f'Recepción de solicitud {purchase.pk}', 'request_key': f'purchase:{purchase.pk}:line:{line.pk}:receipt'})
            purchase.state = state
            purchase.save(update_fields=['state'])
        return {'request': request_dict(requests_for([restaurant]).get(pk=pk))}


def apply_sale(account, product, order, qty):
    """Descuenta una receta una sola vez; conserva el faltante en el motivo del movimiento."""
    key = f'order:{order.pk}:ingredient:{product.pk}'
    if StockMove.objects.filter(organization=order.organization, request_key=key).exists():
        return
    stock, _ = Stock.objects.get_or_create(restaurant=order.restaurant, ingredient=product)
    stock = Stock.objects.select_for_update().get(pk=stock.pk)
    delta = min(stock.qty, qty)
    reason = f'Venta {order.number}'
    if delta < qty:
        reason += f'; faltaron {qty-delta} {product.unit.name}; existencias limitadas a cero'
    stock.qty -= delta
    stock.save()
    StockMove.objects.create(organization=order.organization, restaurant=order.restaurant, ingredient=product,
        kind='sale', qty=-delta, reason=reason, request_key=key, account=account, unit=product.unit,
        requested_qty=qty, stock_after=stock.qty)


def apply_return(refund, balances):
    """Repone el consumo guardado al cobrar, en la unidad actual del ingrediente."""
    from collections import defaultdict
    from catalog.models import Unit
    from sales.refunds import POINT, decimal, proportional

    amounts = defaultdict(Decimal)
    order = refund.order
    all_lines = list(order.lines.filter(cancelled=False).order_by("id"))
    selected = {row['line_id']: row for row in refund.lines}
    # Los pedidos anteriores a U1 no guardaban consumo por línea. Se reconstruye de la receta,
    # limitado a lo realmente descontado por la venta; las ventas nuevas usan siempre la copia.
    legacy = {}
    if not any(line.stock_usage for line in all_lines):
        from catalog.reading import CatalogData
        data = CatalogData(order.organization, [order.restaurant])
        parents = {line.parent_id for line in all_lines if line.parent_id}
        needs, total = {}, defaultdict(Decimal)
        for line in all_lines:
            if line.pk in parents or line.points_cost:
                continue
            needs[line.pk] = {pk: qty * line.qty for pk, qty in data.requirements(line.product_id).items()}
            for pk, qty in needs[line.pk].items():
                total[pk] += qty
        moves = StockMove.objects.filter(organization=order.organization,
                    request_key__in=[f'order:{order.pk}:ingredient:{pk}' for pk in total]).select_related('unit', 'ingredient__unit')
        for move in moves:
            allocated, consumed = Decimal(0), Decimal(0)
            for line_id, usage in needs.items():
                if usage.get(move.ingredient_id) and total[move.ingredient_id]:
                    allocated += usage[move.ingredient_id]
                    target = proportional(-move.qty, allocated, total[move.ingredient_id], POINT)
                    legacy.setdefault(line_id, []).append(dict(ingredient_id=move.ingredient_id, unit_id=move.unit_id,
                                                              qty=str(target - consumed)))
                    consumed = target
    units = {u.pk: u for u in Unit.objects.filter(organization=order.organization)}
    for line in all_lines:
        parent_id = line.parent_id or line.pk
        if parent_id not in selected:
            continue
        balance = balances[parent_id]
        before = balance['returned']['qty']
        qty = decimal(selected[parent_id]['qty'])
        for usage in line.stock_usage or legacy.get(line.pk, []):
            consumed = decimal(usage['qty'])
            delta = (proportional(consumed, before + qty, balance['line'].qty, POINT)
                     - proportional(consumed, before, balance['line'].qty, POINT))
            amounts[(usage['ingredient_id'], usage['unit_id'])] += delta
    for (ingredient_id, unit_id), qty in amounts.items():
        if qty <= 0:
            continue
        product = Product.objects.select_related('unit').get(pk=ingredient_id, organization=order.organization)
        if unit_id:
            qty = (qty * units[unit_id].factor / product.unit.factor).quantize(POINT)
        stock, _ = Stock.objects.get_or_create(restaurant=order.restaurant, ingredient=product)
        stock = Stock.objects.select_for_update().get(pk=stock.pk)
        stock.qty += qty
        stock.save()
        StockMove.objects.create(organization=order.organization, restaurant=order.restaurant, ingredient=product,
            kind='return', qty=qty, reason=f'Devolución {refund.pk} de {order.number}: {refund.reason}'[:300],
            request_key=f'refund:{refund.pk}:ingredient:{ingredient_id}', account=refund.account,
            unit=product.unit, requested_qty=qty, stock_after=stock.qty)
