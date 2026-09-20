#!/usr/bin/env python3
"""Package static-screened research tracks, not production-approved training data."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import shutil

from acquire import DEFAULT_OUT, ROOT, now, save_json, sha_file
from build import jsonl, digest, split_for
from validate import strict_rows, near_dedupe, Union


def align_groups(code, sft):
    """Prevent identical code/prose from sitting in opposite candidate splits."""
    groups, hashes, answer_hashes = Union(), {}, {}
    links = []
    for row in code + sft: groups.find(row['group'])
    for row in code:
        hashes[row['normalized_sha256']] = row
    for row in sft:
        for block in row['validation'].get('code_blocks', []):
            h = block['normalized_sha256']
            other = hashes.get(h)
            if other is not None:
                groups.merge(row['group'], other['group'])
                links.append({'a': row['id'], 'b': other['id'], 'reason': 'shared_normalized_code'})
            else: hashes[h] = row
        for message in row['messages']:
            if message['role'] != 'assistant' or len(message['content']) < 200: continue
            h = digest(message['content'])
            other = answer_hashes.get(h)
            if other is not None:
                groups.merge(row['group'], other['group'])
                links.append({'a': row['id'], 'b': other['id'], 'reason': 'shared_assistant_answer'})
            else: answer_hashes[h] = row
    for row in code + sft:
        row['group'] = groups.find(row['group'])
        row['split'] = split_for(row['group'])
    return links


def artifact_info(path, release, rows):
    return {'path': str(path.relative_to(release)), 'rows': rows,
            'bytes': path.stat().st_size, 'sha256': sha_file(path), 'training_approved': False}


def finalize(out):
    release = out / 'release'
    if (release / 'manifest.json').exists():
        raise RuntimeError('Release manifest already exists; do not overwrite a frozen release')
    tracks, overall = {}, Counter()
    topics, source_counts, rights = {}, {}, {}
    for name in ['code', 'sft']:
        checked = list(strict_rows(out / ('staging/' + name + '-checked.jsonl')))
        receipt = json.loads((out / ('audit/' + name + '-validation-counts.json')).read_text())
        if receipt['output_sha256'] != sha_file(out / ('staging/' + name + '-checked.jsonl')):
            raise RuntimeError('Checked records changed after validation: ' + name)
        if receipt['counts']['checked'] != len(checked): raise RuntimeError('Validation denominator mismatch')
        passed = [r for r in checked if r['static_filter'] == 'pass']
        review = [r for r in checked if r['static_filter'] != 'pass']
        unique, removed, dedupe = near_dedupe(passed)
        jsonl(out / ('audit/' + name + '-dedupe-exclusions.jsonl'), removed)
        save_json(out / ('audit/' + name + '-near-dedupe.json'), dedupe)
        jsonl(out / ('staging/' + name + '-review.jsonl'), review)
        overall[name + '_checked'] = len(checked)
        overall[name + '_static_pass_before_dedupe'] = len(passed)
        overall[name + '_retained_candidates'] = len(unique)
        overall[name + '_review_required'] = len(review)
        overall[name + '_duplicates_removed'] = len(removed)
        tracks[name] = unique
        del checked, passed, review
        print('deduped', name, len(unique), 'removed', len(removed), flush=True)
    links = align_groups(tracks['code'], tracks['sft'])
    save_json(out/'audit/cross-track-group-links.json', {'links': links, 'method': 'exact normalized code blocks and exact long assistant answers'})
    files = []
    split_counts, group_splits = {}, {}
    for name, rows in tracks.items():
        topics[name] = dict(Counter(topic for r in rows for topic in r['topics']))
        source_counts[name] = dict(Counter(r['provenance']['source_id'] for r in rows))
        rights[name] = dict(Counter(r['rights']['status'] for r in rows))
        split_counts[name] = {}
        for row in rows:
            old = group_splits.setdefault(row['group'], row['split'])
            if old != row['split']: raise RuntimeError('Group leaked across splits')
        for split in ['train', 'validation', 'test']:
            path = release / (name + '_candidates') / (split + '.jsonl')
            count = jsonl(path, (r for r in rows if r['split'] == split))
            split_counts[name][split] = count
            files.append(artifact_info(path, release, count))
    knowledge = release/'knowledge/references.jsonl'
    knowledge_rows = list(strict_rows(knowledge))
    ids = [r['id'] for r in knowledge_rows]
    if len(ids) != len(set(ids)): raise RuntimeError('Duplicate reference identities')
    if any(r['training_admission'] != 'retrieval_only' for r in knowledge_rows):
        raise RuntimeError('Documentation was silently admitted to training')
    overall['knowledge_reference_records'] = len(knowledge_rows)
    files.append(artifact_info(knowledge, release, len(knowledge_rows)))
    topics['knowledge'] = dict(Counter(topic for r in knowledge_rows for topic in r['topics']))
    source_counts['knowledge'] = dict(Counter(r['provenance']['source_id'] for r in knowledge_rows))
    known_sources = {}
    # Derive from the already-processed records, not a new raw-source metadata
    # inspection. Every retained revision remains represented independently.
    for row in tracks['code'] + tracks['sft'] + knowledge_rows:
        p = row['provenance']; key = (p['source_id'], p['revision'])
        known_sources[key] = {k: p.get(k) for k in ['source_id', 'revision', 'source_url', 'declared_license']}
    save_json(release/'sources.json', {'sources': [known_sources[k] for k in sorted(known_sources)],
                'local_repository_ingestion': 'not_part_of_this_resume'})
    save_json(release/'coverage.json', {'topics': topics, 'source_counts': source_counts, 'rights_status': rights,
                                     'topic_assignment': 'keyword-derived metadata, not expert coverage scoring'})
    manifest = {'built_at': now(), 'schema': 'apple-roblox-research-candidate-v1',
        'files': files, 'counts': dict(overall), 'splits': split_counts,
        'cross_track_group_links': len(links), 'group_count': len(group_splits),
        'production_training_ready': False, 'engine_tests_run': 0, 'model_training_run': False,
        'scope': 'seven acquired HF sources; two official documentation sources used; HF code/conversation candidates screened',
        'limits': [
            'Static compilation and heuristic checks are not semantic, integration, type or visual validation.',
            'Publisher and per-row detected licences have not all received independent rights clearance.',
            '2023 official code completions are a historical lane, not current-API-certified code.',
            'Explicit classes/services/enums are checked; complete property/method/type correctness is not.',
            'Heuristic near-duplicate retrieval can miss paraphrases and semantically equivalent code.',
            'Candidate splits do not establish independence from undisclosed upstream training data.',
            'Local repository licence inspection and raw manual sample inspection remain blocked; not retried.',
            'No full Creator Store coverage, private leaks, observed tool trajectories, or frontier performance is claimed.',
            'HF HQ and tool-trajectory sample sources are acquired research material, not admitted by this release.'
        ]}
    save_json(release/'manifest.json', manifest)
    print('release_counts', json.dumps(dict(overall)), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--out', type=Path, default=DEFAULT_OUT)
    finalize(p.parse_args().out.resolve())
