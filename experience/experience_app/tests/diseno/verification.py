"""Consultas del contrato asíncrono; el navegador falso corre en un hilo real y con su propia conexión."""
import time

from experience_app.tests.mcp.test_mcp import call


def wait_for_verification(request):
    deadline = time.monotonic() + 10
    while True:
        response = request()
        data = response.json() if hasattr(response, 'json') else response.get('structuredContent', {})
        if data.get('estado') != 'en_curso':
            return response
        assert time.monotonic() < deadline, 'La verificación no terminó en el tiempo de la prueba.'
        time.sleep(.05)


def verify_mcp(client, raw, token):
    return wait_for_verification(lambda: call(client, raw, 'verificar_borrador', {'borrador': token}))
