"""Un envío por encima del límite del servidor responde con su causa, no con la página HTML de Django."""
import logging

import pytest

from catalog.models import Product
from catalog.services import seed_organization
from tenancy.tests.helpers import account, organization, pos_client, restaurant

pytestmark = pytest.mark.django_db
DEMASIADO = 'A' * 3_100_000
# La foto principal viaja en la ficha del plato; la galería, en su propio envío.
SUBIDAS = [
    ('patch', 'products/{pk}', 'api/pos/v1/products/<int:pk> ', {'image': DEMASIADO}),
    ('put', 'products/{pk}/photos', 'api/pos/v1/products/<int:pk>/photos ', [{'image': DEMASIADO}]),
]


@pytest.fixture
def plato():
    """Dueño con sesión del POS y un plato de su carta."""
    org = organization()
    seed_organization(org)
    restaurant(org)
    return pos_client(account(org)), Product.objects.create(organization=org, name='Papas', kind='dish', price=10800)


# Falla si una foto que supera el límite de envío recibe la página HTML «Bad Request» en lugar de un 413 con su causa
# (el POS solo mostraba «El servidor respondió 400.»), o si el registro copia el cuerpo o no dice la ruta y el tamaño.
@pytest.mark.parametrize(('metodo', 'ruta', 'patron', 'cuerpo'), SUBIDAS)
def test_envio_por_encima_del_limite_responde_413_con_su_causa(plato, caplog, metodo, ruta, patron, cuerpo):
    """La foto principal y la galería de un plato con 3,1 MB en base64."""
    client, producto = plato
    with caplog.at_level(logging.WARNING, logger='tenancy.http'):
        respuesta = getattr(client, metodo)('/api/pos/v1/' + ruta.format(pk=producto.pk), cuerpo, format='json')
    registro = '\n'.join(caplog.messages)
    assert respuesta.status_code == 413
    assert respuesta.json()['error'] == 'payload_too_large'
    assert 'supera los 3 MB' in respuesta.json()['message']
    assert f'payload_too_large ruta={patron}bytes=' in registro
    assert 'AAAA' not in registro
