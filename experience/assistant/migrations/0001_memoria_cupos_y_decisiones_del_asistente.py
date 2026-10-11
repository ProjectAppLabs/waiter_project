# Generada por Django 6.1: memoria, cupos y decisiones del asistente.

import django.db.models.deletion
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenancy', '0012_historial_seguridad_soporte_y_tarifa'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssistantTurn',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('participant', tenancy.fields.ExactCharField(max_length=64)),
                ('channel', models.CharField(max_length=16)),
                ('route', models.CharField(max_length=30)),
                ('source', models.CharField(max_length=16)),
                ('confidence', models.DecimalField(decimal_places=5, max_digits=6, null=True)),
                ('evaluator_version', models.CharField(blank=True, max_length=80)),
                ('model_version', models.CharField(blank=True, max_length=80)),
                ('prompt_version', models.CharField(default='asistente_v1', max_length=40)),
                ('input_tokens', models.PositiveIntegerField(default=0)),
                ('output_tokens', models.PositiveIntegerField(default=0)),
                ('cost', models.DecimalField(decimal_places=10, default=0, max_digits=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='AssistantConversationState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('participant', tenancy.fields.ExactCharField(max_length=64)),
                ('channel', models.CharField(max_length=16)),
                ('state', models.CharField(choices=[('explorando', 'explorando'), ('eligiendo', 'eligiendo'), ('falta_dato', 'falta_dato'), ('resumen', 'resumen'), ('esperando_pago', 'esperando_pago'), ('pagado', 'pagado')], default='explorando', max_length=20)),
                ('cards', models.JSONField(default=list)),
                ('options', models.JSONField(default=list)),
                ('selection', models.JSONField(default=list)),
                ('revision', models.PositiveIntegerField(default=0)),
                ('last_question', models.CharField(blank=True, default='', max_length=40)),
                ('question_count', models.PositiveIntegerField(default=0)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('restaurant', 'participant', 'channel'), name='asistente_estado_unico')],
            },
        ),
        migrations.CreateModel(
            name='AssistantDailyUsage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day', models.DateField()),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('restaurant', 'day'), name='asistente_cupo_sede_unico')],
            },
        ),
        migrations.CreateModel(
            name='AssistantDecisionCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fingerprint', tenancy.fields.ExactCharField(max_length=64)),
                ('decision', models.JSONField(default=dict)),
                ('expires_at', models.DateTimeField()),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('restaurant', 'fingerprint'), name='asistente_decision_unica')],
            },
        ),
        migrations.CreateModel(
            name='AssistantProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('participant', tenancy.fields.ExactCharField(max_length=64)),
                ('preferences', models.JSONField(default=dict)),
                ('favorites', models.JSONField(default=dict)),
                ('last_orders', models.JSONField(default=list)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'participant'), name='asistente_perfil_unico')],
            },
        ),
        migrations.CreateModel(
            name='AssistantStanding',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('participant', tenancy.fields.ExactCharField(max_length=64)),
                ('channel', models.CharField(max_length=16)),
                ('consecutive', models.PositiveIntegerField(default=0)),
                ('incidents', models.JSONField(default=list)),
                ('level', models.CharField(blank=True, default='', max_length=16)),
                ('reason', models.CharField(blank=True, default='', max_length=200)),
                ('until', models.DateTimeField(null=True)),
                ('restricted_day', models.DateField(null=True)),
                ('day', models.DateField(null=True)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('last_at', models.DateTimeField(null=True)),
                ('last_fingerprint', tenancy.fields.ExactCharField(blank=True, default='', max_length=64)),
                ('buffered_text', models.CharField(blank=True, default='', max_length=1000)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization', 'participant'), name='asistente_participante_unico')],
            },
        ),
    ]
