#!/usr/bin/env python3
"""Release art (T31b): the README and website screenshots and the social preview image.

Run after `npm run capture:app -- media-`. Picks the captures, quantizes each PNG to a
256-colour palette (under ~480 KB, as the README and website want) and writes:

  docs/media/title.png, roll.png, doctrine.png, wagon-park.png, harrying.png, finale.png  (1600x1000)
  public/og-image.png                                                                       (1200x630)

Requires Pillow (python3 -m pip install pillow).
"""
import io
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAPTURES = ROOT / "captures" / "app"
LIMIT = 480 * 1024

# Published name -> (capture, size). The README (UI agent) references these names.
MEDIA = {
    "docs/media/title.png": ("media-title-1600.png", (1600, 1000)),
    "docs/media/roll.png": ("media-roll-1600.png", (1600, 1000)),
    "docs/media/doctrine.png": ("media-doctrine-c1-1600.png", (1600, 1000)),
    "docs/media/wagon-park.png": ("media-wagon-park-1600.png", (1600, 1000)),
    "docs/media/harrying.png": ("media-harrying-1600.png", (1600, 1000)),
    "docs/media/finale.png": ("media-finale-1600.png", (1600, 1000)),
    # The title crane with the game's own lockup, "DOCTRINE OF WAR / ASH & BANNER".
    "public/og-image.png": ("media-og-title-1200.png", (1200, 630)),
}


def encode(image: Image.Image) -> bytes:
    """Smallest good palette PNG: median cut with dithering, else a cheaper quantizer."""
    tries = [
        (256, Image.Quantize.MEDIANCUT, Image.Dither.FLOYDSTEINBERG),
        (256, Image.Quantize.FASTOCTREE, Image.Dither.FLOYDSTEINBERG),
        (160, Image.Quantize.FASTOCTREE, Image.Dither.FLOYDSTEINBERG),
    ]
    best = b""
    for colors, method, dither in tries:
        out = io.BytesIO()
        image.quantize(colors=colors, method=method, dither=dither).save(out, "PNG", optimize=True)
        best = out.getvalue()
        if len(best) <= LIMIT:
            return best
    return best


def main() -> int:
    missing = [src for src, _ in MEDIA.values() if not (CAPTURES / src).exists()]
    if missing:
        print("missing captures (run `npm run capture:app -- media-` first):", ", ".join(missing), file=sys.stderr)
        return 1
    for dest, (src, size) in MEDIA.items():
        image = Image.open(CAPTURES / src).convert("RGB")
        if image.size != size:
            image = image.resize(size, Image.LANCZOS)
        data = encode(image)
        path = ROOT / dest
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print(f"{dest}: {size[0]}x{size[1]}, {len(data) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
