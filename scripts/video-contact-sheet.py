#!/usr/bin/env python3
"""Contact sheet for the product-video footage (T34): one frame per manifest shot.

Reads ~/DoctrineOfWar-video/footage/manifest.json (or the folder given as the first
argument), takes one frame of each clip (the composite s08 is skipped in favour of its parts):
the frame with the most in-world callout inside its 9:16 band, from the spans the capture
kept (footage/.frames/<id>.spans.json), else 0.85 of its length (a UI shot's payoff). Writes footage/contact-sheet.png:
a grid of 480x270 thumbnails labelled with id, seconds and focalX, the 9:16 band drawn.
Requires ffmpeg and Pillow.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "DoctrineOfWar-video" / "footage")
manifest = json.loads((folder / "manifest.json").read_text())
# Show the parts of a joined shot rather than the join.
shots = [s for s in manifest["shots"] if s["id"] != "s08-cinder-road"]
parts = sorted(folder.glob("s08?-*.mp4"))
listed = {s["id"] for s in shots}
for p in parts:
    if p.stem not in listed:
        shots.append({"id": p.stem, "file": p.name, "seconds": float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout or 0), "focalX": 0.5})
shots.sort(key=lambda s: s["id"])

W, H, COLS = 480, 270, 4
rows = (len(shots) + COLS - 1) // COLS
sheet = Image.new("RGB", (W * COLS, (H + 28) * rows), (14, 13, 18))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
except OSError:
    font = ImageFont.load_default()

with tempfile.TemporaryDirectory() as tmp:
    for i, shot in enumerate(shots):
        clip = folder / shot["file"]
        at = 0.85 * float(shot["seconds"])
        lo, hi = float(shot.get("focalX", 0.5)) - 0.1582, float(shot.get("focalX", 0.5)) + 0.1582
        spans = folder / ".frames" / f"{shot['id']}.spans.json"
        if spans.exists():
            weight = [sum(max(0, min(r, hi) - max(l, lo)) * w for l, r, w, *_ in f) for f in json.loads(spans.read_text())]
            if weight and max(weight) > 0:
                at = weight.index(max(weight)) / 30
        out = pathlib.Path(tmp) / f"{shot['id']}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", str(clip), "-frames:v", "1", str(out)], check=True)
        thumb = Image.open(out).convert("RGB").resize((W, H))
        x, y = (i % COLS) * W, (i // COLS) * (H + 28)
        sheet.paste(thumb, (x, y))
        # The centre 9:16 band of the vertical cut, around focalX.
        band = H * 9 / 16
        cx = x + float(shot.get("focalX", 0.5)) * W
        draw.rectangle([cx - band / 2, y, cx + band / 2, y + H - 1], outline=(212, 166, 74))
        draw.text((x + 6, y + H + 5), f"{shot['id']}  {float(shot['seconds']):.1f}s  focalX {shot.get('focalX', 0.5)}", fill=(232, 220, 196), font=font)

target = folder / "contact-sheet.png"
sheet.save(target)
print(f"wrote {target} ({len(shots)} shots)")
