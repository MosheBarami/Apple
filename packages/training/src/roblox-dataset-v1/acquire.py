#!/usr/bin/env python3
"""Pinned, public-only acquisition for an isolated Roblox research corpus.

This does not modify the existing training splits, rejection ledgers, model
configuration, or customer data. Downloaded code is data, never executed.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlencode, urlparse

import requests

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT = ROOT / 'packages/training/data/roblox-research-v1-20260920'
PERMISSIVE = {'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense'}
UA = {'User-Agent': 'Apple-Roblox-Research/1.0 (public dataset acquisition)'}
MAX_FILE_BYTES = 768 * 1024 * 1024
HF_SOURCES = [
    ('Pinkstack/luau-pretrain-corpus-filtered', ['luau_full_corpus_open_license.parquet'], 'code_candidate', None),
    ('khtsly/Luau-Coder-1.0-Preview-SFT', ['train.parquet'], 'synthetic_sft_candidate', None),
    ('khtsly/luau-stack-hq', ['train.parquet'], 'code_license_review', None),
    ('Pinkstack/LuauDev-instructions-SFT-preview', ['data.jsonl'], 'synthetic_sft_candidate', None),
    ('Pinkstack/RobloxAgent-toolreason-v2-sample100', ['luau_dataset.jsonl'], 'trajectory_candidate', None),
    ('Roblox/luau_corpus', ['train.jsonl', 'test.jsonl'], 'historical_completion_reference', None),
    ('TorpedoSoftware/RobloxQA-v2.0', ['train.parquet', 'test.parquet'], 'evaluation_exclusion_only', '3d983bf3a4702ef33719de4bb9fa8eaedbe626f1'),
]
GITHUB_SOURCES = [
    ('Roblox/creator-docs', 'official_documentation_retrieval_only'),
    ('luau-lang/site', 'official_language_documentation'),
    ('luau-lang/luau', 'language_implementation_reference'),
]


def now():
    return datetime.now(timezone.utc).isoformat()


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.partial')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def get(url, stream=False):
    """No credentials and no retries of authorization refusals."""
    if urlparse(url).scheme != 'https':
        raise ValueError('HTTPS required')
    for attempt in range(4):
        try:
            response = requests.get(url, headers=UA, timeout=(15, 90), stream=stream)
        except (requests.Timeout, requests.ConnectionError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
            continue
        if response.status_code == 429 or response.status_code >= 500:
            delay = response.headers.get('Retry-After', '')
            response.close()
            if attempt == 3:
                raise RuntimeError('Transient HTTP failure after four attempts: ' + url)
            time.sleep(min(60, int(delay)) if delay.isdigit() else 2 ** attempt)
            continue
        response.raise_for_status()
        return response
    raise RuntimeError('No HTTP response')


def download(url, path):
    path = Path(path)
    receipt = path.with_suffix(path.suffix + '.receipt.json')
    if path.exists():
        if not receipt.exists():
            raise RuntimeError('Existing data lacks a receipt: ' + str(path))
        record = json.loads(receipt.read_text())
        if record['requested_url'] != url or record['sha256'] != sha_file(path):
            raise RuntimeError('Existing download differs from its pinned receipt')
        return record
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + '.partial')
    response = get(url, stream=True)
    declared = response.headers.get('Content-Length')
    if declared and int(declared) > MAX_FILE_BYTES:
        response.close()
        raise RuntimeError('File exceeds acquisition byte ceiling')
    h = hashlib.sha256()
    size = 0
    started = time.monotonic()
    try:
        with partial.open('wb') as f:
            for block in response.iter_content(1024 * 1024):
                size += len(block)
                if size > MAX_FILE_BYTES or time.monotonic() - started > 1200:
                    raise RuntimeError('Download exceeds bounded byte/time limit')
                h.update(block)
                f.write(block)
        if declared and size != int(declared) and not response.headers.get('Content-Encoding'):
            raise RuntimeError('Truncated download')
        os.replace(partial, path)
    finally:
        response.close()
    record = {'requested_url': url, 'bytes': size, 'sha256': h.hexdigest(),
              'retrieved_at': now(), 'http_status': response.status_code}
    # Do not persist signed CDN URLs or ephemeral authorization query strings.
    save_json(receipt, record)
    return record


def hf_source(item, out):
    repo, filenames, purpose, override = item
    directory = out / 'raw/hf' / repo.replace('/', '__')
    directory.mkdir(parents=True, exist_ok=True)
    metadata_path = directory / 'source.json'
    if metadata_path.exists():
        record = json.loads(metadata_path.read_text())
    else:
        metadata = get('https://huggingface.co/api/datasets/' + repo).json()
        if metadata.get('gated') not in (False, None):
            raise RuntimeError('Gated source requires separate permission: ' + repo)
        revision = override or metadata.get('sha')
        if not re.fullmatch('[0-9a-f]{40}', revision or ''):
            raise RuntimeError('Source has no immutable revision')
        record = {'id': repo, 'kind': 'huggingface_dataset', 'purpose': purpose,
                  'revision': revision, 'last_modified': metadata.get('lastModified'),
                  'declared_license': (metadata.get('cardData') or {}).get('license'),
                  'source_url': 'https://huggingface.co/datasets/' + repo,
                  'discovered_at': now(), 'admitted_to_training': False, 'files': []}
        save_json(directory / 'hub-metadata.json', metadata)
        save_json(metadata_path, record)
    base = 'https://huggingface.co/datasets/' + repo + '/resolve/' + record['revision'] + '/'
    files = []
    for name in ['README.md'] + filenames:
        result = download(base + quote(name, safe='/'), directory / name)
        files.append({'name': name, 'local_path': str((directory / name).relative_to(out)), **result})
        print('downloaded', repo, name, result['bytes'], flush=True)
    record['files'] = files
    record['acquisition_complete'] = True
    save_json(metadata_path, record)
    return record


def extract_text_archive(archive, destination):
    """Never extract links, executables, traversal paths, images, or arbitrary binaries."""
    destination.mkdir(parents=True, exist_ok=True)
    accepted = []
    total = 0
    with tarfile.open(archive, 'r:*') as tar:
        for member in tar:
            parts = PurePosixPath(member.name).parts
            if not member.isfile() or len(parts) < 2 or '..' in parts or parts[0] == '/':
                continue
            rel = PurePosixPath(*parts[1:])
            suffix = rel.suffix.lower()
            is_notice = bool(re.match(r'(?i)^(license|licence|copying|notice|authors)([-._]|$)', rel.name))
            if suffix not in {'.md', '.mdx', '.yaml', '.yml', '.lua', '.luau', '.json', '.txt'} and not is_notice:
                continue
            if any(p in {'node_modules', '.git', 'vendor', '_Index'} for p in rel.parts):
                continue
            if member.size > 4 * 1024 * 1024:
                continue
            total += member.size
            if total > 512 * 1024 * 1024 or len(accepted) > 50000:
                raise RuntimeError('Archive text exceeds extraction ceiling')
            data = tar.extractfile(member).read()
            try:
                data.decode('utf-8')
            except UnicodeDecodeError:
                continue
            if b'\x00' in data:
                continue
            target = destination.joinpath(*rel.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            accepted.append({'path': str(rel), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    return accepted


def github_source(item, out):
    repo, purpose = item
    directory = out / 'raw/github' / repo.replace('/', '__')
    directory.mkdir(parents=True, exist_ok=True)
    record_path = directory / 'source.json'
    if record_path.exists():
        record = json.loads(record_path.read_text())
    else:
        result = subprocess.run(['git', 'ls-remote', 'https://github.com/' + repo + '.git', 'HEAD'],
                                capture_output=True, text=True, timeout=45, check=True)
        revision = result.stdout.split()[0]
        if not re.fullmatch('[0-9a-f]{40}', revision):
            raise RuntimeError('Invalid upstream revision')
        record = {'id': repo, 'kind': 'github_repository', 'purpose': purpose, 'revision': revision,
                  'source_url': 'https://github.com/' + repo, 'discovered_at': now(),
                  'admitted_to_training': False}
        save_json(record_path, record)
    archive = directory / 'source.tar.gz'
    record['archive'] = download('https://codeload.github.com/' + repo + '/tar.gz/' + record['revision'], archive)
    record['text_files'] = extract_text_archive(archive, directory / 'text')
    record['acquisition_complete'] = True
    save_json(record_path, record)
    print('github', repo, record['revision'], 'text_files', len(record['text_files']), flush=True)
    return record


def snapshot_existing(out):
    manifest_path = ROOT / 'packages/corpus/raw/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    snapshot_dir = out / 'evidence/existing-pipeline'
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    paths = [manifest_path, ROOT / 'packages/corpus/raw/manifest.hf.json',
             ROOT / 'packages/training/data/hf/REJECTED.json',
             ROOT / 'packages/evals/data/robloxqa/question-keys.json',
             ROOT / 'packages/evals/data/robloxqa/dataset-card.json']
    for p in paths:
        if p.exists():
            name = str(p.relative_to(ROOT)).replace('/', '__')
            (snapshot_dir / name).write_bytes(p.read_bytes())
    records = []
    for key, source in manifest.get('sources', {}).items():
        if source.get('licence', {}).get('spdx') not in PERMISSIVE:
            continue
        if key == 'luau-lang__site':
            continue  # Fresh official documentation is acquired separately.
        repo_dir = ROOT / 'packages/corpus/raw' / key
        revision = source.get('sha', '')
        directory = out / 'raw/existing' / key
        directory.mkdir(parents=True, exist_ok=True)
        record = {'id': source['url'].replace('https://github.com/', ''), 'revision': revision,
                  'kind': 'existing_pinned_repository', 'source_url': source['url'],
                  'purpose': 'licensed_code_reference', 'declared_license': source['licence']['spdx'],
                  'admitted_to_training': False, 'source_manifest_sha256': sha_file(manifest_path)}
        try:
            archive = directory / 'source.tar'
            with archive.open('wb') as f:
                subprocess.run(['git', '-C', str(repo_dir), 'archive', '--format=tar', '--prefix=source/', revision],
                               stdout=f, stderr=subprocess.PIPE, check=True, timeout=60)
            record['text_files'] = extract_text_archive(archive, directory / 'text')
            record['archive_sha256'] = sha_file(archive)
            record['acquisition_complete'] = True
        except Exception as e:
            record['acquisition_complete'] = False
            record['error'] = type(e).__name__ + ': ' + str(e)[:300]
        save_json(directory / 'source.json', record)
        records.append(record)
    save_json(out / 'manifests/existing-sources.json', records)
    print('existing_repository_snapshots', len(records), flush=True)


def inventory(out):
    """Persist live metadata for the query families, including cursor completion."""
    records = {}
    searches = []
    specs = [('datasets', q, None) for q in ['roblox', 'luau', 'rblx', 'robloxstudio']]
    specs += [('models', 'luau', None), ('models', 'roblox', None),
              ('datasets', None, 'Roblox'), ('models', None, 'Roblox')]
    for kind, query, author in specs:
        params = {'limit': 100, 'full': 'true'}
        if query:
            params['search'] = query
        if author:
            params['author'] = author
        url = 'https://huggingface.co/api/' + kind + '?' + urlencode(params)
        pages, found = 0, 0
        while url and pages < 20:
            response = get(url)
            body = response.json()
            if not isinstance(body, list):
                raise RuntimeError('Unexpected Hub inventory response')
            for row in body:
                ident = row.get('id') or row.get('modelId')
                if ident:
                    records[kind + ':' + ident] = {'kind': kind, **row}
            found += len(body)
            pages += 1
            url = response.links.get('next', {}).get('url')
            time.sleep(.2)
        searches.append({'kind': kind, 'query': query, 'author': author, 'pages': pages,
                         'returned': found, 'pagination_exhausted': not bool(url)})
        print('inventory', kind, query or author, found, flush=True)
    save_json(out / 'manifests/hf-inventory.json', {'observed_at': now(), 'searches': searches,
               'repositories': list(records.values()), 'coverage_claim': 'Named query families only; not all Hub content.'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--phase', choices=['hf', 'github', 'existing', 'inventory', 'all'], default='all')
    args = parser.parse_args()
    out = args.out.resolve()
    if out in {ROOT / 'packages/training/data', ROOT / 'packages/corpus/raw'}:
        raise SystemExit('Refusing canonical output directory')
    out.mkdir(parents=True, exist_ok=True)
    if args.phase in {'inventory', 'all'}:
        inventory(out)
    if args.phase in {'existing', 'all'}:
        snapshot_existing(out)
    jobs = []
    if args.phase in {'hf', 'all'}:
        jobs += [(hf_source, x) for x in HF_SOURCES]
    if args.phase in {'github', 'all'}:
        jobs += [(github_source, x) for x in GITHUB_SOURCES]
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(fn, item, out): item[0] for fn, item in jobs}
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as e:
                failure = {'source': futures[future], 'error': type(e).__name__ + ': ' + str(e)[:400]}
                failures.append(failure)
                print('ACQUISITION_FAILED', failure, flush=True)
    save_json(out / ('manifests/acquisition-' + args.phase + '.json'), {'finished_at': now(), 'failures': failures})
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
