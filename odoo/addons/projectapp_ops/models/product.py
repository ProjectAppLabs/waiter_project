"""Origen de la imagen de cada producto (trazabilidad de las fotos generadas con IA), sin vistas.

Documento: docs/diseno/2026-09-05-imagenes-menu.md («Trazabilidad» y «Límite legal»). Una imagen
generada no representa la porción servida; en Colombia es exposición a reclamo por publicidad
engañosa. El campo permite listar qué platos siguen con imagen generada (y priorizar la sesión de
fotos real) y hace que la app del comensal muestre «Imágenes de referencia» cuando aplica.

Kit CloudPos (Plan I): `available_from`, la hora a la que un plato agotado vuelve a estar disponible
("Available at 18:00" en la tarjeta del producto).
"""
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

from ..utils.images import to_webp
from .product_photo import MAX_GALLERY_PHOTOS


class ProductTemplate(models.Model):
    _inherit = "product.template"

    diner_photo_ids = fields.One2many("projectapp.product.photo", "product_tmpl_id", string="Galería del plato")

    # Odoo 19 acepta WebP, pero fields.Image._image_process devuelve el original si no
    # encuentra adjuntos resize. Generamos los tamaños con Pillow y conservamos los
    # nombres, el almacenamiento y la dependencia de image.mixin, sin alterar otros modelos.
    image_1024 = fields.Image(related=False, compute="_compute_diner_images", store=True, readonly=True, max_width=0, max_height=0)
    image_512 = fields.Image(related=False, compute="_compute_diner_images", store=True, readonly=True, max_width=0, max_height=0)
    image_256 = fields.Image(related=False, compute="_compute_diner_images", store=True, readonly=True, max_width=0, max_height=0)
    image_128 = fields.Image(related=False, compute="_compute_diner_images", store=True, readonly=True, max_width=0, max_height=0)

    @api.depends("image_1920")
    def _compute_diner_images(self):
        for product in self.with_context(bin_size=False, bin_size_image_1920=False):
            source = product.image_1920
            for size in (1024, 512, 256, 128):
                product[f"image_{size}"] = to_webp(source, max_side=size)[0] if source else False

    @api.model_create_multi
    def create(self, vals_list):
        values = [dict(vals) for vals in vals_list]
        for vals in values:
            if vals.get("image_1920"):
                vals["image_1920"] = to_webp(vals["image_1920"])[0]
        return super().create(values)

    def write(self, vals):
        vals = dict(vals)
        if vals.get("image_1920"):
            vals["image_1920"] = to_webp(vals["image_1920"])[0]
        return super().write(vals)

    @api.model
    def waiter_set_catalog_photos(self, template_id, photos, employee_id, employee_token):
        # Mismo patrón que waiter_save_catalog_product → _pantry_manager (projectapp_pantry).
        # Se replica aquí para no crear una dependencia circular entre los addons.
        employee = self.env["hr.employee"].sudo().browse(employee_id).exists() if type(employee_id) is int else None
        if (self.env.user.waiter_role != "admin" or not employee or not employee.active or
                employee.company_id != self.env.company or employee.waiter_role != "admin" or
                not employee._waiter_session_ok(employee_token)):
            raise AccessError("Valida el PIN del administrador para modificar las fotos del catálogo.")
        self.check_access("write")
        if type(template_id) is not int or template_id <= 0:
            raise UserError("Selecciona un producto válido.")
        product = self.browse(template_id).exists()
        if not product:
            raise UserError("El producto ya no existe.")
        if product.company_id and product.company_id not in self.env.companies:
            raise AccessError("Producto de otra compañía.")
        product.check_access("write")
        if not isinstance(photos, list) or len(photos) > MAX_GALLERY_PHOTOS:
            raise UserError("La galería debe ser una lista de hasta cuatro fotos.")
        Photo = self.env["projectapp.product.photo"]
        # Un error al convertir cualquier imagen revierte también los borrados y reordenamientos.
        with self.env.cr.savepoint():
            Photo._lock_templates(product.ids)
            existing = {p.id: p for p in product.diner_photo_ids}
            kept = set()
            for item in photos:
                if not isinstance(item, dict) or set(item) not in ({"id"}, {"image"}):
                    raise UserError("Cada foto debe indicar su id o una imagen nueva.")
                if "id" in item:
                    photo_id = item["id"]
                    if type(photo_id) is not int or photo_id not in existing or photo_id in kept:
                        raise UserError("Las fotos deben pertenecer al plato y no pueden repetirse.")
                    kept.add(photo_id)
            Photo.browse([pid for pid in existing if pid not in kept]).unlink()
            result = []
            for sequence, item in enumerate(photos):
                if "id" in item:
                    photo = existing[item["id"]]
                    photo.write({"sequence": sequence})
                else:
                    photo = Photo.create({"product_tmpl_id": product.id, "sequence": sequence, "image": item["image"]})
                result.append({"id": photo.id, "width": photo.width, "height": photo.height, "size": photo.file_size})
        return result

    # Sin default: una plantilla sin marcar no afirma nada sobre su foto (ni real ni generada).
    image_origin = fields.Selection(
        [("real", "Foto real"), ("ai", "Generada con IA"), ("placeholder", "Sin foto")],
        string="Origen de la imagen",
        help="Quién produjo la imagen del producto. «Generada con IA» hace que la app del comensal muestre "
             "«Imágenes de referencia»: una imagen generada no representa la porción servida.")

    # Atributos por plato para la app del comensal (Plan H, Contrato 2): un objeto JSON con las claves que las
    # plantillas saben pintar: piezas, picante (0-3), etiquetas[], alergenos[], abv, ibu, tamanos[{nombre, precio}],
    # soloHoy. Se escribe por RPC (el POS lo editará en Catálogo en un plan posterior); experience/ lo parsea con
    # tolerancia: lo que no sea un objeto JSON válido sale como {} y la carta no se rompe.
    diner_attributes = fields.Text(
        string="Atributos para el comensal (JSON)",
        help="Objeto JSON con los datos opcionales que la app del comensal pinta si existen: "
             "piezas, picante (0 a 3), etiquetas, alergenos, abv, ibu, tamanos [{nombre, precio}], soloHoy. "
             "Ejemplo: {\"piezas\": 8, \"picante\": 2, \"etiquetas\": [\"popular\"]}. Vacío: sin atributos.")

    available_from = fields.Datetime(
        string="Disponible desde",
        help="Cuando el plato está agotado, hora (servidor, UTC) a la que vuelve a estar disponible. "
             "Vacío: sin hora anunciada.")

    def _load_pos_data_fields(self, *args, **kwargs):
        # La experiencia del comensal (experience/) lee la carta con pos.session.load_data, igual que el POS,
        # y load_data solo devuelve los campos de esta lista: sin añadirlos aquí el origen y los atributos nunca
        # saldrían de Odoo. Si Odoo devuelve [] significa "todos los campos" y se respeta tal cual; nunca se
        # reemplaza la lista, porque el POS necesita las suyas.
        fields_ = super()._load_pos_data_fields(*args, **kwargs)
        if not fields_:
            return fields_
        return fields_ + ["image_origin", "diner_attributes", "available_from"]
