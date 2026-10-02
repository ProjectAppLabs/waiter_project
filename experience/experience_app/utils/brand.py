"""Tema público de la organización derivado de color, tipografía y radio.

Los vectores de tests/utils/test_pos_brand_vectors.py mantienen la coherencia
con el tema del POS.
"""
FONTS = ["Instrument Serif", "Playfair Display", "Fraunces", "DM Serif Display", "Lora", "Cormorant Garamond"]
RADII = [4, 14, 24]
DEFAULT_COLOR = "#C1873A"


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _luminance(hex_color: str) -> float:
    def channel(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in _rgb(hex_color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def ink_for(color: str) -> str:
    """Texto sobre el color de acción: blanco o tinta, el que contraste más (≥ 4.5 exige el sistema)."""
    return "#FFFFFF" if contrast(color, "#FFFFFF") >= contrast(color, "#1A1815") else "#1A1815"


def soft_for(color: str) -> str:
    """Mezcla al 10 % sobre blanco: fondo de selección."""
    r, g, b = _rgb(color)
    mix = lambda c: round(255 - (255 - c) * 0.10)  # noqa: E731
    return f"#{mix(r):02X}{mix(g):02X}{mix(b):02X}"


def theme(color: str, font: str, radius: int) -> dict:
    color = color if color and color.startswith("#") and len(color) == 7 else DEFAULT_COLOR
    return {"color": color.upper(), "colorTexto": ink_for(color), "colorSuave": soft_for(color),
            "fuente": font if font in FONTS else FONTS[0], "radio": radius if radius in RADII else 14, "contraste": round(contrast(color, ink_for(color)), 2)}
