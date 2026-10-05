"""Siembra del catálogo: upsert idempotente desde JSON, por comando y por señal."""
import json
from io import StringIO

import pytest
from django.core.management import call_command

from experience_app.models import MenuTemplate
from experience_app.plantillas import seed

SPEC = {'codigo': 'Z1', 'nombre': 'Prueba', 'familia': 'Z', 'descripcion': 'una', 'tokens': {'acento': '#000000'},
        'personalizable': {'colores': ['acento']}, 'pantallas': {'menu': {'layout': 'Z1'}}}


@pytest.fixture
def catalog_dir(tmp_path):
    (tmp_path / 'Z1.json').write_text(json.dumps(SPEC), encoding='utf-8')
    return tmp_path


@pytest.mark.django_db
# Falla si repetir la siembra duplica plantillas, omite actualizaciones o borra otras del catálogo.
def test_seed_upserts_without_duplicating_or_deleting(catalog_dir):
    """Atrapa una siembra que duplique filas al repetirse, que no actualice un JSON corregido, o que borre lo que ya no está."""
    before = MenuTemplate.objects.count()
    first = seed.seed(directory=catalog_dir)
    assert (first['creadas'], first['actualizadas'], first['codigos']) == (1, 0, ['Z1'])
    (catalog_dir / 'Z1.json').write_text(json.dumps({**SPEC, 'nombre': 'Corregida'}), encoding='utf-8')
    second = seed.seed(directory=catalog_dir)
    assert (second['creadas'], second['actualizadas']) == (0, 1)
    assert MenuTemplate.objects.get(code='Z1').name == 'Corregida'
    assert MenuTemplate.objects.count() == before + 1  # las del catálogo real siguen ahí


@pytest.mark.django_db
# Falla si el comando no siembra el catálogo real o no informa las plantillas ya existentes.
def test_seed_templates_command_reports_what_it_did():
    """Atrapa un comando que no exista o no siembre el catálogo real del repo."""
    out = StringIO()
    call_command('seed_templates', stdout=out)
    assert 'plantillas: 0 creadas' in out.getvalue()  # post_migrate ya las sembró: el comando solo actualiza
    assert 'B1' in out.getvalue()


# Falla si la búsqueda de miniaturas admite rutas fuera del catálogo o códigos inexistentes.
def test_thumbnail_path_only_resolves_files_inside_the_folder():
    """Atrapa una miniatura leída con un código que sea una ruta (../) o un archivo que no sea una plantilla."""
    assert seed.thumbnail_path('B1') is not None
    assert seed.thumbnail_path('..') is None
    assert seed.thumbnail_path('../catalogo/B1') is None
    assert seed.thumbnail_path('Z9') is None
