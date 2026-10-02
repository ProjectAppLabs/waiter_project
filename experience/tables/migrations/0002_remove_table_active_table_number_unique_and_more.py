# Migración generada por Django para el contrato T2.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0001_initial'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='table',
            name='active_table_number_unique',
        ),
        migrations.AddConstraint(
            model_name='table',
            constraint=models.UniqueConstraint(fields=('floor', 'number'), name='table_floor_number_unique'),
        ),
        migrations.AddConstraint(
            model_name='table',
            constraint=models.CheckConstraint(condition=models.Q(('number__gte', 1), ('number__lte', 9999)), name='table_number_range'),
        ),
        migrations.AddConstraint(
            model_name='table',
            constraint=models.CheckConstraint(condition=models.Q(('seats__gte', 1), ('seats__lte', 100)), name='table_seats_range'),
        ),
        migrations.AddConstraint(
            model_name='table',
            constraint=models.CheckConstraint(condition=models.Q(('height__gte', 20), ('width__gte', 20)), name='table_size_minimum'),
        ),
    ]
