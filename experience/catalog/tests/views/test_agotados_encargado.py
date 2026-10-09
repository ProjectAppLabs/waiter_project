"""El encargado lista los agotados de SU restaurante para poder reactivarlos; el GET no le filtra precios."""
from tenancy.tests.helpers import account, pos_client

BASE = '/api/pos/v1'


def test_encargado_ve_agotados_de_su_sede_sin_precios(setup):
    """El encargado relee los agotados de su restaurante y el GET no le expone precios."""
    # Falla si el encargado no puede releer los agotados de su restaurante, o si el GET le expone precios.
    x = setup
    manager = account(x['org'], role='admin', username='encargada', restaurants=[x['r1']])
    c = pos_client(manager)
    url = f'{BASE}/catalog/restaurants/{x["r1"].pk}/products/{x["dish"].pk}'
    assert c.put(url, {'unavailable': True}, format='json').status_code == 200
    body = c.get(f'{BASE}/catalog/restaurants').json()
    assert body['unavailable'][str(x['r1'].pk)] == [x['dish'].pk]
    assert [d['id'] for d in body['dishes']] == [x['dish'].pk]
    assert body['prices'] == {}
    assert all('price' not in d for d in body['dishes'])


def test_dueno_conserva_los_precios(setup):
    """El dueño conserva en el GET los precios por restaurante que el encargado ya no recibe."""
    # Falla si el dueño pierde los precios por restaurante que el encargado ya no recibe.
    x = setup
    body = x['client'].get(f'{BASE}/catalog/restaurants').json()
    assert str(x['r1'].pk) in body['prices']
    assert all('price' in d for d in body['dishes'])
