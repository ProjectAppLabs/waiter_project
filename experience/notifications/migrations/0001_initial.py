# Generada por Django 6.1 el 2026-10-02 01:07

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('kitchen', 'kitchen'), ('inventory', 'inventory'), ('system', 'system'), ('access', 'access'), ('cash', 'cash')], max_length=12)),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True, default='')),
                ('res_model', models.CharField(blank=True, default='', max_length=80)),
                ('res_id', models.PositiveBigIntegerField(blank=True, null=True)),
                ('action', models.CharField(blank=True, default='', max_length=80)),
                ('action_done', models.BooleanField(default=False)),
                ('read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('recipient', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='accounts.account')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
    ]
