"""Tokens finales, plantilla por defecto, caché y validación del PUT (plantillas/services.py)."""
from copy import deepcopy
from unittest.mock import patch

import pytest
from django.urls import reverse

from experience_app.diseno import services as design
from experience_app.models import MenuTemplate, VenueMenuSettings
from experience_app.plantillas import services
from experience_app.plantillas.defaults import FALLBACK_SPEC
from experience_app.plantillas.seed import CATALOG_DIR
from experience_app.tests.conftest import DELIVERY, TABLE

NO_BRAND = {'color': '', 'fuente': '', 'radio': None}
# Marca del registro de TABLE (conftest.BRAND): color, tipografía y redondeo fijados en el onboarding.
REGISTRY_BRAND = {'color': '#7A2E2A', 'fuente': 'Fraunces', 'radio': 14}
PERCENT = 'experience_app.services.discount.percent_for'


@pytest.fixture
def b1(db):
    return MenuTemplate.objects.get(code='B1')


@pytest.fixture
def stubs(company_brand_stub):
    with patch(PERCENT, return_value=5.0):
        yield


def test_the_catalog_is_seeded_after_migrate(db):
    """Atrapa una base recién migrada sin catálogo: el comensal y el POS verían una lista vacía."""
    assert MenuTemplate.objects.count() == len(list(CATALOG_DIR.glob('*.json'))) >= 1
    assert MenuTemplate.objects.get(code='B1').spec['pantallas']['menu']['layout'] == 'B1'


def test_brand_overrides_the_design_and_the_venue_overrides_the_brand(b1):
    """Atrapa el acento del diseño pisando el color de la marca, o la marca pisando lo que la sede eligió a mano."""
    brand = {'color': '#7A2E2A', 'fuente': 'Lora', 'radio': 24}
    from_brand = services.final_tokens(b1.spec, brand, {}, {})
    assert (from_brand['acento'], from_brand['displayFont']) == ('#7A2E2A', 'Lora')
    assert (from_brand['radioTarjeta'], from_brand['radioBoton'], from_brand['radioChip']) == (24, 21, 999)
    from_venue = services.final_tokens(b1.spec, brand, {'acento': '#2f7a4f', 'fondo': '#FFFFFF'}, {'display': 'Fraunces'})
    assert (from_venue['acento'], from_venue['displayFont']) == ('#2F7A4F', 'Fraunces')


def test_accent_ink_and_soft_are_recomputed_only_when_the_accent_changes(b1):
    """Atrapa texto blanco sobre un acento claro (ilegible) o un acentoSuave que no siga al acento; y atrapa que se
    recalculen cuando el acento es el del diseño (perdería la tinta exacta que eligió el diseñador)."""
    designed = services.final_tokens(b1.spec, NO_BRAND, {}, {})
    assert (designed['acentoTinta'], designed['acentoSuave']) == ('#1A1815', '#FDF6EA')  # B1: tinta oscura sobre el dorado (5.73:1)
    light = services.final_tokens(b1.spec, {'color': '#F2C94C', 'fuente': '', 'radio': None}, {}, {})
    assert light['acentoTinta'] == '#1A1815'
    assert light['acentoSuave'] == '#FEFAED'  # = utils/brand.soft_for sobre el fondo blanco de B1


def test_only_customizable_colors_and_display_font_are_taken_from_the_venue(b1):
    """Atrapa una paleta que toque tokens que la plantilla no cede (borde, tintaSuave) o un valor que no es un color."""
    tokens = services.final_tokens(b1.spec, NO_BRAND, {'borde': '#000000', 'tinta': 'rojo', 'acento': '#000000'}, {})
    assert tokens['borde'] == b1.spec['tokens']['borde']
    assert tokens['tinta'] == b1.spec['tokens']['tinta']
    assert tokens['acento'] == '#000000'
    dark = deepcopy(b1.spec)
    dark['personalizable'] = {'colores': ['acento'], 'tipografiaDisplay': False}
    assert services.final_tokens(dark, NO_BRAND, {}, {'display': 'Lora'})['displayFont'] == 'Ubuntu'


