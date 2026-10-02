"""Contrato de saldos, movimientos y solicitudes de compra."""
import pytest

from catalog.models import Product
from inventory.models import PurchaseRequest, Stock, StockMove
from tenancy.tests.helpers import account, organization, pos_client

BASE = '/api/pos/v1'


def move(x, **kwargs):
    data = {'restaurant_id': x['r1'].pk, 'kind': 'receipt', 'qty': 2, 'reason': 'Entrega del proveedor',
            'request_key': 'identificador-unico-1234'}
    data.update(kwargs)
    return x['client'].post(f'{BASE}/inventory/{x["ingredient"].pk}/moves', data, format='json')


@pytest.mark.parametrize('qty,level,status', [(0, 'empty', 'request'), (4, 'low', 'request'), (5, 'medium', 'normal'),
                                              (19, 'medium', 'normal'), (20, 'high', 'good')])
def test_niveles_y_detalle(setup, qty, level, status):
    # Falla si los bordes mínimo/máximo o los campos de inventario no coinciden con T1.
    x = setup
    Stock.objects.filter(restaurant=x['r1']).update(qty=qty)
    body = x['client'].get(f'{BASE}/inventory?restaurant_id={x["r1"].pk}&dishes=1').json()
    item = body['ingredients'][0]
    assert (item['qty'], item['level'], item['status'], item['unit']['name']) == (qty, level, status, 'kg')
    assert body['dishes'][0]['servings'] == qty * 4
    detail = x['client'].get(f'{BASE}/inventory/{x["ingredient"].pk}?restaurant_id={x["r1"].pk}').json()
    assert detail == {'stock': qty, 'pending': 0, 'cost': 2000, 'min': 5, 'max': 20, 'unit': 'kg', 'history': []}


def test_recibo_merma_conteo_y_reintentos(setup):
    # Falla si un reintento repite una entrada, una merma deja negativo o un conteo ignora cambios de saldo.
    x = setup
    a = move(x)
    assert a.status_code == 200, a.data
    assert a.json()['stock'] == 5 and a.json()['move']['qty'] == 2
    assert move(x).json() == a.json()
    assert StockMove.objects.count() == 1
    response = move(x, kind='waste', qty=6, request_key='merma-identificador-123')
    assert response.status_code == 400 and response.json()['error'] == 'insufficient_stock'
    response = move(x, kind='waste', qty=1, request_key='merma-identificador-123')
    assert response.json()['stock'] == 4 and response.json()['move']['qty'] == -1
    response = move(x, kind='count', qty=8, expected_stock=5, request_key='conteo-identificador-123')
    assert response.status_code == 409 and response.json()['error'] == 'stock_changed'
    response = move(x, kind='count', qty=8, expected_stock=4, request_key='conteo-identificador-123')
    assert response.json()['stock'] == 8 and response.json()['move']['qty'] == 4
    assert move(x, kind='count', qty=8, expected_stock=4, request_key='conteo-identificador-123').json() == response.json()
    assert move(x, qty=100).json()['error'] == 'request_key_conflict'
    assert move(x, restaurant_id=x['r2'].pk).json()['error'] == 'request_key_conflict'
    history = x['client'].get(f'{BASE}/inventory/{x["ingredient"].pk}?restaurant_id={x["r1"].pk}').json()['history']
    assert len(history) == 3 and history[0]['account_name'] == x['person'].name
    assert history[0]['date'].endswith('Z')


@pytest.mark.parametrize('values', [{'qty': -1}, {'qty': True}, {'kind': 'sale'}, {'reason': ''}, {'reason': 'x' * 301},
                                    {'request_key': 'corto'}, {'request_key': 'x' * 81}, {'kind': 'count'}, {'qty': 0}])
def test_movimientos_invalidos_no_cambian_saldo(setup, values):
    # Falla si datos ambiguos o incompletos alcanzan el registro de movimientos.
    x = setup
    response = move(x, **values)
    assert response.status_code == 400, response.data
    assert Stock.objects.get(restaurant=x['r1'], ingredient=x['ingredient']).qty == 3
    assert not StockMove.objects.exists()


