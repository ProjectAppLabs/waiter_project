"""Banners del menú por terminal: desde el POS con identidad de empleado, o desde una integración (MCP) con el
usuario de servicio del grupo de integraciones."""
import base64
import io
import logging
from PIL import Image
from odoo import fields, models
from odoo.exceptions import AccessError, ValidationError
from .floor_plan import authorize

_logger = logging.getLogger(__name__)
_WRITE = object()
LAYOUTS = ('product', 'promotion', 'category', 'image', 'notice')

class PosConfig(models.Model):
    _inherit = 'pos.config'
    waiter_menu_banners = fields.Json(default=list, copy=False)
    waiter_banners_configured = fields.Boolean(default=False, copy=False)

    def write(self, vals):
        if {'waiter_menu_banners', 'waiter_banners_configured'} & vals.keys() and self.env.context.get('_banner_write') is not _WRITE:
            raise AccessError('Guarda los banners desde el administrador con tu sesión de empleado.')
        return super().write(vals)

    def waiter_banner_settings(self, employee_id=None, token=None, banners=None):
        self.ensure_one()
        self.check_access('read')
        if self.company_id not in self.env.companies:
            raise AccessError('El terminal no pertenece a la compañía activa.')
        if banners is not None:
            authorize(self.env, employee_id, token)
            self.check_access('write')
            self._waiter_write_banners(self._waiter_clean_banners(banners))
        return {'configured': self.waiter_banners_configured, 'banners': self.waiter_menu_banners or []}

    def waiter_banner_settings_integration(self, banners, dry_run=True, actor=''):
        """Banners desde una integración (el MCP de Waiter), sin PIN de empleado: la identidad es el usuario de servicio,
        que debe tener el grupo de integraciones. Mismas reglas que el POS. `dry_run` valida y devuelve sin guardar."""
        self.ensure_one()
        if not self.env.user.has_group('projectapp_ops.group_waiter_integration'):
            raise AccessError('Este usuario no tiene permiso de integraciones de Waiter.')
        if self.company_id not in self.env.companies:
            raise AccessError('El terminal no pertenece a la compañía activa.')
        self.check_access('write')
        clean = self._waiter_clean_banners(banners)
        if not dry_run:
            self._waiter_write_banners(clean)
            _logger.info('Banners del menú de %s guardados por la integración %s (%s banners)', self.name, str(actor)[:60], len(clean))
        return {'configured': self.waiter_banners_configured, 'banners': clean}

    def _waiter_write_banners(self, clean):
        self.with_context(_banner_write=_WRITE).write({'waiter_menu_banners': clean, 'waiter_banners_configured': True})

    def _waiter_clean_banners(self, banners):
        """Valida y normaliza la lista de banners. Las reglas son las mismas para el POS y para las integraciones."""
        if not isinstance(banners, list) or len(banners) > 8:
            raise ValidationError('Puedes publicar hasta ocho banners.')
        clean = []
        for b in banners:
            if not isinstance(b, dict) or set(b)-{'layout','title','subtitle','button','target','targetId','image','theme','active'}:
                raise ValidationError('Banner inválido.')
            if b.get('layout') not in LAYOUTS or b.get('target') not in ('product','category','none') or b.get('theme') not in ('violet','amber','dark') or type(b.get('active')) is not bool:
                raise ValidationError('Revisa el diseño y el destino del banner.')
            row = dict(b)
            for key, limit in [('title',80),('subtitle',160),('button',35)]:
                value = b.get(key,'')
                if not isinstance(value,str) or len(value)>limit or (key=='title' and not value.strip()):
                    raise ValidationError('Revisa los textos del banner.')
                row[key] = value.strip()
            if b['target'] != 'none':
                if type(b.get('targetId')) is not int or b['targetId']<=0:
                    raise ValidationError('Selecciona el destino en el catálogo.')
                model = 'product.product' if b['target']=='product' else 'pos.category'
                target = self.env[model].browse(b['targetId']).exists()
                target.check_access('read')
                if not target or (model=='product.product' and (not target.sale_ok or not target.available_in_pos or target.company_id and target.company_id != self.company_id)):
                    raise ValidationError('El destino no está disponible para este restaurante.')
            else:
                row['targetId'] = None
            picture = b.get('image','')
            if not isinstance(picture,str) or len(picture)>700000:
                raise ValidationError('La imagen debe pesar como máximo 500 KB.')
            if picture:
                try:
                    prefix, encoded = picture.split(',',1)
                    if prefix not in ('data:image/png;base64','data:image/jpeg;base64','data:image/webp;base64'):
                        raise ValueError()
                    raw = base64.b64decode(encoded,validate=True)
                    if len(raw)>512000: raise ValueError()
                    with Image.open(io.BytesIO(raw)) as image:
                        if image.format not in ('PNG','JPEG','WEBP') or image.width>4096 or image.height>4096: raise ValueError()
                        image.verify()
                except Exception:
                    raise ValidationError('Usa una imagen PNG, JPG o WebP de hasta 500 KB y 4096 px.')
            if b['layout']=='image' and not picture:
                raise ValidationError('Sube la imagen del flyer.')
            row['image'] = picture
            clean.append(row)
        return clean
