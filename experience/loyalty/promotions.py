"""Configuración de promociones y banners con las formas JSON heredadas del POS."""

from tenancy.audit import audited
import base64
import binascii
from datetime import date
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from catalog.images import convert, encoded
from catalog.models import Category, Product
from catalog.services import number, reference, relations, valid
from sales.services import integer, text
from tenancy.http import Problem, model_dict, payload, save_valid
from tenancy.models import Restaurant

from .models import Banner, BenefitAction, Coupon, LoyaltyProgram
from .services import allowed_in, local_restaurant, program_for, today

ACTIONS = ("cuenta", "opinion", "novedades", "pago_en_linea")


def iso_date(value):
    try:
        valid(isinstance(value, str))
        result = date.fromisoformat(value)
        valid(result.isoformat() == value)
        return result
    except (ValueError, TypeError):
        valid(False, "Indica una fecha válida YYYY-MM-DD.")


def configs(org, ids):
    return relations(Restaurant, org, ids)


def action_settings(org):
    rows = {r.action: r for r in BenefitAction.objects.filter(organization=org).prefetch_related("restaurants")}
    result = []
    for action in ACTIONS:
        row = rows.get(action)
        item = {
            "action": action,
            "active": False,
            "reward": "descuento",
            "percent": 5,
            "couponId": None,
            "points": 10,
            "configs": [],
        }
        if row:
            item.update(
                active=row.active,
                reward=row.reward,
                percent=float(row.percent),
                couponId=row.coupon_id,
                points=row.points,
                configs=[r.pk for r in row.restaurants.all()],
            )
        elif action == "cuenta":
            item.update(active=org.signup_discount_percent > 0, percent=float(org.signup_discount_percent or 5))
        result.append(item)
    return result


def benefits_settings(org):
    # La pantalla de configuración debe poder activar el programa sembrado inactivo.
    program = LoyaltyProgram.objects.filter(organization=org).first()
    return {
        "coupons": [
            {
                **model_dict(c, ("id", "name", "code", "active", "percent", "minimum")),
                "start": c.start.isoformat() if c.start else "",
                "end": c.end.isoformat() if c.end else "",
                "configs": [r.pk for r in c.restaurants.all()],
            }
            for c in Coupon.objects.filter(organization=org).prefetch_related("restaurants").order_by("id")
        ],
        "loyalty": {
            "name": program.name,
            "spendPerPoint": float(program.spend_per_point),
            "valuePerPoint": float(program.value_per_point),
            "minimumPoints": float(program.minimum_points),
            "active": program.active,
        }
        if program
        else None,
        "actions": action_settings(org),
    }


@audited
def save_benefits(org, raw):
    data = payload(raw, ("coupon", "loyalty", "action"))
    if data.get("coupon") is not None:
        c = payload(
            data["coupon"],
            ("id", "name", "code", "percent", "minimum", "start", "end", "active", "configs"),
            ("code", "percent", "minimum"),
        )
        import re

        code = text(c["code"], 32, True).upper()
        valid(bool(re.fullmatch(r"[A-Z0-9_-]{3,32}", code)), "Usa un código de 3 a 32 letras, números o guiones.")
        row = reference(Coupon, org, c["id"]) if c.get("id") is not None else Coupon(organization=org)
        row.name, row.code = text(c.get("name") or code, 80, True), code
        row.percent, row.minimum = number(c["percent"]), number(c["minimum"])
        valid(Decimal("0.01") <= row.percent <= 100 and row.minimum <= 1000000000)
        row.start = iso_date(c["start"]) if c.get("start") else None
        row.end = iso_date(c["end"]) if c.get("end") else None
        valid(not row.start or not row.end or row.start <= row.end)
        row.active = c.get("active", True)
        valid(type(row.active) is bool)
        restaurants = configs(org, c.get("configs", []))
        save_valid(row)
        row.restaurants.set(restaurants)
    if data.get("loyalty") is not None:
        c = payload(
            data["loyalty"],
            ("name", "spendPerPoint", "valuePerPoint", "minimumPoints", "active"),
            ("spendPerPoint", "valuePerPoint", "minimumPoints"),
        )
        row, _ = LoyaltyProgram.objects.get_or_create(organization=org)
        for key, field in [
            ("spendPerPoint", "spend_per_point"),
            ("valuePerPoint", "value_per_point"),
            ("minimumPoints", "minimum_points"),
        ]:
            value = number(c[key], positive=True)
            valid((1 if key == "minimumPoints" else Decimal("0.01")) <= value <= 1000000000)
            setattr(row, field, value)
        if "name" in c:
            row.name = text(c["name"], 120, True)
        if "active" in c:
            valid(type(c["active"]) is bool)
            row.active = c["active"]
        save_valid(row)
    if data.get("action") is not None:
        c = payload(
            data["action"],
            ("action", "active", "reward", "percent", "couponId", "points", "configs"),
            ("action", "active", "reward"),
        )
        valid(c["action"] in ACTIONS and c["reward"] in ("descuento", "cupon", "puntos") and type(c["active"]) is bool)
        percent, points = number(c.get("percent", 5)), integer(c.get("points", 10), low=0, high=2147483647)
        valid(percent <= 100)
        coupon = reference(Coupon, org, c["couponId"]) if c.get("couponId") else None
        valid(c["reward"] != "descuento" or percent > 0)
        valid(c["reward"] != "cupon" or coupon is not None, "Elige un cupón de la organización.")
        valid(
            c["reward"] != "puntos" or points > 0 and program_for(org), "Activa el programa antes de conceder puntos."
        )
        restaurants = configs(org, c.get("configs", []))
        row, _ = BenefitAction.objects.update_or_create(
            organization=org,
            action=c["action"],
            defaults={
                "active": c["active"],
                "reward": c["reward"],
                "percent": percent,
                "points": points,
                "coupon": coupon,
            },
        )
        row.restaurants.set(restaurants)
        if row.action == "cuenta":
            org.signup_discount_percent = percent if row.active and row.reward == "descuento" else 0
            org.save(update_fields=["signup_discount_percent"])
    return benefits_settings(org)


