"""Las subidas de imagen rechazan de inmediato un formato no raster (EPS/PDF/FITS), sin colgarse al abrirlo.

Sin el `formats=` de convert()/store(), `Image.open()` de Pillow 12.1.1 entra en un bucle infinito con un EPS
malicioso (CVE-2026-59203): la petición queda clavada hasta que la alarma la corta. Cada caso se envuelve en una
alarma de pocos segundos como red de seguridad; la aserción real es el tiempo: con el arreglo responde al instante.
"""
import base64
import signal
import time
from contextlib import contextmanager

from tables.models import Floor

BASE = '/api/pos/v1'
# EPS con un %%BeginBinary de bytes negativos: hace retroceder el puntero y releer la misma línea para siempre.
EPS = base64.b64encode(
    b"%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n%%EndComments\n"
    b"% comentario de relleno\n%%BeginBinary:-18\n%%EOF\n"
).decode()
ALARMA = 6
TOPE = 3


@contextmanager
def sin_cuelgue():
    """Corta con TimeoutError si Image.open() no vuelve en pocos segundos; red de seguridad del caso."""
    def _cortar(*_):
        raise TimeoutError('Image.open() se colgó con una imagen no raster')
    previo = signal.signal(signal.SIGALRM, _cortar)
    signal.alarm(ALARMA)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previo)


def test_foto_de_plato_eps_no_cuelga(setup):
    """La foto de un plato rechaza al instante un EPS malicioso, sin colgar la petición."""
    # Falla si abrir la foto de un plato (un EPS malicioso) tarda en rechazarse en vez de ser inmediato.
    x = setup
    with sin_cuelgue():
        inicio = time.monotonic()
        response = x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'image': EPS}, format='json')
        transcurrido = time.monotonic() - inicio
    assert response.status_code == 400
    assert transcurrido < TOPE
    x['dish'].refresh_from_db()
    assert not x['dish'].image


def test_galeria_eps_no_cuelga(setup):
    """Una foto de la galería rechaza al instante un EPS malicioso, sin colgar la petición."""
    # Falla si abrir una foto de la galería (un EPS malicioso) tarda en rechazarse en vez de ser inmediato.
    x = setup
    with sin_cuelgue():
        inicio = time.monotonic()
        response = x['client'].put(f'{BASE}/products/{x["dish"].pk}/photos', [{'image': EPS}], format='json')
        transcurrido = time.monotonic() - inicio
    assert response.status_code == 400
    assert transcurrido < TOPE


def test_fondo_del_plano_eps_no_cuelga(setup):
    """El fondo del plano rechaza al instante un EPS malicioso, sin colgar la petición."""
    # Falla si abrir el fondo del plano (un EPS malicioso) tarda en rechazarse en vez de ser inmediato.
    x = setup
    floor = Floor.objects.create(restaurant=x['r1'], name='Salón')
    doc = {'name': 'Salón', 'revision': floor.revision, 'tables': [], 'walls': [], 'zones': [], 'background': EPS}
    with sin_cuelgue():
        inicio = time.monotonic()
        response = x['client'].put(f'{BASE}/floors/{floor.pk}/plan', doc, format='json')
        transcurrido = time.monotonic() - inicio
    assert response.status_code == 400
    assert transcurrido < TOPE
