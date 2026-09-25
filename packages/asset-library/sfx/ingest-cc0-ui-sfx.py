#!/usr/bin/env python3
"""Restore two individually licence-checked CC0 UI sound packs into the private store.

Archives and extracted audio remain gitignored. The committed JSONL records exact provenance,
file hashes and intended UI use, so a new machine can reproduce and verify the import.
"""
import hashlib
import json
import re
import subprocess
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "sfx-store" / "opengameart"
SOURCE = ROOT / "sfx" / "sources" / "opengameart-cc0-ui.jsonl"
PACKS = (
    {
        "id": "joth-ui",
        "title": "7 Assorted Sound Effects (Menu, Level Up)",
        "author": "Joth",
        "page": "https://opengameart.org/content/7-assorted-sound-effects-menu-level-up",
        "url": "https://opengameart.org/sites/default/files/UISoundEffects.zip",
        "archive": "UISoundEffects.zip",
        "sha256": "a04c6ea7d7b378949733365410b5141ca7fcfc4ee270be322773d8d69911012d",
        "bytes": 627912,
    },
    {
        "id": "m1chiboi-ui",
        "title": "UI Soundpack by m1chiboi - bleeps and clicks",
        "author": "m1chiboi",
        "page": "https://opengameart.org/content/ui-soundpack-by-m1chiboi-bleeps-and-clicks",
        "url": "https://opengameart.org/sites/default/files/UI%20Soundpack%20by%20m1chiboi%20for%20beansjam%20mobile%20-%20bleeps%20and%20clicks.zip",
        "archive": "ui-soundpack.zip",
        "sha256": "db253e6a37779d21f96ba42b78a5b0335c43ee1f0d36c67f46b3afb2aec2344e",
        "bytes": 1625000,
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive_for(pack):
    folder = STORE / pack["id"]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / pack["archive"]
    if not path.exists():
        request = urllib.request.Request(pack["url"], headers={"User-Agent": "AppleRobloxAssetLibrary/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.url.split("/", 3)[2] != "opengameart.org":
                raise ValueError("Unexpected download host")
            data = response.read(pack["bytes"] + 1)
        if len(data) != pack["bytes"] or digest(data) != pack["sha256"]:
            raise ValueError(f"Archive changed: {pack['id']}")
        path.write_bytes(data)
    data = path.read_bytes()
    if len(data) != pack["bytes"] or digest(data) != pack["sha256"]:
        raise ValueError(f"Archive checksum failed: {pack['id']}")
    return path


def duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True, timeout=10,
    )
    return round(float(result.stdout.strip()), 3)


def ingest(pack):
    rows = []
    path = archive_for(pack)
    with zipfile.ZipFile(path) as zf:
        if len(zf.infolist()) > 40 or sum(i.file_size for i in zf.infolist()) > 4_000_000:
            raise ValueError("Unexpected archive size")
        for item in zf.infolist():
            name = Path(item.filename).name
            if item.is_dir() or item.filename.startswith("__MACOSX/") or name == "MenuSFXPreview.mp3":
                continue
            if not re.fullmatch(r"[A-Za-z0-9 _\[\]().-]+\.(wav|mp3)", name, re.I) or item.filename != name:
                raise ValueError(f"Unexpected archive member: {item.filename}")
            if item.file_size > 600_000:
                raise ValueError(f"Oversized audio: {name}")
            audio = zf.read(item)
            if len(audio) != item.file_size or not (
                name.lower().endswith(".wav") and audio.startswith(b"RIFF")
                or name.lower().endswith(".mp3") and (audio.startswith(b"ID3") or audio[:1] == b"\xff")
            ):
                raise ValueError(f"Invalid audio: {name}")
            target = STORE / pack["id"] / name
            target.write_bytes(audio)
            label = re.sub(r" \[\d{4}-\d{2}-\d{2} \d+\]", "", target.stem)
            rows.append({
                "source": "opengameart", "id": f"opengameart:{pack['id']}/{name}",
                "name": label, "file": target.relative_to(ROOT).as_posix(),
                "bytes": len(audio), "sha256": digest(audio), "durationSec": duration(target),
                "sourceUrl": pack["page"], "fileUrl": pack["url"], "license": "CC0-1.0",
                "use": "upload-source", "author": pack["author"], "pack": pack["title"],
                "tags": ["ui", "interface", "button", "menu"],
            })
    return rows


def main():
    rows = sorted((row for pack in PACKS for row in ingest(pack)), key=lambda r: r["id"])
    SOURCE.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    print(json.dumps({"packs": len(PACKS), "sounds": len(rows), "bytes": sum(row["bytes"] for row in rows), "source": str(SOURCE)}))


if __name__ == "__main__":
    main()
