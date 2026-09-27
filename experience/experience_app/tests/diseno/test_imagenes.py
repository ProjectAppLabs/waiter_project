"""Plan L · Reglas de imágenes del sistema de diseño y orden «primero el sistema de diseño» del MCP."""
import pytest

from experience_app.diseno import services as design
from experience_app.tests.diseno.test_plantillas import MINIMAL, owner  # noqa: F401  (fixture de sede con clave MCP)
from experience_app.tests.mcp.test_mcp import call

pytestmark = pytest.mark.django_db


# // Falla si el sistema de diseño deja de definir el radio y el ajuste de las fotos, admite esquinas en punta o un ajuste
# // fuera del catálogo, o si forma.imagen deja de derivarse del radio.
def test_image_rules_are_part_of_the_design_system():
    theme = design.validate({'version': 2, 'fundamentos': {'imagenes': {'radio': 24, 'ajuste': 'contener'}}, 'variantes': {'marcoImagen': 'borde'}})
    assert theme['fundamentos']['imagenes'] == {'radio': 24, 'ajuste': 'contener'}
    assert theme['fundamentos']['forma']['imagen'] == 1.5
    assert theme['variantes']['marcoImagen'] == 'borde'
    for bad in ({'fundamentos': {'imagenes': {'radio': 0}}}, {'fundamentos': {'imagenes': {'radio': 4}}},
                {'fundamentos': {'imagenes': {'ajuste': 'estirar'}}}, {'variantes': {'marcoImagen': 'polaroid'}}):
        with pytest.raises(design.InvalidTheme):
            design.validate({'version': 2, **bad})


# // Falla si el MCP acepta que se edite forma.imagen a mano (esquinas en punta por la puerta de atrás) o si leer_design_system
# // deja de explicar el orden y la regla de imágenes.
def test_mcp_explains_order_and_rejects_manual_image_shape(client, owner):  # noqa: F811
    _, raw = owner
    data = call(client, raw, 'leer_design_system')['structuredContent']
    assert data['orden'][0].startswith('1. Sistema de diseño') and 'imagenes.radio' in ' '.join(data['reglas'])
    result = call(client, raw, 'preparar_tema', {'tema': {'fundamentos': {'forma': {'imagen': 0}}}})
    assert result['isError'] and 'se calcula automáticamente' in result['content'][0]['text']


# // Falla si el MCP acepta plantillas de componente con el sistema de diseño de fábrica, o si las rechaza una vez definido.
@pytest.mark.sistema_de_diseno_real
def test_mcp_requires_design_system_before_component_templates(client, owner):  # noqa: F811
    _, raw = owner
    rejected = call(client, raw, 'preparar_componente', {'componente': 'plato', 'html': MINIMAL})
    assert rejected['isError'] and 'Define primero el sistema de diseño' in rejected['content'][0]['text']
    rejected = call(client, raw, 'preparar_tema', {'tema': {'componentes': {'plato': {'version': 1, 'html': MINIMAL}}}})
    assert rejected['isError']
    accepted = call(client, raw, 'preparar_tema', {'tema': {'fundamentos': {'imagenes': {'radio': 20}},
                                                            'componentes': {'plato': {'version': 1, 'html': MINIMAL}}}})
    assert not accepted['isError'], accepted
