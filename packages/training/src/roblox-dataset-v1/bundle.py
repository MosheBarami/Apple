#!/usr/bin/env python3
"""Archive only the finalized research release and its bounded build evidence.

No raw sources, credentials, rejected snippets, customer data, model weights or
unrelated project files are included. This does not publish or upload anything.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

from acquire import DEFAULT_OUT, ROOT, now, save_json, sha_file

HERE = Path(__file__).resolve().parent
AUDIT_FILES = [
    'code-normalization-counts.json', 'sft-normalization-counts.json',
    'knowledge-counts.json', 'code-validation-counts.json',
    'sft-validation-counts.json', 'compiler-controls.json',
    'release-verification.json', 'release-integrity-red.log',
    'final-focused-tests.log', 'finalize.log',
]


def bundle(out):
    release = out / 'release'
    manifest = json.loads((release / 'manifest.json').read_text())
    proof = json.loads((out / 'audit/release-verification.json').read_text())
    if proof.get('integrity_pass') is not True or proof.get('semantic_quality_pass') is not False:
        raise RuntimeError('Verified research-candidate integrity receipt required')
    if proof['records'] != sum(item['rows'] for item in manifest['files']):
        raise RuntimeError('Manifest and verification denominator differ')
    included = []
    for item in manifest['files']:
        path = (release / item['path']).resolve()
        if release.resolve() not in path.parents or sha_file(path) != item['sha256']:
            raise RuntimeError('Frozen data changed before bundling')
    for path in sorted(release.rglob('*')):
        if not path.is_file(): continue
        if path.is_symlink() or path.suffix not in {'.json', '.jsonl', '.md'}:
            raise RuntimeError('Unexpected release file')
        included.append((path, 'release/' + str(path.relative_to(release))))
    for name in AUDIT_FILES:
        path = out / 'audit' / name
        if not path.is_file(): raise RuntimeError('Missing build evidence: ' + name)
        included.append((path, 'evidence/' + name))
    for path in sorted(HERE.iterdir()):
        if path.is_file() and path.suffix in {'.py', '.mjs', '.md'}:
            included.append((path, 'pipeline_snapshot/' + path.name))
    fingerprints = [{'path': name, 'bytes': path.stat().st_size, 'sha256': sha_file(path)}
                    for path, name in included]
    destination = out / 'delivery/Apple_Roblox_Research_v1_candidates.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise RuntimeError('Delivery archive already exists; do not overwrite it')
    tmp = destination.with_suffix('.zip.partial')
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6,
                         allowZip64=True) as archive:
        for path, name in included:
            archive.write(path, name)
        archive.writestr('BUNDLE_CONTENTS.json', json.dumps({
            'built_at': now(), 'files': fingerprints,
            'training_approved': False,
            'pipeline_note': 'Pipeline snapshots expect the existing Apple repository imports and tools; these are not a standalone execution environment.'
        }, indent=2) + '\n')
    # Read back each stored member and compare its bytes with the frozen input,
    # rather than claiming that successful compression proves a sound archive.
    with zipfile.ZipFile(tmp) as archive:
        for item in fingerprints:
            h = hashlib.sha256()
            size = 0
            with archive.open(item['path']) as f:
                for block in iter(lambda: f.read(1024 * 1024), b''):
                    h.update(block); size += len(block)
            if size != item['bytes'] or h.hexdigest() != item['sha256']:
                raise RuntimeError('Archived member differs from frozen source')
    os.replace(tmp, destination)
    receipt = {
        'created_at': now(), 'path': str(destination.relative_to(ROOT)),
        'bytes': destination.stat().st_size, 'sha256': sha_file(destination),
        'verified_members': len(fingerprints), 'data_records': proof['records'],
        'source_fingerprints': fingerprints, 'raw_sources_included': False,
        'rejected_content_included': False, 'published': False,
        'training_approved': False,
    }
    save_json(out / 'delivery/archive-receipt.json', receipt)
    print(json.dumps({k: v for k, v in receipt.items() if k != 'source_fingerprints'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    bundle(parser.parse_args().out.resolve())
