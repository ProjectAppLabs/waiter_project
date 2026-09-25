# Tema v2 y copia de los ajustes vigentes, sin borrar los campos del contrato anterior.

import re

from django.db import migrations, models


def migrate_themes(apps, schema_editor):
    """Reglas de S1 congeladas: no importa servicios cuyo contrato pueda cambiar en J3–J5."""
    settings = apps.get_model('experience_app', 'VenueMenuSettings')
    colors = ('fondo', 'superficie', 'tinta', 'tintaSuave', 'tintaTerciaria', 'borde', 'acento', 'acentoTinta', 'acentoSuave')
    for chosen in settings.objects.using(schema_editor.connection.alias).filter(template_id='S1').select_related('template').iterator():
        spec = chosen.template.spec
        tokens = dict(spec['tokens'])
        palette, typography = chosen.palette or {}, chosen.typography or {}
        for name in spec.get('personalizable', {}).get('colores', []):
            value = palette.get(name)
            if isinstance(value, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', value):
                tokens[name] = value.upper()
        display = typography.get('display') or tokens['displayFont']
        body = display if display != spec['tokens']['displayFont'] else tokens['cuerpoFont']
        # Los derivados se resuelven al leer. Se conservan los colores fuente y la elección de fuentes.
        chosen.theme = {'version': 2, 'fundamentos': {
            'densidad': 1, 'texto': 1, 'titulo': 1,
            'forma': {role: 1 for role in ('tarjeta', 'boton', 'chip', 'campo', 'imagen', 'hoja')},
            'colores': {key: tokens[key] for key in colors},
            'tipografia': {'display': display, 'cuerpo': body},
        }}
        chosen.save(using=schema_editor.connection.alias, update_fields=['theme'])


class Migration(migrations.Migration):

    dependencies = [
        ('experience_app', '0024_mcp_keys'),
    ]

    operations = [
        migrations.AddField(
            model_name='venuemenusettings',
            name='theme',
            field=models.JSONField(default=dict),
        ),
        migrations.RunPython(migrate_themes, migrations.RunPython.noop),
    ]
