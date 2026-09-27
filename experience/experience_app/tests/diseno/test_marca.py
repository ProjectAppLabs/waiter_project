"""Plan L: fuentes globales, contraste por superficie y utilidades de marca."""
from copy import deepcopy
from unittest.mock import MagicMock, patch

import pytest
import requests

from experience_app.diseno import borradores, plantillas
from experience_app.diseno import services as design
from experience_app.plantillas.defaults import FALLBACK_SPEC
from experience_app.utils.brand import contrast

MARCA = ['ds-sombra-dura', 'ds-borde-grueso', 'ds-tinta-fondo', 'ds-fondo-reticula', 'ds-inclinado-izquierda',
         'ds-inclinado-derecha', 'ds-barra', 'ds-texto-enorme', 'ds-fuente-1', 'ds-fuente-2', 'ds-fuente-3']


def typography(**values):
    return {'fundamentos': {'tipografia': values}}


# // Falla si un tema anterior pierde su tinta, necesita migración o comparte la lista de fuentes predeterminada.
def test_defaults_and_legacy_tokens_fill_brand_fields():
    clean = design.validate({'fundamentos': {'colores': {'tinta': '#123456'}}})
    assert clean['fundamentos']['colores']['tintaFondo'] == '#123456'
    assert design.from_tokens({**FALLBACK_SPEC['tokens'], 'tinta': '#123456'})['fundamentos']['colores']['tintaFondo'] == '#123456'
    assert clean['variantes']['banners'] == 'actual'
    clean['fundamentos']['tipografia']['fuentes'].append('Anton')
    assert design.defaults()['fundamentos']['tipografia']['fuentes'] == []


# // Falla si se aceptan listas ambiguas, más de tres fuentes, familias repetidas o nombres fuera del patrón exacto.
@pytest.mark.parametrize('fonts', [None, 'Anton', {}, [1], [True], [[]], ['Anton'] * 2,
    ['Anton', 'Oswald', 'Roboto', 'Lato'], [''], ['A'], ['anton'], ['Ánton'], [' Anton'],
    ['Anton\n'], ['A' * 41], ['Anton; color:red'], ['Anton&family=Roboto'], ['Roboto:ital']])
def test_invalid_global_fonts_are_rejected(fonts):
    with pytest.raises(design.InvalidTheme, match=r'tipografia.fuentes'):
        design.validate(typography(fuentes=fonts))


# // Falla si las familias pierden mayúsculas, orden, límites válidos o la posibilidad de elegirlas para ambos roles.
@pytest.mark.parametrize('fonts', [[], ['Anton'], ['Barlow Condensed', 'Oswald'], ['A2', 'A' * 40, 'Roboto']])
def test_valid_global_fonts_keep_exact_names_and_order(fonts):
    body = typography(fuentes=fonts, **({'display': fonts[0], 'cuerpo': fonts[-1]} if fonts else {}))
    before = deepcopy(body)
    clean = design.validate(body)
    assert clean['fundamentos']['tipografia']['fuentes'] == fonts
    assert design.validate(clean) == clean
    assert body == before


# // Falla si las fuentes fijas dejan de ser válidas al añadir una lista global propia.
@pytest.mark.parametrize('role', ['display', 'cuerpo'])
def test_fixed_fonts_remain_available(role):
    rules = design.SCHEMA['properties']['fundamentos']['properties']['tipografia']['properties']
    for family in rules[role]['anyOf'][0]['enum']:
        assert design.validate(typography(fuentes=['Anton'], **{role: family}))['fundamentos']['tipografia'][role] == family


# // Falla si display o cuerpo pueden usar una familia que no está en la lista fija ni en fuentes.
@pytest.mark.parametrize('role', ['display', 'cuerpo'])
def test_roles_require_a_declared_family(role):
    with pytest.raises(design.InvalidTheme, match=f'tipografia.{role}'):
        design.validate(typography(fuentes=['Anton'], **{role: 'Oswald'}))


# // Falla si un cambio parcial comprueba los roles antes de mezclar fuentes o permite quitar una familia en uso.
def test_partial_fonts_replace_the_list_and_validate_against_merged_roles():
    clean = design.validate(borradores.merge(design.defaults(), typography(display='Anton', fuentes=['Anton', 'Oswald'])))
    replaced = design.validate(borradores.merge(clean, typography(fuentes=['Anton'])))
    assert replaced['fundamentos']['tipografia']['fuentes'] == ['Anton']
    with pytest.raises(design.InvalidTheme, match='tipografia.display'):
        design.validate(borradores.merge(replaced, typography(fuentes=[])))


# // Falla si se exige tinta sobre fondo, se mezcla con el fondo oscuro o se sobrescribe una tintaFondo explícita.
def test_dark_background_with_light_cards_and_independent_ink():
    colors = design.validate({'fundamentos': {'colores': {
        'fondo': '#111111', 'tintaFondo': '#ffffff', 'superficie': '#FFFFFF',
        'tinta': '#111111', 'tintaSuave': '#666666', 'acento': '#123456',
    }}})['fundamentos']['colores']
    assert colors['tintaFondo'] == '#FFFFFF'
    assert colors['acentoSuave'] == '#E7EBEE'
    assert contrast(colors['tinta'], colors['fondo']) < 4.5
    assert contrast(colors['tintaSuave'], colors['fondo']) < 4.5
    assert contrast(colors['tinta'], colors['acentoSuave']) >= 4.5


# // Falla si los derivados no reaccionan a superficie cuando acento y fondo conservan sus valores por defecto.
def test_surface_alone_recalculates_soft_accent_and_ignores_supplied_derivatives():
    colors = design.validate({'fundamentos': {'colores': {
        'superficie': '#F0F0F0', 'acentoSuave': '#000000', 'acentoTinta': '#000000',
    }}})['fundamentos']['colores']
    assert colors['acentoSuave'] == '#E2E0E8'
    assert colors['acentoTinta'] == '#FFFFFF'


