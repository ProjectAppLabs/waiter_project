import pytest
from django.urls import reverse

PAYLOAD = {'restaurante': 'burger-house', 'sede': 'poblado', 'token': '8H2KQ7'}


@pytest.mark.django_db
# Falla si la API del carrito no refleja el alta, la cantidad actualizada o la eliminación de una línea propia.
def test_add_patch_and_delete_a_line_through_the_api(api_client, table_tenant, catalog_stub):
    """Atrapa un carrito que no refleja alta, cambio y baja de una línea del propio comensal."""
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    added = api_client.post(reverse('add-line', args=[sid]), {'producto_id': 3, 'cantidad': 2, 'nota': 'término medio'}, format='json').json()
    assert added['total'] == 87822.0  # 2 × 43.911: precio final con impuestos
    patched = api_client.patch(reverse('line', args=[sid, added['linea']]), {'cantidad': 1}, format='json').json()
    assert patched['lineas'][0]['cantidad'] == 1
    assert api_client.delete(reverse('line', args=[sid, added['linea']])).json()['lineas'] == []


@pytest.mark.django_db
# Falla si la cookie de otro comensal permite borrar una línea ajena sin devolver 403.
def test_another_diner_cannot_touch_my_line(api_client, table_tenant, catalog_stub):
    """Atrapa que la cookie de otro comensal edite mis platos."""
    sid = api_client.post(reverse('open-session'), PAYLOAD, format='json').json()['sesion']['id']
    line = api_client.post(reverse('add-line', args=[sid]), {'producto_id': 7}, format='json').json()['linea']
    other = api_client.__class__()
    other.post(reverse('open-session'), PAYLOAD, format='json')
    response = other.delete(reverse('line', args=[sid, line]))
    assert response.status_code == 403
    assert response.json()['detail'] == 'Solo quien agregó el plato puede cambiarlo'
