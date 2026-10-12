import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def cache_limpia():
    # Falla si los contadores de intentos fallidos del inicio de sesión (en la caché) pasan de una prueba a otra.
    cache.clear()
