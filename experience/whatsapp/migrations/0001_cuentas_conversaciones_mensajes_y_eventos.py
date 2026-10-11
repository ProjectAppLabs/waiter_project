
import django.db.models.deletion
import django.utils.timezone
import tenancy.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0005_historial_seguridad_soporte_y_tarifa'),
        ('tenancy', '0012_historial_seguridad_soporte_y_tarifa'),
    ]

    operations = [
        migrations.CreateModel(
            name='WhatsAppWebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id', tenancy.fields.ExactCharField(max_length=64, unique=True)),
                ('raw_body', models.BinaryField()),
                ('received_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('processed_at', models.DateTimeField(db_index=True, null=True)),
                ('error', models.TextField(blank=True)),
                ('attempts', models.PositiveIntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='WhatsAppAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone_number_id', tenancy.fields.ExactCharField(max_length=80, unique=True)),
                ('waba_id', tenancy.fields.ExactCharField(max_length=80)),
                ('phone', models.CharField(blank=True, max_length=80)),
                ('name', models.CharField(blank=True, max_length=200)),
                ('quality', models.CharField(blank=True, max_length=30)),
                ('token_encrypted', tenancy.fields.ExactCharField(blank=True, max_length=4096)),
                ('pin_encrypted', tenancy.fields.ExactCharField(blank=True, max_length=512)),
                ('status', models.CharField(choices=[('connected', 'Conectado'), ('disconnected', 'Desconectado')], default='connected', max_length=12)),
                ('connected_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('active_organization', models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('status', 'connected')), then=models.F('organization_id')), default=None, output_field=models.UUIDField(null=True)), output_field=models.UUIDField(null=True))),
                ('connected_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='accounts.account')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='tenancy.organization')),
                ('restaurant', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='WhatsAppConversation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('wa_id', tenancy.fields.ExactCharField(max_length=32)),
                ('profile_name', models.CharField(blank=True, max_length=200)),
                ('last_inbound_at', models.DateTimeField(null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conversations', to='whatsapp.whatsappaccount')),
            ],
        ),
        migrations.CreateModel(
            name='WhatsAppMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('direction', models.CharField(choices=[('in', 'Entrante'), ('out', 'Saliente')], max_length=3)),
                ('wamid', tenancy.fields.ExactCharField(blank=True, default='', max_length=255)),
                ('unique_wamid', models.GeneratedField(db_persist=True, expression=models.Case(models.When(models.Q(('wamid', ''), _negated=True), then=models.F('wamid')), default=None, output_field=tenancy.fields.ExactCharField(max_length=255, null=True)), output_field=tenancy.fields.ExactCharField(max_length=255, null=True))),
                ('type', models.CharField(max_length=30)),
                ('text', models.TextField(blank=True)),
                ('template', models.CharField(blank=True, max_length=512)),
                ('language', models.CharField(blank=True, max_length=20)),
                ('status', models.CharField(choices=[('received', 'Recibido'), ('sent', 'Enviado'), ('delivered', 'Entregado'), ('read', 'Leído'), ('failed', 'Fallido')], max_length=12)),
                ('error_code', models.CharField(blank=True, max_length=30)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('received_at', models.DateTimeField(null=True)),
                ('sent_at', models.DateTimeField(null=True)),
                ('delivered_at', models.DateTimeField(null=True)),
                ('read_at', models.DateTimeField(null=True)),
                ('failed_at', models.DateTimeField(null=True)),
                ('raw', models.JSONField(default=dict)),
                ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='whatsapp.whatsappconversation')),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='whatsappaccount',
            constraint=models.UniqueConstraint(fields=('active_organization',), name='wa_una_cuenta_conectada'),
        ),
        migrations.AddConstraint(
            model_name='whatsappconversation',
            constraint=models.UniqueConstraint(fields=('account', 'wa_id'), name='wa_cliente_por_cuenta'),
        ),
        migrations.AddConstraint(
            model_name='whatsappmessage',
            constraint=models.UniqueConstraint(fields=('unique_wamid',), name='wa_mensaje_unico'),
        ),
    ]