def test_google_fonts_follow_the_final_display_font(b1):
    """Atrapa un comensal que descarga la fuente del diseño que ya no usa, o que no descarga la de la marca."""
    resolved = services.build(b1.spec, {'color': '', 'fuente': 'Fraunces', 'radio': None}, {}, {}, 5.0)
    assert resolved['fuentesGoogle'] == ['Fraunces']
    bebas = deepcopy(b1.spec)
    bebas['tokens']['displayFont'], bebas['fuentesGoogle'] = 'Bebas Neue', ['Bebas Neue']
    assert services.build(bebas, NO_BRAND, {}, {}, 5.0)['fuentesGoogle'] == ['Bebas Neue']
    assert services.build(bebas, NO_BRAND, {}, {'display': 'Lora'}, 5.0)['fuentesGoogle'] == ['Lora']


def test_build_has_the_contract_3_shape(b1):
    """Atrapa una plantilla resuelta sin alguna clave del Contrato 3 (el motor del comensal las lee todas)."""
    resolved = services.build(b1.spec, NO_BRAND, {}, {}, 5.0)
    assert set(resolved) == {'codigo', 'nombre', 'familia', 'tokens', 'layouts', 'fotos', 'fuentesGoogle', 'descuento'}
    assert resolved['layouts'] == {'menu': 'B1', 'carrito': 'familia-B', 'pago': 'familia-B', 'registro': 'banner5',
                                   'codigo': 'casillas', 'historial': 'tarjetas'}
    assert resolved['fotos'] == {'requiere': 'todas', 'recorte': '3x2'}
    assert resolved['descuento'] == {'porcentaje': 5.0, 'activo': True}
    assert services.build(b1.spec, NO_BRAND, {}, {}, 0.0)['descuento'] == {'porcentaje': 0.0, 'activo': False}


@pytest.mark.django_db
def test_without_venue_settings_s1_preserves_the_smart_design(stubs):
    # // Falla si una sede sin ajustes pierde el diseño Smart o hereda la marca antigua.
    resolved = services.resolve_template(TABLE)
    assert resolved['codigo'] == 'S1'
    assert resolved['tokens'] == FALLBACK_SPEC['tokens']
    assert resolved['tema'] == design.defaults()
    assert resolved['tokens']['displayFont'] == 'DM Sans'
    services.invalidate('burger-house', 'poblado')  # misma sede: la caché es por sede, no por mesa
    assert services.resolve_template(DELIVERY)['tokens'] == FALLBACK_SPEC['tokens']


@pytest.mark.django_db
def test_without_s1_the_embedded_smart_spec_resolves(stubs):
    # // Falla si un catálogo incompleto o vacío reactiva una plantilla antigua.
    MenuTemplate.objects.filter(code='S1').delete()
    assert services.resolve_template(DELIVERY)['codigo'] == 'S1'
    services.invalidate('burger-house', 'poblado')
    MenuTemplate.objects.all().delete()
    resolved = services.resolve_template(DELIVERY)
    assert resolved['codigo'] == FALLBACK_SPEC['codigo']
    assert resolved['tokens'] == FALLBACK_SPEC['tokens']
    assert services.settings_view('burger-house', 'poblado')['plantilla'] == 'S1'


@pytest.mark.django_db
def test_resolved_template_is_cached_until_saved_or_invalidated(stubs, api_client, settings):
    # // Falla si el guardado no invalida la caché o cada lectura vuelve a resolver la plantilla.
    with patch('experience_app.plantillas.services.build', wraps=services.build) as build, \
            patch('experience_app.plantillas.services.cache.set', wraps=services.cache.set) as cache_set:
        services.resolve_template(TABLE)
        services.resolve_template(TABLE)
        assert build.call_count == 1
        assert cache_set.call_args.args[2] == settings.TEMPLATE_CACHE_SECONDS
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'acento': '#2F7A4F'}})
        assert services.resolve_template(TABLE)['tokens']['acento'] == '#2F7A4F'
        assert build.call_count == 2
        settings.EXPERIENCE_INTERNAL_KEY = 'k'
        api_client.post(reverse('invalidate-menu', args=['burger-house', 'poblado']), HTTP_X_INTERNAL_KEY='k')
        services.resolve_template(TABLE)
        assert build.call_count == 3


