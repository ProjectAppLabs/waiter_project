"""Plan M: las fotos principales subidas antes de la optimización pasan a WebP (las nuevas ya llegan convertidas).

Recorre las plantillas con foto en lotes, detecta el formato por la cabecera (RIFF…WEBP) y reescribe image_1920 con la
misma conversión del modelo, que también regenera las variantes 1024/512/256/128.
"""
import base64
import logging

from odoo import SUPERUSER_ID, api

_logger = logging.getLogger(__name__)
BATCH = 50


def _is_webp(b64):
    head = base64.b64decode(b64[:24] if isinstance(b64, str) else b64[:24])
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Template = env["product.template"].with_context(active_test=False, bin_size=False, bin_size_image_1920=False)
    ids = Template.search([("image_1920", "!=", False)]).ids
    converted = 0
    for start in range(0, len(ids), BATCH):
        for template in Template.browse(ids[start:start + BATCH]):
            source = template.image_1920
            if source and not _is_webp(source):
                template.write({"image_1920": source})
                converted += 1
        env.flush_all()
    _logger.info("Plan M: %s fotos principales convertidas a WebP de %s plantillas con foto", converted, len(ids))
