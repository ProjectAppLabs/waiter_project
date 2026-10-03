# Generada con Django 6.1 el 2026-10-03.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_mysql_asistencia_abierta'),
        ('billing', '0003_mysql_clave_exacta'),
        ('loyalty', '0003_mysql_claves_exactas'),
        ('sales', '0008_devoluciones'),
        ('tenancy', '0006_organization_suspension_by_billing_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='salesdocument',
            name='refund',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='credit_note', to='sales.refund'),
        ),
        migrations.AlterField(
            model_name='salesdocument',
            name='order',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='documents', to='sales.order'),
        ),
        migrations.AlterField(
            model_name='salesdocument',
            name='resolution',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='billing.resolution'),
        ),
        migrations.AddField(
            model_name='salesdocument',
            name='original_order',
            field=models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('kind__in', ['invoice', 'pos'])), then=models.F('order_id')), default=None, output_field=models.BigIntegerField(null=True)), output_field=models.BigIntegerField(null=True)),
        ),
        migrations.AddConstraint(
            model_name='salesdocument',
            constraint=models.UniqueConstraint(fields=('original_order',), name='document_one_original'),
        ),
        migrations.AddConstraint(
            model_name='salesdocument',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('kind', 'credit_note'), ('original__isnull', False), ('resolution__isnull', True)), models.Q(('kind__in', ['invoice', 'pos']), ('original__isnull', True), ('resolution__isnull', False)), _connector='OR'), name='document_resolution_kind'),
        ),

    ]
