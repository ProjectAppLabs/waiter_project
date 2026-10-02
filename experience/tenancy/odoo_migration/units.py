"""Normaliza unidades conocidas y sus relaciones de conversión de Odoo."""
from decimal import Decimal
from django.core.management.base import CommandError

from .base import oid, dec

ALIASES = {
    'kg': ('weight', '1'), 'kilogramo': ('weight', '1'), 'kilogramos': ('weight', '1'),
    'g': ('weight', '.001'), 'gramo': ('weight', '.001'), 'gramos': ('weight', '.001'),
    'l': ('volume', '1'), 'litro': ('volume', '1'), 'litros': ('volume', '1'),
    'ml': ('volume', '.001'), 'mililitro': ('volume', '.001'), 'mililitros': ('volume', '.001'),
    'units': ('count', '1'), 'unit': ('count', '1'), 'units.': ('count', '1'), 'unit(s)': ('count', '1'),
    'unidades': ('count', '1'), 'unidad': ('count', '1'), 'manojo': ('count', '1'),
    'diente': ('count', '1'), 'rebanada': ('count', '1'), 'dozens': ('count', '12'), 'docenas': ('count', '12'),
}


def unit_value(row, rows, trail=()):
    key = row['name'].strip().lower()
    if key in ALIASES:
        root, factor = ALIASES[key]
        return root, Decimal(factor)
    if row['id'] in trail:
        raise CommandError('Las unidades contienen un ciclo de conversión.')
    parent = oid(row.get('relative_uom_id'))
    if parent and parent != row['id'] and parent in rows:
        root, factor = unit_value(rows[parent], rows, (*trail, row['id']))
        relative = dec(row.get('relative_factor', 1))
        if relative <= 0:
            raise CommandError('La conversión de una unidad debe ser positiva.')
        return root, factor * relative
    raise CommandError(f"Unidad sin conversión conocida: {row['name']}. Añade su equivalencia antes de migrar.")
