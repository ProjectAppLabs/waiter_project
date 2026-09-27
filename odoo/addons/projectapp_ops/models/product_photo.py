"""Galería ordenada del plato, también validada al editar desde el backoffice."""
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

from ..utils.images import to_webp

MAX_GALLERY_PHOTOS = 4


class ProductPhoto(models.Model):
    _name = "projectapp.product.photo"
    _description = "Foto de la galería del plato"
    _order = "sequence, id"

    product_tmpl_id = fields.Many2one("product.template", string="Plato", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(string="Orden", default=0)
    image = fields.Binary(string="Foto", attachment=True, required=True)
    width = fields.Integer(string="Ancho", readonly=True)
    height = fields.Integer(string="Alto", readonly=True)
    file_size = fields.Integer(string="Peso en bytes", readonly=True)

    @api.model
    def _image_values(self, values):
        values = dict(values)
        # Las medidas las decide el servidor, incluso si un RPC intenta falsificarlas.
        for key in ("width", "height", "file_size"):
            values.pop(key, None)
        if "image" in values:
            image, width, height, size = to_webp(values["image"])
            values.update(image=image, width=width, height=height, file_size=size)
        return values

    @api.model
    def _lock_templates(self, template_ids):
        templates = self.env["product.template"].browse(sorted(set(template_ids))).exists()
        templates.check_access("write")
        if any(t.company_id and t.company_id not in self.env.companies for t in templates):
            raise AccessError("Producto de otra compañía.")
        if templates:
            templates.flush_recordset(["write_date"])
            # Una escritura inocua serializa cambios concurrentes incluso con REPEATABLE READ;
            # dos cargas no pueden ver ambas tres fotos y terminar guardando cinco.
            self.env.cr.execute("UPDATE product_template SET write_date = write_date WHERE id IN %s", [tuple(templates.ids)])
            templates.invalidate_recordset(["diner_photo_ids"])

    @api.model_create_multi
    def create(self, vals_list):
        self.check_access("create")
        self._lock_templates([v["product_tmpl_id"] for v in vals_list if v.get("product_tmpl_id")])
        return super().create([self._image_values(v) for v in vals_list])

    def write(self, vals):
        self.check_access("write")
        template_ids = self.product_tmpl_id.ids
        if vals.get("product_tmpl_id"):
            template_ids.append(vals["product_tmpl_id"])
        self._lock_templates(template_ids)
        return super().write(self._image_values(vals))

    def unlink(self):
        self.check_access("unlink")
        self._lock_templates(self.product_tmpl_id.ids)
        return super().unlink()

    @api.constrains("product_tmpl_id")
    def _check_gallery_limit(self):
        for template in self.product_tmpl_id:
            if self.search_count([("product_tmpl_id", "=", template.id)]) > MAX_GALLERY_PHOTOS:
                raise UserError("Cada plato admite hasta cuatro fotos de galería, además de la principal.")
