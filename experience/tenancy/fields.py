"""Campos que el sistema propio necesita iguales en MySQL, PostgreSQL y SQLite."""
from django.db import models
from django.db.models import Case, F, Q, When


class ExactCharField(models.CharField):
    """Texto que se compara carácter por carácter: tokens, claves de idempotencia y llaves de sesión.

    La colación por defecto de MySQL ignora mayúsculas y tildes, así que «Ab12Cd» y «ab12cd» serían el mismo token de
    mesa y chocarían en los índices únicos. En MySQL estos campos usan la colación binaria; PostgreSQL y SQLite ya
    comparan así.
    """

    def db_parameters(self, connection):
        params = super().db_parameters(connection)
        if connection.vendor == 'mysql' and not self.db_collation:
            params['collation'] = 'utf8mb4_bin'
        return params


def only_when(condition: Q, value: str, output_field: models.Field) -> models.GeneratedField:
    """Columna calculada que vale `value` mientras se cumple `condition` y NULL si no.

    Reemplaza las restricciones únicas con condición (MySQL no tiene índices parciales): un índice único sobre esta
    columna solo compara las filas que cumplen la condición, porque los NULL nunca chocan entre sí.
    """
    output_field.null = True
    return models.GeneratedField(expression=Case(When(condition, then=F(value)), default=None, output_field=output_field),
                                 output_field=output_field, db_persist=True)
