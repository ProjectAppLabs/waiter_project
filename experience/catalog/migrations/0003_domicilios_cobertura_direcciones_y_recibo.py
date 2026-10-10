# Migración generada por Django para domicilios.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0002_seed_organizations'),
    ]

    operations = [
        migrations.AlterField(
            model_name='product',
            name='kind',
            field=models.CharField(choices=[('dish', 'dish'), ('ingredient', 'ingredient'), ('service', 'service')], max_length=10),
        ),
    ]