def diner_actions(org, restaurant):
    local_restaurant(org, restaurant)
    coupons = {c.pk: c for c in Coupon.objects.filter(organization=org).prefetch_related("restaurants")}
    program = program_for(org)
    day = today(org)
    result = []
    for action in action_settings(org):
        if not action["active"] or action["configs"] and restaurant.pk not in action["configs"]:
            continue
        if action["reward"] == "descuento":
            prize = {"tipo": "descuento", "porcentaje": action["percent"]}
        elif action["reward"] == "cupon":
            c = coupons.get(action["couponId"])
            if (
                not c
                or not c.active
                or not allowed_in(c, restaurant)
                or c.start
                and c.start > day
                or c.end
                and c.end < day
            ):
                continue
            prize = {
                "tipo": "cupon",
                "codigo": c.code,
                "nombre": c.name,
                "porcentaje": float(c.percent),
                "minimo": float(c.minimum),
            }
        else:
            if not program:
                continue
            prize = {"tipo": "puntos", "puntos": action["points"], "programa": program.name}
        if action["configs"]:
            prize["configs"] = action["configs"]
        result.append({"accion": action["action"], "premio": prize})
    return result


def image_url(banner, org):
    return f"/api/pos/v1/banners/{banner.pk}/image?org={org.slug}" if banner.image else ""


def banner_settings(org, restaurant=None):
    rows = Banner.objects.filter(organization=org).prefetch_related("restaurants")
    return {
        "configured": org.banners_configured,
        "banners": [
            {
                **model_dict(b, ("layout", "title", "subtitle", "button", "target", "theme", "active")),
                "targetId": b.target_id,
                "image": image_url(b, org),
                "configs": [r.pk for r in b.restaurants.all()],
            }
            for b in rows
        ],
    }


def banner_image(value):
    valid(isinstance(value, str) and len(value) <= 700000, "La imagen debe pesar como máximo 500 KB.")
    if not value:
        return None
    try:
        prefix, raw = value.split(",", 1)
        valid(prefix in ("data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64"))
        data = base64.b64decode(raw, validate=True)
        valid(len(data) <= 512000)
        # formats= limita a los parsers raster permitidos: Pillow nunca despacha a EPS/PDF/FITS (su apertura puede
        # colgarse o explotar antes de este chequeo). La lista blanca de abajo se conserva igual.
        with Image.open(BytesIO(data), formats=("PNG", "JPEG", "WEBP")) as picture:
            valid(picture.width <= 4096 and picture.height <= 4096 and picture.format in ("PNG", "JPEG", "WEBP"))
            picture.verify()
        return encoded(convert(raw))
    except (ValueError, OSError, binascii.Error, Image.DecompressionBombError) as exc:
        raise Problem("invalid_data", "Usa una imagen PNG, JPG o WebP de hasta 500 KB y 4096 px.") from exc


@audited
def save_banners(org, raw, *, dry_run=False):
    valid(isinstance(raw, list) and len(raw) <= 8, "Puedes publicar hasta ocho banners.")
    existing = {image_url(b, org): b.image.name for b in Banner.objects.filter(organization=org) if b.image}
    clean = []
    for b in raw:
        b = payload(
            b,
            ("layout", "title", "subtitle", "button", "target", "targetId", "image", "theme", "active", "configs"),
            ("layout", "title", "target", "theme", "active"),
        )
        valid(
            b["layout"] in ("product", "promotion", "category", "image", "notice")
            and b["target"] in ("product", "category", "none")
            and b["theme"] in ("violet", "amber", "dark")
            and type(b["active"]) is bool
        )
        row = {k: b[k] for k in ("layout", "target", "theme", "active")}
        for key, maximum in [("title", 80), ("subtitle", 160), ("button", 35)]:
            row[key] = text(b.get(key, ""), maximum, key == "title")
        row["target_id"] = None
        if b["target"] != "none":
            filters = (
                {"active": True, "available_in_pos": True, "kind": "dish"}
                if b["target"] == "product"
                else {"active": True}
            )
            target = reference(Product if b["target"] == "product" else Category, org, b.get("targetId"), **filters)
            row["target_id"] = target.pk
        value = b.get("image", "")
        valid(isinstance(value, str))
        picture = existing.get(value) or banner_image(value)
        valid(b["layout"] != "image" or picture, "Sube la imagen del flyer.")
        clean.append((row, picture, configs(org, b.get("configs", []))))
    if dry_run:
        return {'banners': [{**{k: v for k, v in row.items() if k != 'target_id'}, 'targetId': row['target_id'], 'configs': [r.pk for r in restaurants],
                            'image': raw[i].get('image', '')} for i, (row, picture, restaurants) in enumerate(clean)]}
    saved = []
    try:
        # Validar toda la lista antes de crear archivos; conservar los previos usados por URL.
        Banner.objects.filter(organization=org).delete()
        for i, (row, picture, restaurants) in enumerate(clean):
            if isinstance(picture, bytes):
                picture = default_storage.save(f"banners/{org.pk}/{uuid4().hex}.webp", ContentFile(picture))
                saved.append(picture)
            banner = Banner.objects.create(organization=org, sequence=i, image=picture or "", **row)
            banner.restaurants.set(restaurants)
        org.banners_configured = True
        org.save(update_fields=["banners_configured"])
    except Exception:
        for name in saved:
            default_storage.delete(name)
        raise
    return banner_settings(org)
