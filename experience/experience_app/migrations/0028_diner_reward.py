# Plan N: premios por cuenta, sede y acción, con las condiciones concedidas.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('experience_app', '0027_menu_decoration'),
    ]

    operations = [
        migrations.CreateModel(
            name='DinerReward',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('restaurant_slug', models.SlugField(max_length=60)),
                ('venue_slug', models.SlugField(max_length=60)),
                ('action', models.CharField(choices=[('cuenta', 'cuenta'), ('opinion', 'opinion'), ('novedades', 'novedades'), ('pago_en_linea', 'pago_en_linea')], max_length=20)),
                ('reference', models.CharField(blank=True, default='', max_length=64)),
                ('reward', models.CharField(choices=[('descuento', 'descuento'), ('cupon', 'cupon'), ('puntos', 'puntos')], max_length=10)),
                ('percent', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('coupon_code', models.CharField(blank=True, default='', max_length=32)),
                ('points', models.IntegerField(default=0)),
                ('prize_snapshot', models.JSONField(default=dict)),
                ('state', models.CharField(choices=[('disponible', 'disponible'), ('reservado', 'reservado'), ('usado', 'usado'), ('acreditado', 'acreditado'), ('pendiente', 'pendiente')], default='disponible', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rewards', to='experience_app.dineraccount')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rewards', to='experience_app.order')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('account', 'restaurant_slug', 'venue_slug', 'action', 'reference'), name='unique_account_venue_action_reward')],
            },
        ),
    ]
