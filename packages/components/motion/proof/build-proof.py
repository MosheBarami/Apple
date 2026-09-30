#!/usr/bin/env python3
"""Build studio-proof.luau: the command-bar script that sets up the AppleMotion proof place (see ../component.json)."""
from pathlib import Path
here = Path(__file__).parent
parts = {
    '@@MODULE@@': (here.parent / 'AppleMotion.luau').read_text(),
    '@@CLIENT@@': (here.parent / 'AppleMotionClient.luau').read_text(),
    '@@WALK@@': (here / 'walk.server.luau').read_text(),
    '@@PROBE@@': (here / 'probe.client.luau').read_text(),
}
out = (here / 'setup.template.luau').read_text()
for key, text in parts.items():
    assert ']=====]' not in text, key
    out = out.replace(key, text, 1)
(here / 'studio-proof.luau').write_text(out)
print(len(out))
