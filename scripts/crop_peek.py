# -*- coding: utf-8 -*-
"""Re-crop key regions with corrected coordinates and higher zoom."""
from PIL import Image
import sys

src = sys.argv[1]
img = Image.open(src).convert("RGB")
W, H = img.size
print("source size: %dx%d" % (W, H))

regions = {
    "wl-zoom":   (55, 40, 380, 95, 6),    # wavelength combobox digits
    "table-wide": (280, 80, 1936, 300, 3),  # full table incl. symbol column
    "plot-full": (40, 280, 950, 800, 2),   # plot area with labels
    "annot":     (880, 300, 1560, 520, 3),  # floating annotations right of plot
    "elem-top":  (1845, 15, 1936, 320, 4),  # element list top rows
}
for name, (x1, y1, x2, y2, scale) in regions.items():
    crop = img.crop((x1, y1, min(x2, W), min(y2, H)))
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)
    out = src.replace(".png", "-z-%s.png" % name)
    crop.save(out)
    print("saved", out, crop.size)
