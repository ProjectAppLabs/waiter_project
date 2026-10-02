# Migración generada por Django para el contrato T2.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('catalog', '0002_seed_organizations'),
        ('sales', '0002_seed_restaurants'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='cashmove',
            constraint=models.CheckConstraint(condition=models.Q(('amount__gt', 0)), name='cash_move_positive'),
        ),
        migrations.AddConstraint(
            model_name='orderline',
            constraint=models.CheckConstraint(condition=models.Q(('discount_pct__gte', 0), ('discount_pct__lte', 100)), name='line_discount_range'),
        ),
    ]
