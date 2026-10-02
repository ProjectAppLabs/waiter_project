# Generada por Django 6.1 el 2026-10-02 03:56

import django.core.validators
import django.db.models.deletion
import loyalty.models
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('sales', '0003_cashmove_cash_move_positive_and_more'),
        ('tenancy', '0003_organization_banners_configured_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Banner',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveSmallIntegerField(default=0)),
                ('layout', models.CharField(choices=[('product', 'product'), ('promotion', 'promotion'), ('category', 'category'), ('image', 'image'), ('notice', 'notice')], max_length=9)),
                ('title', models.CharField(max_length=80)),
                ('subtitle', models.CharField(blank=True, default='', max_length=160)),
                ('button', models.CharField(blank=True, default='', max_length=35)),
                ('target', models.CharField(choices=[('product', 'product'), ('category', 'category'), ('none', 'none')], max_length=8)),
                ('target_id', models.PositiveBigIntegerField(blank=True, null=True)),
                ('image', models.FileField(blank=True, default='', max_length=300, upload_to='')),
                ('theme', models.CharField(choices=[('violet', 'violet'), ('amber', 'amber'), ('dark', 'dark')], max_length=6)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurants', models.ManyToManyField(blank=True, to='tenancy.restaurant')),
            ],
            options={
                'ordering': ['sequence', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Coupon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80)),
                ('code', models.CharField(max_length=32)),
                ('percent', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('minimum', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('start', models.DateField(blank=True, null=True)),
                ('end', models.DateField(blank=True, null=True)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurants', models.ManyToManyField(blank=True, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='BenefitAction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('cuenta', 'cuenta'), ('opinion', 'opinion'), ('novedades', 'novedades'), ('pago_en_linea', 'pago_en_linea')], max_length=14)),
                ('active', models.BooleanField(default=False)),
                ('reward', models.CharField(choices=[('descuento', 'descuento'), ('cupon', 'cupon'), ('puntos', 'puntos')], default='descuento', max_length=9)),
                ('percent', models.DecimalField(decimal_places=6, default=5, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('points', models.PositiveIntegerField(default=10)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('restaurants', models.ManyToManyField(blank=True, to='tenancy.restaurant')),
                ('coupon', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='loyalty.coupon')),
            ],
        ),
        migrations.CreateModel(
            name='Customer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('id_type', models.CharField(choices=[('CC', 'Cédula de ciudadanía'), ('CE', 'Cédula de extranjería'), ('NIT', 'NIT'), ('PAS', 'Pasaporte'), ('TI', 'Tarjeta de identidad'), ('PEP', 'Permiso especial de permanencia')], default='CC', max_length=3)),
                ('vat', models.CharField(blank=True, default='', max_length=40)),
                ('street', models.CharField(blank=True, default='', max_length=250)),
                ('city', models.CharField(blank=True, default='', max_length=120)),
                ('diner_key', models.UUIDField(blank=True, null=True)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='LoyaltyCard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(default=loyalty.models.card_code, max_length=8)),
                ('points', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('expires', models.DateField(blank=True, null=True)),
                ('customer', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='card', to='loyalty.customer')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='BenefitGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=160)),
                ('points', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
                ('card', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='loyalty.loyaltycard')),
            ],
        ),
        migrations.CreateModel(
            name='LoyaltyMove',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('earn', 'earn'), ('redeem', 'redeem'), ('reserve', 'reserve'), ('release', 'release'), ('grant', 'grant'), ('reversal', 'reversal')], max_length=8)),
                ('points', models.DecimalField(decimal_places=6, max_digits=18)),
                ('key', models.CharField(max_length=160)),
                ('description', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('card', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='moves', to='loyalty.loyaltycard')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='sales.order')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='LoyaltyProgram',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Puntos Waiter', max_length=120)),
                ('spend_per_point', models.DecimalField(decimal_places=6, default=1000, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('value_per_point', models.DecimalField(decimal_places=6, default=100, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('minimum_points', models.DecimalField(decimal_places=6, default=10, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('active', models.BooleanField(default=False)),
                ('organization', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.AddConstraint(
            model_name='coupon',
            constraint=models.UniqueConstraint(fields=('organization', 'code'), name='coupon_org_code_unique'),
        ),
        migrations.AddConstraint(
            model_name='coupon',
            constraint=models.CheckConstraint(condition=models.Q(('percent__gte', '0.01'), ('percent__lte', 100)), name='coupon_percent_range'),
        ),
        migrations.AddConstraint(
            model_name='benefitaction',
            constraint=models.UniqueConstraint(fields=('organization', 'action'), name='benefit_org_action_unique'),
        ),
        migrations.AddConstraint(
            model_name='customer',
            constraint=models.UniqueConstraint(fields=('organization', 'diner_key'), name='customer_org_diner_unique'),
        ),
        migrations.AddConstraint(
            model_name='loyaltycard',
            constraint=models.UniqueConstraint(fields=('organization', 'code'), name='card_org_code_unique'),
        ),
        migrations.AddConstraint(
            model_name='loyaltycard',
            constraint=models.CheckConstraint(condition=models.Q(('points__gte', 0)), name='card_points_nonnegative'),
        ),
        migrations.AddConstraint(
            model_name='benefitgrant',
            constraint=models.UniqueConstraint(fields=('organization', 'key'), name='grant_org_key_unique'),
        ),
        migrations.AddConstraint(
            model_name='benefitgrant',
            constraint=models.CheckConstraint(condition=models.Q(('points__gt', 0)), name='grant_positive'),
        ),
        migrations.AddConstraint(
            model_name='loyaltymove',
            constraint=models.UniqueConstraint(fields=('organization', 'key'), name='loyalty_move_org_key_unique'),
        ),
        migrations.AddConstraint(
            model_name='loyaltyprogram',
            constraint=models.CheckConstraint(condition=models.Q(('minimum_points__gte', 1), ('spend_per_point__gt', 0), ('value_per_point__gt', 0)), name='loyalty_program_positive'),
        ),
    ]
