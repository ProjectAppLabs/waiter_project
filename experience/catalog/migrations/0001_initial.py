# Generada por Django 6.1 el 2026-10-02 01:41

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('sequence', models.IntegerField(default=0)),
                ('station', models.CharField(blank=True, default='', max_length=40)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'ordering': ['sequence', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('kind', models.CharField(choices=[('dish', 'dish'), ('ingredient', 'ingredient')], max_length=10)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('legacy_odoo_template_id', models.PositiveIntegerField(blank=True, null=True)),
                ('price', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('available_in_pos', models.BooleanField(default=True)),
                ('favorite', models.BooleanField(default=False)),
                ('description', models.TextField(blank=True, default='')),
                ('diner_attributes', models.JSONField(blank=True, default=dict)),
                ('image', models.FileField(blank=True, default='', max_length=300, upload_to='')),
                ('image_origin', models.CharField(blank=True, choices=[('real', 'real'), ('ai', 'ai'), ('placeholder', 'placeholder')], max_length=12, null=True)),
                ('image_version', models.DateTimeField(blank=True, null=True)),
                ('preparation_minutes', models.PositiveIntegerField(blank=True, null=True)),
                ('pantry_category', models.CharField(blank=True, choices=[('produce', 'produce'), ('meat', 'meat'), ('seafood', 'seafood'), ('dairy', 'dairy'), ('dry', 'dry')], default='', max_length=10)),
                ('cost', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('track_stock', models.BooleanField(default=True)),
                ('categories', models.ManyToManyField(blank=True, to='catalog.category')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'ordering': ['name', 'id'],
            },
        ),
        migrations.CreateModel(
            name='ProductPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveSmallIntegerField(default=0)),
                ('image', models.FileField(max_length=300, upload_to='')),
                ('width', models.PositiveIntegerField()),
                ('height', models.PositiveIntegerField()),
                ('file_size', models.PositiveIntegerField()),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='catalog.product')),
            ],
            options={
                'ordering': ['sequence', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Recipe',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('yield_qty', models.DecimalField(decimal_places=6, default=1, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('product', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='recipe', to='catalog.product')),
            ],
        ),
        migrations.CreateModel(
            name='RestaurantPrice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('price', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='catalog.product')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='RestaurantUnavailable',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='catalog.product')),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Supplier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='product',
            name='supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.supplier'),
        ),
        migrations.CreateModel(
            name='Tax',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('amount', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('included', models.BooleanField(default=True)),
                ('active', models.BooleanField(default=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.AddField(
            model_name='product',
            name='taxes',
            field=models.ManyToManyField(blank=True, to='catalog.tax'),
        ),
        migrations.CreateModel(
            name='Unit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=40)),
                ('root', models.CharField(choices=[('weight', 'weight'), ('volume', 'volume'), ('count', 'count')], max_length=10)),
                ('factor', models.DecimalField(decimal_places=6, default=1, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
        ),
        migrations.CreateModel(
            name='RecipeLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=6, default=0, max_digits=18, validators=[django.core.validators.MinValueValidator(0)])),
                ('ingredient', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='recipe_lines', to='catalog.product')),
                ('recipe', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='catalog.recipe')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='catalog.unit')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddField(
            model_name='product',
            name='unit',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='catalog.unit'),
        ),
        migrations.CreateModel(
            name='CatalogRevision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.PositiveBigIntegerField(default=0)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenancy.organization')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('organization',), name='catalog_revision_org_unique')],
            },
        ),
        migrations.AddConstraint(
            model_name='recipe',
            constraint=models.CheckConstraint(condition=models.Q(('yield_qty__gt', 0)), name='recipe_positive_yield'),
        ),
        migrations.AddConstraint(
            model_name='restaurantprice',
            constraint=models.UniqueConstraint(fields=('restaurant', 'product'), name='restaurant_product_price_unique'),
        ),
        migrations.AddConstraint(
            model_name='restaurantunavailable',
            constraint=models.UniqueConstraint(fields=('restaurant', 'product'), name='restaurant_product_unavailable_unique'),
        ),
        migrations.AddConstraint(
            model_name='tax',
            constraint=models.UniqueConstraint(fields=('organization', 'name'), name='tax_org_name_unique'),
        ),
        migrations.AddConstraint(
            model_name='unit',
            constraint=models.UniqueConstraint(fields=('organization', 'name'), name='unit_org_name_unique'),
        ),
        migrations.AddConstraint(
            model_name='unit',
            constraint=models.CheckConstraint(condition=models.Q(('factor__gt', 0)), name='unit_positive_factor'),
        ),
        migrations.AddConstraint(
            model_name='recipeline',
            constraint=models.UniqueConstraint(fields=('recipe', 'ingredient'), name='recipe_ingredient_unique'),
        ),
        migrations.AddConstraint(
            model_name='recipeline',
            constraint=models.CheckConstraint(condition=models.Q(('qty__gt', 0)), name='recipe_line_positive_qty'),
        ),
    ]
