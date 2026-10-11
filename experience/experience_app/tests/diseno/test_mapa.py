"""Plan D · El mapa de domicilio como componente del sistema de diseño, personalizable por el MCP."""
import pytest

from experience_app.diseno import services as design
from experience_app.tests.diseno.test_plantillas import owner  # noqa: F401  (fixture de sede con clave MCP)
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db


# Falla si el estilo del mapa no es una variante del sistema de diseño (marca, claro, oscuro, gris) o si se admite un
# estilo fuera del catálogo.
def test_variante_del_mapa():
    for estilo in ('marca', 'claro', 'oscuro', 'gris'):
        assert design.validate({'version': 2, 'variantes': {'mapa': estilo}})['variantes']['mapa'] == estilo
    with pytest.raises(design.InvalidTheme):
        design.validate({'version': 2, 'variantes': {'mapa': 'satelital'}})


# Falla si el MCP no muestra el mapa entre los componentes con sus cuatro estilos, o si no deja preparar un tema con el
# mapa oscuro.
def test_el_mcp_personaliza_el_mapa(client, owner):  # noqa: F811
    _, raw = owner
    data = call(client, raw, 'leer_design_system')['structuredContent']
    texto = str(data)
    assert 'Mapa de domicilio' in texto and 'data-ds-mapa' in texto
    for estilo in ('marca', 'claro', 'oscuro', 'gris'):
        assert f"'{estilo}'" in texto
    result = call(client, raw, 'preparar_tema', {'tema': {'variantes': {'mapa': 'oscuro'}}})
    assert not result.get('isError'), result
    rechazado = call(client, raw, 'preparar_tema', {'tema': {'variantes': {'mapa': 'satelital'}}})
    assert rechazado['isError']