def test_conteo_cero_delta_se_registra(setup):
    # Falla si un conteo sin diferencia pierde la clave y luego se aplica tras otra entrada.
    x = setup
    a = move(x, kind='count', qty=3, expected_stock=3)
    assert a.json()['move']['qty'] == 0
    move(x, request_key='otro-identificador-valido')
    assert move(x, kind='count', qty=3, expected_stock=3).json() == a.json()
    assert Stock.objects.get(restaurant=x['r1'], ingredient=x['ingredient']).qty == 5


@pytest.mark.parametrize('role', ['owner', 'admin', 'waiter', 'cashier'])
def test_settings_permisos_y_ambito(setup, role):
    # Falla si el encargado modifica costo, el personal modifica stock o se opera una sede ajena.
    x = setup
    c = pos_client(account(x['org'], role=role, username='otro', restaurants=[] if role == 'owner' else [x['r1']]))
    url = f'{BASE}/inventory/{x["ingredient"].pk}/settings'
    response = c.put(url, {'restaurant_id': x['r1'].pk, 'min': 30, 'max': 30}, format='json')
    assert response.status_code == (200 if role in ('owner', 'admin') else 403)
    if response.status_code == 200:
        assert (response.json()['min'], response.json()['max']) == (30, 45)
    response = c.put(url, {'restaurant_id': x['r1'].pk, 'cost': 7}, format='json')
    assert response.status_code == (200 if role == 'owner' else 403)
    assert c.get(f'{BASE}/inventory?restaurant_id={x["r2"].pk}').status_code == (200 if role == 'owner' else 404)
    x['client'] = c
    assert move(x).status_code == (200 if role in ('owner', 'admin') else 403)
    assert move(x, restaurant_id=x['r2'].pk).status_code == (409 if role == 'owner' else 404 if role == 'admin' else 403)


def test_solicita_amplia_recibe_una_vez(setup):
    # Falla si solicitar no amplía el borrador del proveedor o recibir dos veces duplica existencias.
    x = setup
    url = f'{BASE}/inventory/requests'
    body = {'restaurant_id': x['r1'].pk, 'ingredient_id': x['ingredient'].pk}
    a = x['client'].post(url, body, format='json')
    assert a.status_code == 201, a.data
    request = a.json()['request']
    assert request['lines'][0]['qty'] == 17
    assert request['lines'][0]['price_unit'] == 2000
    b = x['client'].post(url, {**body, 'qty': 2}, format='json').json()
    assert b['request']['id'] == request['id'] and b['created'] is False
    assert b['request']['lines'][0]['qty'] == 19
    another = Product.objects.create(organization=x['org'], name='Sal', kind='ingredient', pantry_category='dry', unit=x['kg'], supplier=x['supplier'])
    c = x['client'].post(url, {**body, 'ingredient_id': another.pk, 'qty': 5}, format='json').json()
    assert c['request']['id'] == request['id'] and len(c['request']['lines']) == 2
    mark = f'{url}/{request["id"]}/mark'
    assert x['client'].post(mark, {'state': 'sent'}, format='json').status_code == 200
    assert x['client'].post(mark, {'state': 'received'}, format='json').status_code == 200
    assert x['client'].post(mark, {'state': 'received'}, format='json').status_code == 200
    assert StockMove.objects.filter(kind='receipt').count() == 2
    assert Stock.objects.get(ingredient=x['ingredient'], restaurant=x['r1']).qty == 22
    assert Stock.objects.get(ingredient=another, restaurant=x['r1']).qty == 5
    assert x['client'].post(mark, {'state': 'sent'}, format='json').status_code == 409
    assert x['client'].get(f'{url}?restaurant_id={x["r1"].pk}').json()['requests'][0]['state'] == 'received'


def test_solicitudes_proveedor_minimo_y_cancelacion(setup):
    # Falla si se solicita sin proveedor, la cantidad omitida baja de uno o cancelar genera recibos.
    x = setup
    body = {'restaurant_id': x['r1'].pk, 'ingredient_id': x['ingredient'].pk}
    x['ingredient'].supplier = None
    x['ingredient'].save()
    response = x['client'].post(f'{BASE}/inventory/requests', body, format='json')
    assert response.status_code == 409 and response.json()['error'] == 'no_supplier'
    x['ingredient'].supplier = x['supplier']
    x['ingredient'].save()
    Stock.objects.filter(restaurant=x['r1']).update(qty=30)
    response = x['client'].post(f'{BASE}/inventory/requests', body, format='json')
    request = response.json()['request']
    assert request['lines'][0]['qty'] == 1
    assert x['client'].post(f'{BASE}/inventory/requests/{request["id"]}/mark', {'state': 'cancelled'}, format='json').status_code == 200
    assert not StockMove.objects.exists()


