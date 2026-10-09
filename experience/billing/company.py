"""Datos del emisor y marca, independientes de las cuentas de plataforma."""

from tenancy.audit import audited
import base64
import binascii
import io
import re

from django.core.exceptions import RequestDataTooBig
from django.http import HttpResponse
from PIL import Image, UnidentifiedImageError
from rest_framework.response import Response

from accounts.authentication import resolve_organization
from catalog.api import PosView
from catalog.services import owner, valid, writing
from tenancy.http import ContractView, model_dict, payload, require, save_valid
from tenancy.models import Organization

COMPANY_FIELDS = (
    "name",
    "legal_name",
    "tax_id",
    "tax_id_dv",
    "fiscal_regime",
    "fiscal_responsibilities",
    "address",
    "city",
    "phone",
    "email",
)
FONTS = ("Instrument Serif", "Playfair Display", "Fraunces", "DM Serif Display", "Lora", "Cormorant Garamond")


def company_dict(org):
    return model_dict(org, COMPANY_FIELDS)


def brand_dict(org):
    return {
        "name": org.name,
        "color": org.brand_color,
        "font": org.brand_font,
        "radius": str(org.brand_radius),
        "tagline": org.tagline,
        "greeting": org.greeting,
        "waiter_name": org.waiter_name,
        "welcome": org.welcome,
        "has_logo": bool(org.brand_logo),
        "version": str(org.brand_version),
    }


class CompanyView(PosView):
    def get(self, request):
        return Response({"company": company_dict(self.org)})

    def patch(self, request):
        owner(self.account)
        data = payload(request.data, COMPANY_FIELDS)
        with writing(self.org, operational=True):
            org = Organization.objects.get(pk=self.org.pk)
            for key, value in data.items():
                if key == "fiscal_responsibilities":
                    valid(
                        isinstance(value, list)
                        and len(value) <= 50
                        and all(isinstance(v, str) and 0 < len(v.strip()) <= 30 for v in value)
                    )
                    value = list(dict.fromkeys(v.strip() for v in value))
                else:
                    valid(isinstance(value, str))
                    value = value.strip()
                if key == "tax_id_dv":
                    valid(not value or re.fullmatch(r"[0-9]", value), "El dígito de verificación debe ser un número.")
                if key == "fiscal_regime":
                    valid(value in ("responsable_iva", "no_responsable", "inc"))
                setattr(org, key, value)
            if "name" in data:
                org.brand_version += 1
            save_valid(org)
        return Response({"company": company_dict(org)})


def decode_logo(value):
    if value in (None, "", False):
        return b""
    valid(isinstance(value, str) and len(value) <= 2666668, "El logo no puede pesar más de 2 MB.")
    try:
        raw = base64.b64decode(value, validate=True)
        valid(len(raw) <= 2000000, "El logo no puede pesar más de 2 MB.")
        # formats= limita a los parsers que la validación ya acepta: Pillow nunca despacha a EPS/PDF/FITS (su apertura
        # puede colgarse o explotar antes de este chequeo). La lista blanca de abajo se conserva igual.
        with Image.open(io.BytesIO(raw), formats=("PNG", "JPEG", "GIF")) as img:
            valid(img.format in ("PNG", "JPEG", "GIF"), "El logo debe ser PNG, JPEG o GIF; nunca SVG.")
            img.verify()
        return raw
    except (ValueError, binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        valid(False, "El logo debe ser una imagen PNG, JPEG o GIF válida; nunca SVG.")


class BrandView(PosView):
    def handle_exception(self, exc):
        if isinstance(exc, RequestDataTooBig):
            return Response({"error": "invalid_data", "message": "El logo no puede pesar más de 2 MB."}, status=400)
        return super().handle_exception(exc)

    def get(self, request):
        return Response({"brand": brand_dict(self.org)})

    def patch(self, request):
        owner(self.account)
        return Response({'brand': save_brand(self.org, request.data)})


@audited
def save_brand(organization, data):
    data = payload(
        data, ("color", "font", "radius", "tagline", "greeting", "waiter_name", "welcome", "logo")
    )
    with writing(organization):
        org = Organization.objects.get(pk=organization.pk)
        for key, value in data.items():
            if key == "logo":
                org.brand_logo = decode_logo(value)
                continue
            value = "" if value is None or isinstance(value, bool) else str(value) if type(value) is int else value
            valid(isinstance(value, str))
            value = value.strip()
            if key == "color":
                valid(not value or re.fullmatch(r"#[0-9a-fA-F]{6}", value), "El color debe ser #RRGGBB.")
                org.brand_color = value.upper() or "#C1873A"
            elif key == "font":
                valid(not value or value in FONTS, "Selecciona una tipografía de la lista.")
                org.brand_font = value or "Instrument Serif"
            elif key == "radius":
                valid(value in ("", "4", "14", "24"), "El redondeo debe ser 4, 14 o 24.")
                org.brand_radius = int(value or 14)
            else:
                valid(
                    len(value) <= {"tagline": 60, "greeting": 40, "waiter_name": 40, "welcome": 140}[key],
                    "El texto de marca es demasiado largo.",
                )
                setattr(org, key, value)
        org.brand_version += 1
        save_valid(org)
    return brand_dict(org)


class LogoView(ContractView):
    def get(self, request):
        org = resolve_organization(request)
        require(org.brand_logo, "La organización no tiene logo.", "not_found", 404)
        raw = bytes(org.brand_logo)
        mime = "image/png" if raw.startswith(b"\x89PNG") else "image/gif" if raw.startswith(b"GIF") else "image/jpeg"
        return HttpResponse(
            raw,
            content_type=mime,
            headers={
                "Cache-Control": "public, max-age=60",
                "X-Content-Type-Options": "nosniff",
                "Vary": "X-Waiter-Org",
                "ETag": f'"{org.pk}:{org.brand_version}"',
            },
        )
