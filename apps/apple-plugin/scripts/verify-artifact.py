#!/usr/bin/env python3
"""Assert that the BUILT plugin contains what its source says it does.

WHY THIS IS SEPARATE FROM THE TESTS.

Every test in this repository that checks a plugin capability reads the `.luau`. The artifact a
user installs is a different object, and the two have already disagreed in the most expensive way
available: the checked-in legacy build reported `VERSION = "0.1.0"` while its source said `0.2.0`,
and contained **zero** occurrences of `GenerateModelAsync` — it predated the entire generation
feature. Every test was green. Nothing read the binary.

So this reads the binary. `.rbxm` payloads are LZ4-block compressed and a string that is certainly
in the build is only sometimes present in the raw bytes, which is why this reuses the decoder in
`scripts/inspect-plugin-build.py` rather than grepping. If a chunk cannot be decoded this fails:
a check that could not look has not established anything.

Usage:  verify-artifact.py BUILD.rbxm
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

# Importing the inspector would otherwise write a __pycache__ entry beside it — and that cache is
# tracked in this repository, so a read-only verification would show up as a source change in a
# shared checkout that several agents commit from. Reading must not write.
sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parent
REPO = PLUGIN.parent.parent

# What must be inside the shipped bytes, and the source of truth for why.
#
# Each entry is a capability whose ABSENCE is invisible from the source tree. `Render`/`rasterTri`
# are the visual gate: without them the worker withholds render_view, compose_thumbnail and
# inspect_visually, and every run ends "Rendered appearance was not verified". A build that dropped
# the module would still pass every Luau test, because the tests read `src/`.
REQUIRED = {
    "rasterTri": "the software rasteriser — the worker's whole visual gate stands on it",
    "Render.capture": "the render entry point the command engine calls",
    "StudioCaptureService": "native active Studio viewport capture is bundled alongside software multi-view rendering",
    "StudioCaptureScreenshotFormat": "the native capture path explicitly requests PNG bytes",
    "run_mode.action must be start": "the typed Run/Pause/Resume/Stop playtest control path is present in the shipped command engine",
    "inspect_model target must be a Model or BasePart": "bounded structural model inspection is present in the shipped command engine",
    "project census exceeds the": "the typed playtest safety census is present, so run_and_check does not need arbitrary run_code",
    # F-046: without these the worker withholds play_check and every UI claim must say "not verified".
    "ExecutePlayModeAsync": "the player-side play check starts a real solo Test session through StudioTestService",
    "__ApplePlayCheckHarnessV1": "the marker the play check's harness removal is counted by; without it removal cannot be verified",
    "GenerateModelAsync": "Roblox-native text-to-3D; the legacy artifact shipped with zero of these",
    "golem.studio-ops.v1": "the capability report schema the worker parses; without it every tool is offered blind",
    # src/ops/ is a directory, and a build that dropped it would still pass every test (the tests
    # embed the family sources). Its installer is in Commands; its loader is the ops ModuleScript.
    "OP_FAMILIES.install": "the one installer that merges src/ops families into the allowlists",
    "Apple Studio op families": "the ops ModuleScript (src/ops/init.luau) that loads every family is in the build",
    "/api/studio/poll": "the long-poll the plugin is",
    # INSERTION IS ALLOWED ONLY WITH ITS GUARD.
    #
    # `GetService("InsertService")` used to sit in FORBIDDEN, and that ban cost the product its
    # headline feature: the asset library's 81,648 insertable items had no delivery path at all,
    # because the worker withholds any tool the plugin reports unsupported.
    #
    # The ban was aimed at the right danger and hit the wrong target. What got the legacy plugin
    # removed for Misusing Roblox Systems is `require`ing a ModuleScript built from an HTTP body —
    # text off the wire becoming running code — and all three of those shapes are still forbidden
    # below. `LoadAsset` is not that: a first-party service, an id rather than a payload, and
    # Roblox deciding what comes back.
    #
    # The real risk is that a fetched model CONTAINS scripts, so the guard against that is
    # REQUIRED here instead. That is a STRONGER invariant than the ban: "no loader" is satisfied
    # by a plugin that inserts nothing, whereas "no insertion without the code refusal" cannot be
    # satisfied by deleting the guard, because deleting it fails this check.
    "LuaSourceContainer": "the scan that refuses an asset carrying code, before anything is parented",
    "Apple inserts geometry, not code": "the refusal message; its absence means the scan was removed or defanged",
    # A REFUSAL THAT NAMES NO REMEDY GETS ONE INVENTED FOR IT.
    #
    # Observed live on 2026-09-19: the plugin refused a write for want of edit consent, the model
    # relayed that correctly, and then told the user to enable "Allow Scripted Updates" under
    # "File > Project Settings > Security" — a menu, a page and a setting that do not exist in
    # Roblox Studio — while never mentioning the button two inches from the refusal.
    #
    # The remedy CODE is what the worker turns into the product's own instruction, so a build that
    # ships the refusal without it ships the silence that caused this. Checked in the bytes rather
    # than the source for the same reason as everything else here: the two have disagreed before.
    "edit_consent": "the remedy code on the consent refusal; without it the model is left to invent a fix, and it does",
}

# Patterns that must NOT be in the shipped bytes. These are call shapes, never mentions: Commands
# carries a refusal LIST naming loadstring and InsertService, and matching the word would report
# the guard as the defect.
FORBIDDEN = [
    (rb"loadstring\s*\(", "dynamic source compilation"),
    (rb"pcall\s*\(\s*require\s*,", "requiring a constructed ModuleScript — the legacy run_code pattern"),
    (rb":\s*GetObjects\s*\(", "remote object loading"),
    (rb"CreateAssetAsync\s*\(", "asset upload"),
]


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    artifact = Path(sys.argv[1])

    spec = importlib.util.spec_from_file_location("inspector", REPO / "scripts" / "inspect-plugin-build.py")
    inspector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inspector)

    blob = b"".join(payload for _, payload in inspector.decode_chunks(artifact.read_bytes()))
    if len(blob) < 50_000:
        print(f"REFUSING TO CERTIFY: only {len(blob)} bytes decompressed — the artifact was not read")
        return 1

    # The version the plugin will report on every request must be the version in these bytes.
    bridge = (PLUGIN / "src" / "Bridge.luau").read_text()
    declared = re.search(r'local PLUGIN_VERSION = "([^"]+)"', bridge)
    protocol = re.search(r'local PLUGIN_PROTOCOL = "([^"]+)"', bridge)
    if not declared or not protocol:
        print("could not read PLUGIN_VERSION/PLUGIN_PROTOCOL out of src/Bridge.luau")
        return 1

    failures: list[str] = []
    print(f"artifact:  {artifact}")
    print(f"decompressed: {len(blob)} bytes")

    if f'PLUGIN_VERSION = "{declared[1]}"'.encode() not in blob:
        failures.append(f'the build does not contain PLUGIN_VERSION = "{declared[1]}" — it is not this source')
    else:
        print(f"version:   {declared[1]} (protocol {protocol[1]}) confirmed inside the artifact")

    for needle, why in REQUIRED.items():
        count = blob.count(needle.encode())
        print(f"  {'present' if count else 'MISSING'}  {needle}  x{count}   {why}")
        if not count:
            failures.append(f"{needle} is not in the shipped bytes: {why}")

    for pattern, why in FORBIDDEN:
        hit = re.search(pattern, blob)
        if hit:
            failures.append(f"the build contains {why}: {hit.group()[:40]!r}")

    # A scanner nobody tests is a scanner that quietly stops working.
    planted = b'loadstring("x") pcall(require, m) a:GetObjects(1) s:CreateAssetAsync(m)'
    unfireable = [why for pattern, why in FORBIDDEN if not re.search(pattern, planted)]
    if unfireable:
        failures.append("these rules cannot match anything and are checking nothing: " + ", ".join(unfireable))

    if failures:
        print("\nFAILED:")
        for line in failures:
            print(f"  - {line}")
        return 1

    print("\nRESULT: the shipped bytes carry the capabilities this source claims")
    return 0


if __name__ == "__main__":
    sys.exit(main())
