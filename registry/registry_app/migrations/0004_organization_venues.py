"""Un config identifica un único restaurante dentro de su organización."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registry_app', '0003_credential_release'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='venue',
            constraint=models.UniqueConstraint(fields=('restaurant', 'pos_config_id'), name='uniq_config_per_organization'),
        ),
    ]