def test_solicitudes_permisos_y_aislamiento(setup):
    # Falla si un mesero solicita compras o el encargado recibe solicitudes de otra sede u organización.
    x = setup
    body = {'restaurant_id': x['r1'].pk, 'ingredient_id': x['ingredient'].pk}
    request = x['client'].post(f'{BASE}/inventory/requests', body, format='json').json()['request']
    for role in ('cashier', 'waiter'):
        c = pos_client(account(x['org'], role=role, username=role, restaurants=[x['r1']]))
        assert c.post(f'{BASE}/inventory/requests', body, format='json').status_code == 403
    admin = pos_client(account(x['org'], role='admin', username='encargado', restaurants=[x['r2']]))
    url = f'{BASE}/inventory/requests/{request["id"]}/mark'
    assert admin.post(url, {'state': 'received'}, format='json').status_code == 404
    other = organization('otra')
    c = pos_client(account(other))
    assert c.post(url, {'state': 'received'}, format='json').status_code == 404
    assert c.get(f'{BASE}/inventory/{x["ingredient"].pk}?restaurant_id={x["r1"].pk}').status_code == 404
    assert PurchaseRequest.objects.get(pk=request['id']).state == 'draft'


def test_historial_ultimos_cien_y_etag_movimiento(setup):
    # Falla si el historial carece de límite o una escritura de stock no invalida la carta.
    x = setup
    catalog = f'{BASE}/catalog?restaurant_id={x["r1"].pk}'
    old = x['client'].get(catalog)['ETag']
    StockMove.objects.bulk_create([StockMove(organization=x['org'], restaurant=x['r1'], ingredient=x['ingredient'],
        unit=x['kg'], kind='receipt', qty=1, requested_qty=1, stock_after=1, account=x['person'], reason='Entrega',
        request_key=f'historial-identificador-{i}') for i in range(105)])
    assert move(x).status_code == 200
    assert x['client'].get(catalog)['ETag'] != old
    history = x['client'].get(f'{BASE}/inventory/{x["ingredient"].pk}?restaurant_id={x["r1"].pk}').json()['history']
    assert len(history) == 100 and history[0]['qty'] == 2


def test_reintento_despues_de_otro_movimiento_conserva_respuesta(setup):
    # Falla si el reintento devuelve otro saldo o vuelve a aplicar un movimiento ya confirmado.
    x = setup
    first = move(x).json()
    assert move(x, qty=7, request_key='otra-entrada-identificador').json()['stock'] == 12
    assert move(x).json() == first
    assert Stock.objects.get(ingredient=x['ingredient'], restaurant=x['r1']).qty == 12


def test_ampliar_compra_tras_cambiar_unidad(setup):
    # Falla si añadir gramos a una solicitud en kg mezcla unidades o recibe una cantidad equivocada.
    x = setup
    body = {'restaurant_id': x['r1'].pk, 'ingredient_id': x['ingredient'].pk, 'qty': 1}
    first = x['client'].post(f'{BASE}/inventory/requests', body, format='json').json()['request']
    assert x['client'].patch(f'{BASE}/products/{x["ingredient"].pk}', {'unit_id': x['gram'].pk}, format='json').status_code == 200
    second = x['client'].post(f'{BASE}/inventory/requests', {**body, 'qty': 500}, format='json').json()['request']
    assert second['id'] == first['id'] and second['lines'][0]['qty'] == 1.5 and second['lines'][0]['unit_name'] == 'kg'
    assert x['client'].post(f'{BASE}/inventory/requests/{first["id"]}/mark', {'state': 'received'}, format='json').status_code == 200
    assert Stock.objects.get(restaurant=x['r1'], ingredient=x['ingredient']).qty == 4500
