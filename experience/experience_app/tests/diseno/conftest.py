"""Seguimiento de los hilos reales para no dejarlos vivos entre pruebas de diseño."""
import threading
from types import SimpleNamespace

import pytest

from experience_app.diseno import borradores


@pytest.fixture
def verification_threads(monkeypatch, settings):
    threads = []

    def create_thread(**kwargs):
        worker = threading.Thread(**kwargs)
        threads.append(worker)
        return worker

    monkeypatch.setattr(borradores, 'threading', SimpleNamespace(Thread=create_thread))
    yield threads
    for worker in threads:
        if worker.ident is not None:
            worker.join(timeout=10)
            assert not worker.is_alive(), 'El verificador de prueba dejó un hilo vivo.'
