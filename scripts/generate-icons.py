"""Generate Kairos desktop and tray icons from one geometric mark."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "resources"
DEST.mkdir(exist_ok=True)

SIZE = 1024
SCALE = 4
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

def points(vertices):
    return [(round(x * SIZE * SCALE), round(y * SIZE * SCALE)) for x, y in vertices]

lime = "#c3df83"
ink = "#152016"
draw.rounded_rectangle((0, 0, SIZE * SCALE - 1, SIZE * SCALE - 1), radius=88 * SCALE, fill=lime)
draw.polygon(points([(0.23, 0.2), (0.36, 0.2), (0.36, 0.8), (0.23, 0.8)]), fill=ink)
draw.polygon(points([(0.41, 0.5), (0.68, 0.2), (0.83, 0.2), (0.55, 0.5), (0.83, 0.8), (0.66, 0.8)]), fill=ink)
draw.rectangle((round(.84 * SIZE * SCALE), round(.84 * SIZE * SCALE), round(.91 * SIZE * SCALE), round(.91 * SIZE * SCALE)), fill=ink)

icon = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
icon.save(DEST / "icon.png")
icon.resize((64, 64), Image.Resampling.LANCZOS).save(DEST / "tray.png")
icon.save(DEST / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon.save(DEST / "installer.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon.save(DEST / "icon.icns", format="ICNS")

template = Image.new("RGBA", (64 * SCALE, 64 * SCALE), (0, 0, 0, 0))
template_draw = ImageDraw.Draw(template)
template_draw.polygon([(round(x * 64 * SCALE), round(y * 64 * SCALE)) for x, y in [(0.18, 0.14), (0.34, 0.14), (0.34, 0.86), (0.18, 0.86)]], fill="black")
template_draw.polygon([(round(x * 64 * SCALE), round(y * 64 * SCALE)) for x, y in [(0.4, 0.5), (0.73, 0.14), (0.89, 0.14), (0.56, 0.5), (0.89, 0.86), (0.7, 0.86)]], fill="black")
template.resize((64, 64), Image.Resampling.LANCZOS).save(DEST / "trayTemplate.png")

print(f"Generated desktop icons in {DEST}")
