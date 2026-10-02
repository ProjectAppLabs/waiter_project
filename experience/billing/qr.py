"""QR de tamaño fijo (versión 6, corrección L, máscara 0) para la referencia simulada.

La capacidad es 134 bytes UTF-8. No necesita una biblioteca adicional ni servicios externos.
"""

import base64
import io

from PIL import Image


def multiply(x, y):
    result = 0
    for _ in range(8):
        if y & 1:
            result ^= x
        y >>= 1
        x = (x << 1) ^ (0x11D if x & 0x80 else 0)
    return result


def remainder(data, degree=18):
    polynomial = [1]
    root = 1
    for _ in range(degree):
        next_poly = [0] * (len(polynomial) + 1)
        for i, coefficient in enumerate(polynomial):
            next_poly[i] ^= coefficient
            next_poly[i + 1] ^= multiply(coefficient, root)
        polynomial = next_poly
        root = multiply(root, 2)
    result = [0] * degree
    for value in data:
        factor = value ^ result.pop(0)
        result.append(0)
        for i in range(degree):
            result[i] ^= multiply(polynomial[i + 1], factor)
    return result


def matrix(text):
    raw = text.encode("utf-8")
    if len(raw) > 134:
        raise ValueError("La referencia QR supera 134 bytes.")
    bits = "0100" + f"{len(raw):08b}" + "".join(f"{b:08b}" for b in raw)
    bits += "0" * min(4, 1088 - len(bits))
    bits += "0" * (-len(bits) % 8)
    data = [int(bits[i : i + 8], 2) for i in range(0, len(bits), 8)]
    while len(data) < 136:
        data.append(0xEC if (len(data) * 8 - len(bits)) % 16 == 0 else 0x11)
    blocks = [data[:68], data[68:]]
    checks = [remainder(block) for block in blocks]
    codewords = [value for pair in zip(*blocks, strict=True) for value in pair] + [
        value for pair in zip(*checks, strict=True) for value in pair
    ]
    size = 41
    cells = [[None] * size for _ in range(size)]

    def set_cell(x, y, dark):
        cells[y][x] = bool(dark)

    for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4)):
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < size and 0 <= y < size:
                    set_cell(x, y, max(abs(dx), abs(dy)) not in (2, 4))
    for i in range(8, size - 8):
        set_cell(i, 6, i % 2 == 0)
        set_cell(6, i, i % 2 == 0)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            set_cell(34 + dx, 34 + dy, max(abs(dx), abs(dy)) != 1)
    # Formato L/máscara 0 con BCH y XOR reglamentarios: 0x77C4.
    fmt = 0x77C4
    for i in range(6):
        set_cell(8, i, (fmt >> i) & 1)
    set_cell(8, 7, (fmt >> 6) & 1)
    set_cell(8, 8, (fmt >> 7) & 1)
    set_cell(7, 8, (fmt >> 8) & 1)
    for i in range(9, 15):
        set_cell(14 - i, 8, (fmt >> i) & 1)
    for i in range(8):
        set_cell(size - 1 - i, 8, (fmt >> i) & 1)
    for i in range(8, 15):
        set_cell(8, size - 15 + i, (fmt >> i) & 1)
    set_cell(8, size - 8, True)
    stream = "".join(f"{b:08b}" for b in codewords) + "0" * 7
    index, right, upward = 0, size - 1, True
    while right >= 1:
        if right == 6:
            right = 5
        for step in range(size):
            y = size - 1 - step if upward else step
            for x in (right, right - 1):
                if cells[y][x] is None:
                    cells[y][x] = (stream[index] == "1") ^ ((x + y) % 2 == 0)
                    index += 1
        upward = not upward
        right -= 2
    return cells


def image_data(text):
    cells = matrix(text)
    image = Image.new("1", (49, 49), 1)
    for y, row in enumerate(cells):
        for x, dark in enumerate(row):
            image.putpixel((x + 4, y + 4), 0 if dark else 1)
    output = io.BytesIO()
    image.resize((294, 294), Image.Resampling.NEAREST).save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()
