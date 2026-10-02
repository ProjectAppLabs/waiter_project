# Generada por Django 6.1 el 2026-10-02 04:55

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('experience_app', '0029_organization_scope'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tablesession',
            name='table_token',
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
    ]
