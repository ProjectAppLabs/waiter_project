"""Fotos del catálogo: orientación correcta, tamaño acotado y WebP sin metadatos."""
import base64
import binascii
import io
import warnings

from PIL import Image, ImageOps, WebPImagePlugin  # noqa: F401

from odoo.exceptions import UserError

# Odoo precarga solo algunos formatos de Pillow y desactiva su descubrimiento automático.
# Importar WebPImagePlugin registra explícitamente el lector y el escritor de WebP.
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def to_webp(b64, max_side=1600):
    """Devuelve (base64 WebP, ancho, alto, bytes); nunca agranda ni conserva EXIF."""
    if not isinstance(b64, (str, bytes)) or not b64:
        raise UserError("Selecciona una imagen válida.")
    # Rechazar antes de decodificar evita reservar memoria para cargas sin límite.
    if len(b64) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        raise UserError("La imagen no puede pesar más de 12 MB.")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise UserError("La imagen no está codificada correctamente en base64.") from exc
    if len(raw) > MAX_IMAGE_BYTES:
        raise UserError("La imagen no puede pesar más de 12 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)
                has_alpha = "A" in oriented.getbands() or "transparency" in oriented.info
                image = oriented.convert("RGBA" if has_alpha else "RGB")
                image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                # Quitar también perfiles y EXIF del objeto que Pillow va a codificar.
                image.info.clear()
                output = io.BytesIO()
                image.save(output, format="WEBP", quality=80, method=6)
                data = output.getvalue()
                return base64.b64encode(data), image.width, image.height, len(data)
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UserError("No se pudo leer la imagen; selecciona una imagen válida de tamaño razonable.") from exc