# // Falla si alguno de los cinco pares de contraste del contrato deja de validarse.
@pytest.mark.parametrize('pair', [('tintaFondo', 'fondo'), ('tinta', 'superficie'), ('tintaSuave', 'superficie'),
                                ('tinta', 'acentoSuave'), ('acentoTinta', 'acento')])
def test_every_contrast_pair_is_required(pair):
    colors = design.defaults()['fundamentos']['colores']

    def ratio(ink, surface):
        return 4.49 if (ink, surface) == (colors[pair[0]], colors[pair[1]]) else 5

    with patch.object(design, 'contrast', side_effect=ratio), pytest.raises(design.InvalidTheme, match=f'{pair[0]} sobre {pair[1]}'):
        design.validate({})


# // Falla si tintaFondo deja de exigir hexadecimal o banners acepta variantes no declaradas.
@pytest.mark.parametrize('body', [{'fundamentos': {'colores': {'tintaFondo': '#fff'}}},
    {'fundamentos': {'colores': {'tintaFondo': None}}}, {'variantes': {'banners': 'violet'}}, {'variantes': {'banners': True}}])
def test_invalid_brand_colors_and_banners(body):
    with pytest.raises(design.InvalidTheme):
        design.validate(body)


# // Falla si Google Fonts no se consulta para cada familia global, incluso una fija, con tiempo corto y sin redirecciones.
def test_google_fonts_requires_http_200_for_each_family():
    clean = design.validate(typography(fuentes=['Barlow Condensed', 'Anton', 'Lato']))
    with patch.object(design.requests, 'get') as get:
        get.return_value.__enter__.return_value.status_code = 200
        design.check_google_fonts(clean)
    assert [call.kwargs['params'] for call in get.call_args_list] == [
        {'family': 'Barlow Condensed'}, {'family': 'Anton'}, {'family': 'Lato'}]
    for call in get.call_args_list:
        assert call.args == ('https://fonts.googleapis.com/css2',)
        assert 0 < call.kwargs['timeout'] <= 3
        assert call.kwargs['allow_redirects'] is False and call.kwargs['stream'] is True
    assert get.return_value.__exit__.call_count == 3
    request = requests.Request('GET', design.GOOGLE_FONTS_URL, params={'family': 'Barlow Condensed'}).prepare()
    assert request.url == 'https://fonts.googleapis.com/css2?family=Barlow+Condensed'


# // Falla si un error, una redirección o cualquier estado distinto de 200 se acepta como una fuente existente.
@pytest.mark.parametrize('status', [204, 301, 302, 400, 404, 429, 500, 503])
def test_google_fonts_rejects_non_200(status):
    with patch.object(design.requests, 'get') as get:
        get.return_value.__enter__.return_value.status_code = status
        with pytest.raises(design.InvalidTheme, match=f'«Anton».*HTTP {status}'):
            design.check_google_fonts(design.validate(typography(fuentes=['Anton'])))


# // Falla si la falta de red, el certificado inválido o un tiempo agotado aceptan una familia sin comprobarla.
@pytest.mark.parametrize('error', [requests.ConnectionError, requests.Timeout, requests.exceptions.SSLError])
def test_google_fonts_network_errors_are_clear(error):
    with patch.object(design.requests, 'get', side_effect=error), pytest.raises(design.InvalidTheme, match='«Anton».*red'):
        design.check_google_fonts(design.validate(typography(fuentes=['Anton'])))


# // Falla si leer o validar un tema contacta Google Fonts, o preparar sin fuentes globales exige red.
def test_reading_and_empty_fonts_do_not_use_network(monkeypatch):
    get = MagicMock(side_effect=AssertionError('No se permite red en esta operación.'))
    monkeypatch.setattr(design.requests, 'get', get)
    clean = design.resolve(typography(fuentes=['Anton'], display='Anton'), FALLBACK_SPEC['tokens'])
    assert clean['fundamentos']['tipografia']['display'] == 'Anton'
    design.check_google_fonts(design.defaults())
    get.assert_not_called()


# // Falla si el catálogo de Marca incluye clases de más, carece de descripciones o no conserva ds-barra vacía en el árbol.
def test_brand_utilities_and_empty_bar_are_accepted():
    groups = [group for group in plantillas.UTILITIES['grupos'] if group['nombre'] == 'Marca']
    assert len(groups) == 1
    assert [item['clase'] for item in groups[0]['utilidades']] == MARCA
    assert all(item['descripcion'] for item in groups[0]['utilidades'])
    factory = plantillas.component('plato')['plantilla_fabrica']
    html = f'<div class="{" ".join(MARCA)}"><span class="ds-barra"></span>{factory}</div>'
    tree = plantillas.compile_html('plato', html)
    assert tree[0]['clases'] == MARCA
    assert tree[0]['hijos'][0] == {'tipo': 'elemento', 'etiqueta': 'span', 'clases': ['ds-barra'], 'hijos': []}
    assert plantillas.compile_html('plato', plantillas.to_html(tree)) == tree
    assert plantillas.validate('plato', tree) == tree


# // Falla si ds-barra permite colar atributos activos o exime del contrato obligatorio del componente.
@pytest.mark.parametrize('html', ['<div class="ds-barra"></div>', '<span class="ds-barra" style="color:red"></span>',
                                '<span class="ds-barra" onclick="alert(1)"></span>'])
def test_empty_bar_does_not_relax_template_safety(html):
    with pytest.raises(plantillas.InvalidTemplate):
        plantillas.compile_html('plato', html)
