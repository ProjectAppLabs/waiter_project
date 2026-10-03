# Generada con Django 6.1 el 2026-10-03.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_mysql_borrador_y_claves'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockmove',
            name='kind',
            field=models.CharField(choices=[('receipt', 'receipt'), ('waste', 'waste'), ('count', 'count'), ('sale', 'sale'), ('adjust', 'adjust'), ('return', 'return')], max_length=10),
        ),
    ]
