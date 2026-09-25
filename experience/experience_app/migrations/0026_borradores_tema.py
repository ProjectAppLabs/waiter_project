# J4: borradores compartidos entre MCP y POS, con token público independiente.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('experience_app', '0025_venue_menu_theme'),
    ]

    operations = [
        migrations.AddField(
            model_name='mcppendingchange',
            name='preview',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='mcppendingchange',
            name='preview_token',
            field=models.UUIDField(blank=True, editable=False, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='mcppendingchange',
            name='restaurant_slug',
            field=models.SlugField(blank=True, default='', max_length=60),
        ),
        migrations.AddField(
            model_name='mcppendingchange',
            name='venue_slug',
            field=models.SlugField(blank=True, default='', max_length=60),
        ),
        migrations.AlterField(
            model_name='mcppendingchange',
            name='key',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='changes', to='experience_app.mcpkey'),
        ),
    ]
