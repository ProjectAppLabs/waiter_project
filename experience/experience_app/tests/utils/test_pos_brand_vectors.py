"""Candado de paridad con el POS: los vectores que publica pos/lib/domain/__tests__/brand-vectors.json deben derivar igual aquí.

El POS (TypeScript) y la experiencia (Python) derivan el tema por separado (pos/lib/domain/brand.ts y utils/brand.py).
El POS ejecuta su implementación y publica {color, font, radius ⇒ theme}; este test vuelve a derivar cada vector con la
nuestra y falla si difieren: la vista previa del POS mostraría un tema que el comensal no recibiría.
Formato acordado: {"vectors": [{"color": "#C1873A", "font": "Instrument Serif", "radius": 14,
                                 "theme": {"color", "colorTexto", "colorSuave", "fuente", "radio", "contraste"}}, ...]}.
"""
import json
from pathlib import Path

import pytest

from experience_app.utils.brand import theme

REPO = Path(__file__).resolve().parents[4]
VECTORS_JSON = REPO / 'pos' / 'lib' / 'domain' / '__tests__' / 'brand-vectors.json'
NOT_PUBLISHED = 'el POS aún no publica los vectores'


def _load() -> list[dict] | None:
    if not VECTORS_JSON.exists():
        return None
    return json.loads(VECTORS_JSON.read_text(encoding='utf-8'))['vectors']


VECTORS = _load()


@pytest.mark.parametrize('vector', VECTORS or [None], ids=lambda v: f"{v['color']}/{v['font']}/{v['radius']}" if v else 'sin-vectores')
# Falla si el tema generado difiere de los vectores de color, fuente y radio publicados por el POS.
def test_theme_matches_the_pos_vector(vector):
    """Atrapa una regla cambiada en un solo lado (umbral de luminancia, mezcla, redondeo de canal o del contraste)."""
    if vector is None:
        pytest.skip(NOT_PUBLISHED)
    assert theme(vector['color'], vector['font'], vector['radius']) == vector['theme'], vector


# Falla si los vectores de marca están vacíos o solo ejercitan un color.
def test_the_vectors_cover_more_than_one_color():
    """Atrapa un archivo de vectores vacío o de un solo color: pasaría sin vigilar nada."""
    if VECTORS is None:
        pytest.skip(NOT_PUBLISHED)
    assert len({v['color'] for v in VECTORS}) >= 2
