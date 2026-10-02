"""Diario de archivos del proceso síncrono del comando; revierte solo sus altas."""
from contextlib import contextmanager
from django.core.files.storage import default_storage


class RecordingStorage:
    def __init__(self, storage):
        self.storage = storage
        self.created = []
        self.committed = False

    def __getattr__(self, name):
        return getattr(self.storage, name)

    def save(self, name, content, max_length=None):
        name = self.storage.save(name, content, max_length=max_length)
        self.created.append(name)
        return name

    def commit(self):
        self.committed = True


@contextmanager
def storage_journal():
    # El comando no inicia hilos ni sirve peticiones. Todos los servicios comparten este LazyObject.
    default_storage._setup()
    original = default_storage._wrapped
    journal = RecordingStorage(original)
    default_storage._wrapped = journal
    try:
        yield journal
    except BaseException:
        if not journal.committed:
            for name in journal.created:
                original.delete(name)
        raise
    finally:
        default_storage._wrapped = original
