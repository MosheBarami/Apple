#!/usr/bin/env python3
"""Verify every emitted record and checksum without printing source contents."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re

from acquire import DEFAULT_OUT, now, save_json, sha_file
from validate import strict_rows


def verify(out):
    release = (out/'release').resolve()
    manifest = json.loads((release/'manifest.json').read_text())
    if manifest.get('production_training_ready') is not False:
        raise ValueError('This research release cannot claim production training readiness')
    # Version-specific completeness contract, including intentionally empty split
    # files. Removing a file and its count must not turn a partial release green.
    expected_files = {kind + '_candidates/' + split + '.jsonl'
                      for kind in ['code', 'sft'] for split in ['train', 'validation', 'test']}
    expected_files.add('knowledge/references.jsonl')
    if {item.get('path') for item in manifest.get('files', [])} != expected_files:
        raise ValueError('Unexpected or incomplete manifest file set')
    seen_paths, ids, groups, code_splits = set(), set(), {}, {}
    kinds, split_counts = Counter(), Counter()
    observations = []
    for item in manifest['files']:
        rel = item['path']
        path = (release/rel).resolve()
        if release not in path.parents or rel in seen_paths:
            raise ValueError('Invalid or duplicate manifest path')
        seen_paths.add(rel)
        if item.get('training_approved') is not False:
            raise ValueError('Unestablished training approval on a candidate artifact')
        if sha_file(path) != item['sha256'] or path.stat().st_size != item['bytes']:
            raise ValueError('Artifact checksum/size differs: ' + rel)
        count = 0
        for row in strict_rows(path):
            if row['id'] in ids: raise ValueError('Duplicate record ID')
            ids.add(row['id']); count += 1; kinds[row['kind']] += 1
            provenance = row.get('provenance', {})
            if not provenance.get('source_id') or not provenance.get('revision') or not provenance.get('source_url'):
                raise ValueError('Missing retained-record provenance')
            if not re.fullmatch(r'[0-9a-f]{40}', provenance['revision']):
                raise ValueError('Provenance does not contain an immutable revision')
            if row['kind'] == 'retrieval_reference':
                if row['split'] != 'reference' or row['training_admission'] != 'retrieval_only':
                    raise ValueError('Reference content entered training')
                continue
            if row.get('static_filter') != 'pass' or row['validation'].get('review_flags'):
                raise ValueError('A static-review record entered the screened candidate track')
            if not row.get('training_admission', '').startswith('candidate_only'):
                raise ValueError('Research candidate was silently promoted')
            if row['validation'].get('engine_execution') != 'not_run':
                raise ValueError('Unestablished engine-execution claim')
            split = row['split']
            split_counts[(row['kind'], split)] += 1
            if split not in {'train', 'validation', 'test'} or path.stem != split:
                raise ValueError('Wrong split file')
            if groups.setdefault(row['group'], split) != split:
                raise ValueError('Group appears in opposing splits')
            if row['kind'] == 'source_code':
                if row['validation']['compiler']['status'] != 'pass': raise ValueError('Uncompiled code candidate')
                hashes = [row['normalized_sha256']]
            elif row['kind'] == 'synthetic_conversation':
                blocks = row['validation'].get('code_blocks', [])
                if not blocks or any(b['compiler']['status'] != 'pass' for b in blocks):
                    raise ValueError('Uncompiled SFT code candidate')
                hashes = [b['normalized_sha256'] for b in blocks]
            else: raise ValueError('Unsupported kind')
            for h in hashes:
                if code_splits.setdefault(h, split) != split:
                    raise ValueError('Identical normalized code spans opposing tracks/splits')
        if count != item['rows']: raise ValueError('Manifest row count differs: ' + rel)
        observations.append({'path': rel, 'rows': count, 'sha256_verified': True})
    if not observations or not ids: raise ValueError('Empty release cannot pass')
    expected = manifest['counts']
    for kind, field in [('source_code', 'code_retained_candidates'),
                        ('synthetic_conversation', 'sft_retained_candidates'),
                        ('retrieval_reference', 'knowledge_reference_records')]:
        if kinds[kind] != expected[field]: raise ValueError('Aggregate count mismatch: ' + kind)
    for name, kind in [('code', 'source_code'), ('sft', 'synthetic_conversation')]:
        for split in ['train', 'validation', 'test']:
            if split_counts[(kind, split)] != manifest['splits'][name][split]:
                raise ValueError('Split count mismatch: ' + name + '/' + split)
    report = {'verified_at': now(), 'files': observations, 'records': len(ids),
              'kinds': dict(kinds), 'groups': len(groups), 'exact_cross_split_code_conflicts': 0,
              'integrity_pass': True, 'semantic_quality_pass': False,
              'interpretation': 'Artifact/schema/provenance-presence/group integrity only; not correctness, licensing clearance, or model performance.'}
    save_json(out/'audit/release-verification.json', report)
    print(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--out', type=Path, default=DEFAULT_OUT)
    verify(p.parse_args().out.resolve())
