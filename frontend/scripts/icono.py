"""Icono de Waiter: "Wt." blanco sobre el azul del kit, con esquinas redondas.
Se dibuja a 4x y se reduce, que es lo que le da el borde limpio a tamaño de pestaña."""
from PIL import Image, ImageDraw, ImageFont
import glob

BLUE = (68, 125, 252, 255)   # --kit-primary #447DFC
SCALE = 4

def font_at(size):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                 *glob.glob("/usr/share/fonts/**/*Bold*.ttf", recursive=True)):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

def draw(size, path):
    big = size * SCALE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Radio proporcional: el mismo aire que las tarjetas del kit, no una píldora.
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=BLUE)
    text = "Wt."
    font = font_at(int(big * 0.46))
    box = d.textbbox((0, 0), text, font=font)
    d.text(((big - (box[2] - box[0])) / 2 - box[0], (big - (box[3] - box[1])) / 2 - box[1]),
           text, font=font, fill=(255, 255, 255, 255))
    img.resize((size, size), Image.LANCZOS).save(path)
    print("escrito", path, size)

draw(128, "app/icon.png")
draw(192, "public/icons/icon-192.png")
draw(512, "public/icons/icon-512.png")
