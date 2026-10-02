"""Imágenes que sirve la experiencia (fotos de platos y logo): qué formato se reconoce y con qué cabeceras salen.

Compartido por views/photos.py y views/logo.py para que las dos rutas prometan lo mismo al navegador y apliquen
la misma defensa: el binario se pinta en <img>, nunca es un documento que ejecute nada.
"""
from django.http import HttpResponse

# Solo formatos raster: un SVG servido inline desde nuestro origen podría ejecutar script (XSS). Lo demás sale como binario opaco.
IMAGE_SIGNATURES = [(b'\x89PNG', 'image/png'), (b'\xff\xd8', 'image/jpeg'), (b'GIF8', 'image/gif')]
# La URL lleva la versión del recurso: cuando cambia, cambia la URL, así que la caché pública puede ser larga e inmutable.
CACHE_CONTROL = 'public, max-age=86400, immutable'
# Tope del logo decodificado: limita la memoria y la caché por organización y versión.
MAX_LOGO_BYTES = 2_000_000


def decoded_size(encoded: str | bytes) -> int:
    """Bytes que ocupará un base64 al decodificarlo, sin decodificarlo: 3 por cada 4 caracteres, menos el relleno final."""
    padding = encoded[-2:].count('=' if isinstance(encoded, str) else b'=')
    return len(encoded) * 3 // 4 - padding


def raster_content_type(data: bytes) -> str | None:
    """'image/png' | 'image/jpeg' | 'image/gif' por los primeros bytes, o None si no es uno de los tres."""
    return next((ctype for magic, ctype in IMAGE_SIGNATURES if data.startswith(magic)), None)


def image_content_type(data: bytes) -> str:
    """Tipo real de la imagen por sus primeros bytes: el sistema propio conserva el formato original (PNG, WebP, GIF, JPEG)."""
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return raster_content_type(data) or 'application/octet-stream'


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """(ancho, alto) de un PNG o WebP leyendo solo su cabecera; None si no se reconoce. Sin Pillow."""
    if data.startswith(b'\x89PNG') and len(data) >= 24 and data[12:16] == b'IHDR':
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP' and len(data) >= 16:
        chunk = data[12:16]
        if chunk == b'VP8 ' and len(data) >= 30:
            return int.from_bytes(data[26:28], 'little') & 0x3FFF, int.from_bytes(data[28:30], 'little') & 0x3FFF
        if chunk == b'VP8L' and len(data) >= 25:
            bits = int.from_bytes(data[21:25], 'little')
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b'VP8X' and len(data) >= 30:
            return int.from_bytes(data[24:27], 'little') + 1, int.from_bytes(data[27:30], 'little') + 1
    return None


def image_response(data: bytes, content_type: str, *, immutable: bool, filename: str) -> HttpResponse:
    """Respuesta binaria con la política común: caché inmutable solo si la versión pedida es la actual (si no, no-store)."""
    response = HttpResponse(data, content_type=content_type)
    response['Cache-Control'] = CACHE_CONTROL if immutable else 'no-store'
    # Defensa en profundidad: el binario se pinta en <img>, nunca es un documento que ejecute nada.
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response
