# Generada por Django 6.1 el 2026-10-02 04:05

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_account_notify_prefs'),
        ('loyalty', '0002_seed_organizations'),
        ('reservations', '0001_initial'),
        ('sales', '0004_order_customer_orderline_loyalty_card_and_more'),
        ('tables', '0002_remove_table_active_table_number_unique_and_more'),
        ('tenancy', '0003_organization_banners_configured_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.CheckConstraint(condition=models.Q(('time_end__gt', models.F('time_start')), ('time_end__lte', 24), ('time_start__gte', 0)), name='reservation_time_range'),
        ),
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.CheckConstraint(condition=models.Q(('prep_minutes__in', [0, 15, 30, 60, 120])), name='reservation_prep_choices'),
        ),
    ]
