"""Crea una cuenta administradora de ProjectApp sin depender del POS."""
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction

from accounts.services import invitation, valid_password
from tenancy.models import PlatformUser


class Command(BaseCommand):
    help = 'Crea un administrador de ProjectApp; sin contraseña, envía una invitación.'

    def add_arguments(self, parser):
        for field in ('name', 'email', 'username'):
            parser.add_argument(f'--{field}', required=True)
        parser.add_argument('--password')

    def handle(self, *args, **options):
        password = options['password']
        if password is not None and not valid_password(password):
            raise CommandError('La contraseña necesita al menos 8 caracteres.')
        try:
            with transaction.atomic():
                user = PlatformUser(name=options['name'].strip(), email=options['email'].strip().lower(),
                                    username=options['username'], role='admin', activated=password is not None,
                                    password=make_password(password))
                user.full_clean()
                user.save()
        except (ValidationError, IntegrityError) as exc:
            raise CommandError(f'No se pudo crear el administrador: {exc}') from exc
        if password is None and not invitation(user):
            self.stdout.write(self.style.WARNING('Administrador creado; no se pudo enviar la invitación.'))
        else:
            self.stdout.write(self.style.SUCCESS('Administrador creado.'))
