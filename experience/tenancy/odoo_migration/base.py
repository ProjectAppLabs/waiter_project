"""Lectura paginada, correspondencias aisladas e informe de importación."""
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from django.apps import apps
from django.db import models
from django.core.management.base import CommandError

from tenancy.models import LegacyMap


def oid(value):
    return value[0] if isinstance(value, (list, tuple)) else value


def stamp(value):
    if not value:
        return None
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result


def dec(value):
    return Decimal(str(value or 0))


def parsed(value, default):
    return json.loads(value) if isinstance(value, str) else value or default


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


class ImportBase:
    def __init__(self, client, org, *, batch_size=200, tokens=(), no_invite=False):
        self.client, self.org = client, org
        self.batch_size, self.tokens, self.no_invite = batch_size, tokens, no_invite
        self.report = defaultdict(Counter)
        self.metadata = {}
        self.missing_fields = defaultdict(set)
        self.context = {}
        self.new_restaurants = set()
        self.reload_maps()

    def reload_maps(self):
        org = self.org
        self.maps = {(m.model, m.odoo_id): m for m in LegacyMap.objects.filter(organization=org)}

    def read(self, model, fields, domain=()):
        if not domain:
            domain = []
        if model not in self.metadata:
            self.metadata[model] = self.client.call_kw(model, 'fields_get', [], {'attributes': ['type']})
        available = self.metadata[model]
        if available:
            self.missing_fields[model].update(set(fields.split()) - set(available))
        selected = ['id', *[f for f in fields.split() if f in available and f != 'id']]
        last = 0
        while True:
            rows = self.client.call_kw(model, 'search_read', [list(domain) + [('id', '>', last)]],
                {'fields': selected, 'limit': self.batch_size, 'order': 'id asc',
                 'context': {**self.context, 'active_test': False, 'bin_size': False}})
            if not rows:
                break
            if any(r['id'] <= last for r in rows):
                raise CommandError(f'{model}: Odoo no respetó la paginación por id.')
            yield from rows
            last = rows[-1]['id']

    def mapping(self, model, pk):
        return self.maps.get((model, str(oid(pk))))

    def ref(self, model, pk, optional=False):
        if not pk and optional:
            return None
        mapping = self.mapping(model, pk)
        if not mapping:
            raise CommandError(f'Falta la correspondencia de {model}:{oid(pk)} en {self.org.slug}.')
        cls = apps.get_model(mapping.local_model)
        obj = cls.objects.filter(pk=mapping.local_id).first()
        if obj is None:
            raise CommandError(f'La correspondencia de {model}:{oid(pk)} apunta a un registro eliminado.')
        # Nunca se confía solo en la tabla de correspondencias para determinar el inquilino.
        owner = getattr(obj, 'organization_id', None)
        if owner is None:
            current = obj
            for relation in ('reservation', 'product', 'order', 'floor', 'restaurant'):
                if hasattr(current, relation):
                    current = getattr(current, relation)
            owner = getattr(current, 'organization_id', None)
        if owner != self.org.pk:
            raise CommandError(f'Correspondencia ajena a la organización: {model}:{oid(pk)}.')
        return obj

    def remember(self, model, pk, obj, source=None):
        entry, _ = LegacyMap.objects.update_or_create(organization=self.org, model=model, odoo_id=str(pk),
            defaults={'local_model': obj._meta.label, 'local_id': str(obj.pk),
                      'fingerprint': fingerprint(source) if source is not None else ''})
        self.maps[(model, str(pk))] = entry

    def upsert(self, source, row, cls, values, *, match=None):
        self.report[source]['leídos'] += 1
        mapping = self.mapping(source, row['id'])
        obj = self.ref(source, row['id']) if mapping else (cls.objects.filter(**match).first() if match else None)
        if obj is not None and not isinstance(obj, cls):
            raise CommandError(f'Correspondencia de tipo incorrecto para {source}:{row["id"]}.')
        creating = obj is None
        obj = obj or cls()
        for key, value in values.items():
            setattr(obj, key, value)
        # Odoo guarda flotantes (0.001000000000000002): se llevan a los decimales de cada campo antes de validar.
        # Las columnas calculadas (tenancy.fields.only_when) las llena la base al guardar: no se leen ni se validan.
        fields = [f for f in obj._meta.fields if not f.generated]
        for f in fields:
            value = getattr(obj, f.attname)
            if isinstance(f, models.DecimalField) and isinstance(value, (Decimal, float, int)) and not isinstance(value, bool):
                setattr(obj, f.attname, Decimal(str(value)).quantize(Decimal(1).scaleb(-f.decimal_places), rounding=ROUND_HALF_UP))
        # Los campos históricos null sin blank son válidos en la base; full_clean conserva el resto de reglas.
        excluded = [f.name for f in obj._meta.fields if f.generated] + [f.name for f in fields if getattr(obj, f.attname) is None or f.name == 'brand_logo' or (isinstance(f, models.JSONField) and getattr(obj, f.attname) in ({}, []))]
        obj.full_clean(exclude=excluded)
        obj.save()
        if source == 'pos.config' and creating:
            self.new_restaurants.add(obj.pk)
        self.remember(source, row['id'], obj, row)
        self.report[source]['creados' if creating else 'actualizados'] += 1
        return obj

    def counted(self, domain, created):
        self.report[domain]['leídos'] += 1
        self.report[domain]['creados' if created else 'actualizados'] += 1

    def skip(self, domain, reason):
        self.report[domain]['leídos'] += 1
        self.report[domain]['omitidos'] += 1
        self.report[domain][f'motivo: {reason}'] += 1

    def render(self, stdout):
        stdout.write('Dominio | Leídos | Creados | Actualizados | Omitidos | Motivo')
        for domain, counts in self.report.items():
            reasons = '; '.join(f'{k[8:]} ({v})' for k, v in counts.items() if k.startswith('motivo: '))
            stdout.write(f"{domain} | {counts['leídos']} | {counts['creados']} | {counts['actualizados']} | {counts['omitidos']} | {reasons}")

        for model, fields in sorted(self.missing_fields.items()):
            if fields:
                stdout.write(f"Campos de origen no disponibles en {model}: {', '.join(sorted(fields))}")