@pytest.mark.django_db
def test_save_validates_against_the_catalog():
    # // Falla si se guardan valores ajenos al catálogo o colores ilegibles.
    def rejected(body):
        with pytest.raises(services.InvalidSettings) as exc:
            services.save('burger-house', 'poblado', body)
        return str(exc.value)

    assert 'no está en el catálogo' in rejected({'plantilla': 'Z9'})
    assert 'no se puede personalizar' in rejected({'plantilla': 'S1', 'paleta': {'borde': '#000000'}})
    assert '#RRGGBB' in rejected({'plantilla': 'S1', 'paleta': {'acento': '7A2E2A'}})
    assert 'no está en la lista' in rejected({'plantilla': 'S1', 'tipografia': {'display': 'Comic Sans'}})
    # Gris medio: ni el blanco ni la tinta llegan a 4.5:1 sobre él (un acento claro sí pasa, con tinta oscura).
    assert 'no contrasta' in rejected({'plantilla': 'S1', 'paleta': {'acento': '#808080'}})
    assert 'no se lee sobre el fondo' in rejected({'plantilla': 'S1', 'paleta': {'tinta': '#EEEEEE'}})
    assert 'solo admite' in rejected({'plantilla': 'S1', 'tipografia': {'cuerpo': 'Lora'}})
    assert VenueMenuSettings.objects.count() == 0


@pytest.mark.django_db
def test_save_rejects_a_display_font_when_the_template_does_not_cede_it():
    # // Falla si se guarda una fuente que la plantilla no permite personalizar.
    locked = MenuTemplate.objects.get(code='S1')
    locked.spec = {**locked.spec, 'personalizable': {**locked.spec['personalizable'], 'tipografiaDisplay': False}}
    locked.save()
    with pytest.raises(services.InvalidSettings, match='no permite cambiar la tipografía'):
        services.save('burger-house', 'poblado', {'plantilla': 'S1', 'tipografia': {'display': 'Lora'}})


@pytest.mark.django_db
def test_save_normalizes_and_accepts_the_template_own_font():
    # // Falla si no se normalizan colores o un reinicio conserva ajustes anteriores.
    chosen = services.save('burger-house', 'poblado', {'plantilla': 'S1', 'paleta': {'acento': '#7a2e2a'}, 'tipografia': {'display': 'DM Sans'}})
    assert (chosen.template_id, chosen.palette, chosen.typography) == ('S1', {'acento': '#7A2E2A'}, {'display': 'DM Sans'})
    again = services.save('burger-house', 'poblado', {'plantilla': 'S1'})
    assert again.id == chosen.id and (again.palette, again.typography) == ({}, {})
    assert services.settings_view('burger-house', 'poblado') == {
        'plantilla': 'S1', 'paleta': {}, 'tipografia': {}, 'actualizado': again.updated_at.isoformat(), 'porDefecto': False, 'tema': design.defaults()}


@pytest.mark.django_db
def test_public_catalog_strips_implementation_notes_and_adds_thumbnails():
    # // Falla si el catálogo publica diseños retirados o notas internas.
    view = services.catalog_view()
    assert view['familias'] == {'B': 'Smart Menu'}
    assert [spec['codigo'] for spec in view['plantillas']] == ['S1']
    smart = view['plantillas'][0]
    assert smart['miniatura'] is None
    assert all(not {'resumen', 'estructura'}.intersection(screen) for screen in smart['pantallas'].values())
    assert smart['pantallas']['menu']['layout'] == 'S1'
    assert smart['tokens'] == MenuTemplate.objects.get(code='S1').spec['tokens']
