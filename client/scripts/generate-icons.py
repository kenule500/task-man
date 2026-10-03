"""Regenerate the PWA icons in client/public/icons (requires Pillow).

Usage: python client/scripts/generate-icons.py
Mark: white check mark on a #2563EB rounded square (maskable icon is full-bleed with safe-zone padding).
"""
from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (37, 99, 235, 255)
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # supersampling factor for smooth edges


def draw_icon(size: int, *, radius_ratio: float, mark_scale: float) -> Image.Image:
    """Draw the mark on a size x size canvas. mark_scale is the share of the canvas the check occupies."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio > 0:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius_ratio), fill=BLUE)
    else:
        d.rectangle((0, 0, big, big), fill=BLUE)

    # Check mark defined on a 64 unit grid (same geometry as favicon.svg), scaled around the centre.
    pts = [(18, 33.5), (28, 43.5), (46.5, 22)]
    cx, cy = 32, 32.75  # visual centre of the mark
    k = big / 64 * mark_scale / 0.58  # favicon mark spans ~58% of the tile
    pts = [((x - cx) * k + big / 2, (y - cy) * k + big / 2) for x, y in pts]
    width = int(7 * k)
    d.line(pts, fill=WHITE, width=width, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, radius_ratio=0.22, mark_scale=0.58).save(OUT / "icon-192.png")
    draw_icon(512, radius_ratio=0.22, mark_scale=0.58).save(OUT / "icon-512.png")
    # Maskable: full-bleed background, mark inside the 80% safe zone.
    draw_icon(512, radius_ratio=0, mark_scale=0.42).save(OUT / "maskable-512.png")
    # iOS applies its own mask, so ship an opaque full-bleed square.
    draw_icon(180, radius_ratio=0, mark_scale=0.52).convert("RGB").save(OUT / "apple-touch-icon-180.png")
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
