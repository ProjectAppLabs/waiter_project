"""La imagen de un banner rechaza de inmediato un formato no raster (EPS/PDF/FITS) sin colgarse al abrirlo.

Sin el `formats=` de banner_image(), `Image.open()` de Pillow 12.1.1 entra en un bucle infinito con un EPS malicioso
(CVE-2026-59203). La alarma es la red de seguridad; la aserción real es el tiempo: con el arreglo responde al instante.
"""
import base64
import signal
import time
from contextlib import contextmanager

BASE = '/api/pos/v1'
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


def test_banner_eps_no_cuelga(setup):
    """La imagen de un banner rechaza al instante un EPS malicioso, sin colgar la petición."""
    # Falla si abrir la imagen de un banner (un EPS malicioso) tarda en rechazarse en vez de ser inmediato.
    x = setup
    rows = [{'layout': 'notice', 'title': 'Hola', 'subtitle': '', 'button': '', 'target': 'none',
             'targetId': None, 'theme': 'violet', 'active': True, 'image': 'data:image/png;base64,' + EPS, 'configs': []}]
    with sin_cuelgue():
        inicio = time.monotonic()
        response = x['client'].put(f'{BASE}/banners', rows, format='json')
        transcurrido = time.monotonic() - inicio
    assert response.status_code == 400
    assert transcurrido < TOPE
