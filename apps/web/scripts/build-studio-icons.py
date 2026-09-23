#!/usr/bin/env python3
"""Pack Roblox Studio's Explorer object icons into one sprite strip per theme.

Source: the Roblox Studio install on this Mac (see src/assets/studio-icons/PROVENANCE.md).
Order: STUDIO_ICON_CLASSES in src/components/studio-icon-model.ts, read from that file, so the
strip and the index the app computes cannot disagree. One 32x32 cell per class (Studio's @2x
bitmap, drawn at 16px in the app), stacked top to bottom.

Run from anywhere:  python3 apps/web/scripts/build-studio-icons.py
Needs Pillow. Fails loudly if a class has no icon rather than leaving a hole in the strip.
"""
import re
import sys
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
MODEL = WEB / 'src/components/studio-icon-model.ts'
OUT = WEB / 'src/assets/studio-icons'
SRC = Path('/Applications/RobloxStudio.app/Contents/Resources/content/studio_svg_textures/Shared/InsertableObjects')
CELL = 32

source = MODEL.read_text()
block = re.search(r'STUDIO_ICON_CLASSES = \[(.*?)\] as const', source, re.S)
if not block:
    sys.exit('STUDIO_ICON_CLASSES not found in studio-icon-model.ts')
classes = re.findall(r"'([A-Za-z0-9_]+)'", block.group(1))
assert len(classes) == len(set(classes)), 'a class is listed twice'
assert len(classes) > 10, f'only {len(classes)} classes read — the parse is not reading'

for theme in ('Dark', 'Light'):
    strip = Image.new('RGBA', (CELL, CELL * len(classes)), (0, 0, 0, 0))
    for i, name in enumerate(classes):
        path = SRC / theme / 'Standard' / f'{name}@2x.png'
        if not path.exists():
            sys.exit(f'no {theme} icon for {name}: {path}')
        icon = Image.open(path).convert('RGBA')
        if icon.size != (CELL, CELL):
            icon = icon.resize((CELL, CELL), Image.LANCZOS)
        strip.paste(icon, (0, i * CELL))
    target = OUT / f'studio-icons-{theme.lower()}.png'
    strip.save(target, optimize=True)
    print(f'{target.relative_to(WEB)}: {len(classes)} icons, {target.stat().st_size} bytes')
