#!/usr/bin/env python3
"""Normalize and validate the acquired research corpus, without running its code.

Output tracks deliberately separate current documentation, licensed source code,
historical completions, and publisher-authored synthetic conversations. This is
not a promotion decision for the product's existing training pipeline.
"""
import argparse
import collections
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
from urllib.parse import quote

import pyarrow.parquet as pq
import yaml

from acquire import ROOT, DEFAULT_OUT, PERMISSIVE, now, save_json, sha_file, get, extract_text_archive

MAX_CODE = 200_000
MAX_CONVERSATION = 400_000
TEXT_EXTS = {'.md', '.mdx'}
CODE_EXTS = {'.lua', '.luau'}
OMIT_PARTS = {'node_modules', 'Packages', 'DevPackages', '_Index', 'vendor', '.git'}
REPO_NAME = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
COMMIT = re.compile(r'^[0-9a-f]{40}$')
SECRET = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk_live_|rk_live_)[A-Za-z0-9]{20,}|\bhf_[A-Za-z0-9]{30,}|\bgh[pousr]_[A-Za-z0-9]{30,}|discord(?:app)?\.com/api/webhooks/\d{15,}/[A-Za-z0-9_-]{30,}')
FENCE = re.compile(r'^\s*```([^\n`]*)\n([\s\S]*?)^\s*```\s*$', re.M)
TOPICS = {
    'language_types': r'\b(export type|type function|type pack|generics?|metatable|typeof|Luau)\b',
    'ui_accessibility': r'\b(ScreenGui|GuiObject|UIListLayout|UIGridLayout|TextLabel|UIScale|accessibility|GuiService)\b',
    'input_devices': r'\b(UserInputService|ContextActionService|TouchEnabled|Gamepad|KeyCode|InputAction)\b',
    'persistence': r'\b(DataStore|DataStoreService|ProfileStore|ProfileService|session.lock|MemoryStore)\b',
    'networking': r'\b(RemoteEvent|RemoteFunction|UnreliableRemoteEvent|OnServerEvent|replication|networking)\b',
    'security': r'\b(validation|validate|permission|security|anti.exploit|rate.limit|finite|sanitize)\b',
    'monetization': r'\b(MarketplaceService|ProcessReceipt|PurchaseId|Developer.Product|Gamepass|subscription)\b',
    'physics': r'\b(AssemblyLinearVelocity|constraint|Raycast|collision|physics|RunService|Vector3|CFrame)\b',
    'characters_animation': r'\b(Humanoid|Animator|AnimationTrack|character|rigging|IKControl)\b',
    'audio': r'\b(SoundService|AudioPlayer|AudioEmitter|SoundGroup|audio|soundtrack)\b',
    'vfx_lighting': r'\b(ParticleEmitter|Lighting|Atmosphere|BloomEffect|Beam|Trail|PostEffect)\b',
    'terrain_worlds': r'\b(Terrain|FillBlock|ReadVoxels|WriteVoxels|StreamingEnabled|WorldRoot|worldbuilding)\b',
    'npc_ai': r'\b(PathfindingService|Path|NPC|pathfinding|behavior.tree|state.machine|AI)\b',
    'social_localization': r'\b(TextChatService|LocalizationService|SocialService|TeleportService|TextService|localization)\b',
    'assets_creation': r'\b(AssetService|InsertService|EditableMesh|EditableImage|MeshPart|ContentProvider|asset)\b',
    'tooling_plugins': r'\b(plugin|Plugin|ChangeHistoryService|ScriptEditorService|Selection|Studio|MCP)\b',
    'performance': r'\b(profiling|MicroProfiler|optimization|performance|cache|memory|parallel)\b',
    'testing': r'\b(TestEZ|Jest|describe|expect|unit.test|integration.test|playtest)\b',
    'open_cloud': r'\b(Open.Cloud|OAuth|HttpService|REST|API.key|Cloud)\b',
    'analytics_design': r'\b(AnalyticsService|analytics|retention|onboarding|game.design|economy)\b',
}
TOPICS = {k: re.compile(v, re.I) for k, v in TOPICS.items()}
LEX_TOKEN = re.compile(r'[A-Za-z_][A-Za-z0-9_]*|(?:0[xX][0-9A-Fa-f_]+|\d[\w.]*)(?:[eE][+-]?\d+)?|\.\.\.|\.\.|::|->|==|~=|<=|>=|\+=|-=|\*=|/=|//=|//|.')


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def words(text):
    return re.findall(r'[A-Za-z0-9_]+', text.lower())


def text_ngrams(text, size=12):
    tokens = words(text)
    return {' '.join(tokens[i:i+size]) for i in range(max(0, len(tokens)-size+1))}


def lex(code):
    """Whitespace/comment normalization preserving literal contents and operators.

    Backtick strings remain opaque: this is a dedupe tokenizer, not a Luau parser.
    The real compiler is the syntax authority.
    """
    out = []
    i = 0
    n = len(code)
    while i < n:
        if code[i].isspace():
            i += 1
            continue
        comment = code.startswith('--', i)
        start = i + 2 if comment else i
        match = re.match(r'\[(=*)\[', code[start:start+40])
        if match:
            closer = ']' + match[1] + ']'
            end = code.find(closer, start + len(match[0]))
            stop = n if end < 0 else end + len(closer)
            if not comment:
                out.append(code[i:stop])
            i = stop
        elif comment:
            end = code.find('\n', i)
            i = n if end < 0 else end
        elif code[i] in "\"'`":
            q = code[i]
            j = i + 1
            while j < n:
                if code[j] == '\\':
                    j += 2
                elif code[j] == q:
                    j += 1
                    break
                else:
                    j += 1
            out.append(code[i:j])
            i = j
        else:
            # Match at an offset; copying the entire remaining file for every
            # token made large-source normalization unnecessarily quadratic.
            m = LEX_TOKEN.match(code, i)
            if not m:
                i += 1
            else:
                out.append(m[0]); i += len(m[0])
    return out


def code_hash(code):
    return digest('\x1f'.join(lex(code)))


def split_for(group):
    value = int(digest('apple-roblox-research-v1:' + group)[:8], 16) % 100
    return 'train' if value < 80 else 'validation' if value < 90 else 'test'


def iter_rows(path):
    if path.suffix == '.parquet':
        for batch in pq.ParquetFile(path).iter_batches(batch_size=64):
            yield from batch.to_pylist()
    else:
        with path.open(encoding='utf-8') as f:
            for line_no, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    yield {'_decode_error': line_no}


def jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.partial')
    count = 0
    with temp.open('w', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
            count += 1
    os.replace(temp, path)
    return count


def source_record(directory):
    record = json.loads((directory / 'source.json').read_text())
    if not record.get('acquisition_complete'):
        raise ValueError('Source acquisition incomplete: ' + record['id'])
    return record


def provenance(record, path, row=None):
    return {'source_id': record['id'], 'revision': record['revision'],
            'source_url': record['source_url'], 'source_path': str(path),
            'source_row': row, 'retrieved_at': record.get('discovered_at'),
            'declared_license': record.get('declared_license')}


def license_kind(text):
    if 'Permission is hereby granted, free of charge' in text and 'THE SOFTWARE IS PROVIDED' in text:
        return 'MIT'
    if 'Apache License' in text and 'Version 2.0' in text:
        return 'Apache-2.0'
    if 'This is free and unencumbered software released into the public domain' in text:
        return 'Unlicense'
    if 'Redistribution and use in source and binary forms' in text:
        return 'BSD-3-Clause' if 'Neither the name' in text else 'BSD-2-Clause'
    return None


def local_license(directory):
    texts = directory / 'text'
    for p in sorted(texts.iterdir()):
        if p.is_file() and re.match(r'(?i)^(license|licence|copying)([-._]|$)', p.name):
            text = p.read_text(encoding='utf-8')
            kind = license_kind(text)
            if kind:
                return {'status': 'license_text_verified', 'spdx': kind, 'path': str(p), 'sha256': digest(text)}
    return {'status': 'license_text_missing_or_unrecognized', 'spdx': None}


def make_guard(out):
    """Evaluation is only an exclusion source. Never emit its answers into training."""
    guard = set()
    protected_code = set()
    evidence = []
    tasks_dir = ROOT / 'packages/evals/tasks'
    if not tasks_dir.exists():
        raise RuntimeError('Existing evaluation tasks are unavailable; fail closed')
    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for x in value: yield from strings(x)
        elif isinstance(value, dict):
            for k, x in value.items():
                if k not in {'id', 'category', 'weight'}: yield from strings(x)
    for p in sorted(tasks_dir.rglob('*.json')):
        obj = json.loads(p.read_text())
        for text in strings(obj):
            guard.update(text_ngrams(text, 12))
        evidence.append({'path': str(p.relative_to(ROOT)), 'sha256': sha_file(p)})
    qa = out / 'raw/hf/TorpedoSoftware__RobloxQA-v2.0'
    for name in ['train.parquet', 'test.parquet']:
        p = qa / name
        for row in iter_rows(p):
            for k, value in row.items():
                if isinstance(value, str) and k.lower() in {'question', 'prompt', 'instruction', 'query'}:
                    guard.update(text_ngrams(value, 12))
        evidence.append({'path': str(p.relative_to(out)), 'sha256': sha_file(p)})
    official_test = out / 'raw/hf/Roblox__luau_corpus/test.jsonl'
    for row in iter_rows(official_test):
        prompt, completion = row.get('prompt', ''), row.get('completion', '')
        if isinstance(prompt, str) and isinstance(completion, str):
            if completion.strip(): protected_code.add(code_hash(completion))
            if (prompt + completion).strip(): protected_code.add(code_hash(prompt + completion))
    save_json(out / 'evidence/evaluation-exclusions.json', {
        'created_at': now(), 'private_source_fingerprints': evidence,
        'question_12grams': len(guard), 'official_test_code_hashes': len(protected_code),
        'test_data_used_for_training': False,
        'limits': ['Exact normalized official test code and 12-word question overlap are checked.',
                   'This is not a proof against paraphrases or undisclosed upstream contamination.',
                   'Creator documentation is retrieval data and is not scored as a novel evaluation split.']})
    return guard, protected_code


def taxonomy(text):
    return [name for name, pattern in TOPICS.items() if pattern.search(text)] or ['general_luau']


def collect_code(out, guard, protected_code, include_existing=True):
    """One record per source file/completion, not a pile of invented instructions."""
    seen = set()
    rejected = []
    counts = collections.Counter()
    records = []
    def emit(text, prov, group, lane, rights, extra=None):
        counts['input'] += 1
        if not isinstance(text, str) or len(text.strip()) < 100:
            rejected.append({'source': prov, 'reason': 'empty_or_trivial'}); return
        row_id = digest(json.dumps(prov, sort_keys=True) + '\n' + text)[:24]
        reason = None
        if len(text) > MAX_CODE: reason = 'source_too_large'
        elif SECRET.search(text): reason = 'credential_pattern'
        tokens = lex(text) if reason is None else []
        normalized = digest('\x1f'.join(tokens)) if tokens else None
        if not reason and len(tokens) < 24: reason = 'insufficient_code_content'
        if not reason and normalized in protected_code: reason = 'official_evaluation_code_overlap'
        if not reason and guard.intersection(text_ngrams(text, 12)): reason = 'evaluation_question_overlap'
        if not reason and normalized in seen: reason = 'normalized_exact_duplicate'
        if reason:
            rejected.append({'id': row_id, 'source': prov, 'reason': reason}); return
        seen.add(normalized)
        record = {'id': row_id, 'kind': 'source_code', 'lane': lane, 'text': text,
                  'provenance': prov, 'rights': rights, 'group': group,
                  'split': split_for(group), 'content_sha256': digest(text),
                  'normalized_sha256': normalized, 'topics': taxonomy(text),
                  'validation': {'engine_execution': 'not_run', 'human_review': 'not_performed'}}
        if extra: record.update(extra)
        records.append(record)
        counts[lane] += 1
    existing_directories = sorted((out / 'raw/existing').iterdir()) if include_existing else []
    for directory in existing_directories:
        if not directory.is_dir():
            continue
        try:
            source = source_record(directory)
        except ValueError:
            continue
        rights = local_license(directory)
        if rights.get('spdx') != source.get('declared_license'):
            counts['repository_license_mismatch'] += 1
            continue
        for p in sorted((directory / 'text').rglob('*')):
            rel = p.relative_to(directory / 'text')
            if not p.is_file() or p.suffix.lower() not in CODE_EXTS or any(x in OMIT_PARTS for x in rel.parts):
                continue
            # Hold explicit library tests apart from example implementation code.
            is_test = bool(re.search(r'(^|/)(tests?|spec|__tests__)(/|$)|\.(?:spec|test)\.', str(rel), re.I))
            emit(p.read_text(), provenance(source, rel), source['id'].lower(),
                 'library_test_reference' if is_test else 'licensed_source_candidate', rights)
    directory = out / 'raw/hf/Pinkstack__luau-pretrain-corpus-filtered'
    source = source_record(directory)
    for index, row in enumerate(iter_rows(directory / 'luau_full_corpus_open_license.parquet')):
        detected = row.get('detected_licenses') or []
        if isinstance(detected, str): detected = [detected]
        repo, commit = str(row.get('repo_path', '')), str(row.get('commit_id', ''))
        allowed = bool(detected) and set(detected).issubset(PERMISSIVE)
        rights = {'status': 'upstream_license_text_not_yet_verified', 'compilation_license': 'ODC-By-1.0',
                  'detected_licenses': detected, 'spdx': detected[0] if len(detected) == 1 else None}
        prov = provenance(source, row.get('file_path', ''), index)
        prov.update({'upstream_repo': repo, 'upstream_revision': commit})
        if not allowed or not REPO_NAME.fullmatch(repo) or not COMMIT.fullmatch(commit):
            rejected.append({'source': prov, 'reason': 'license_or_upstream_provenance_review_required'}); continue
        emit(row.get('content'), prov, repo.lower(), 'upstream_license_candidate', rights)
    # The HQ set lacks row-level commit/license proof. It is recorded in inventory,
    # not silently admitted using the uploader's unrelated repository license.
    directory = out / 'raw/hf/Roblox__luau_corpus'
    source = source_record(directory)
    for index, row in enumerate(iter_rows(directory / 'train.jsonl')):
        prefix, completion = row.get('prompt'), row.get('completion')
        if not isinstance(prefix, str) or not isinstance(completion, str):
            rejected.append({'source': source['id'], 'row': index, 'reason': 'invalid_completion_schema'}); continue
        emit(prefix + completion, provenance(source, 'train.jsonl', index), 'roblox-luau-corpus-historical',
             'historical_completion_candidate', {'status': 'publisher_explicit_license', 'spdx': 'MIT'},
             {'prefix': prefix, 'completion': completion, 'original_split': 'train',
              'currency': 'published_2023_not_current_api_certified'})
    count = jsonl(out / 'staging/code-records.jsonl', records)
    jsonl(out / 'audit/code-normalization-exclusions.jsonl', rejected)
    save_json(out / 'audit/code-normalization-counts.json', {'counts': dict(counts), 'output': count,
               'exclusions': dict(collections.Counter(r['reason'] for r in rejected))})
    print('code_normalized', count, 'excluded', len(rejected), flush=True)


def normalize_conversation(raw):
    if isinstance(raw, dict):
        value = raw.get('conversations', raw.get('conversation', raw.get('messages')))
    else:
        value = raw
    if isinstance(value, str):
        try: value = json.loads(value)
        except json.JSONDecodeError: return None
    if not isinstance(value, list): return None
    messages = []
    aliases = {'human': 'user', 'gpt': 'assistant', 'model': 'assistant'}
    for turn in value:
        if not isinstance(turn, dict): return None
        if turn.get('tool_calls') or turn.get('toolCalls') or turn.get('function_call'):
            return None  # Do not silently turn a tool transcript into ordinary prose.
        role = turn.get('role', turn.get('from'))
        role = aliases.get(role, role)
        content = turn.get('content', turn.get('value'))
        if role not in {'system', 'user', 'assistant'} or not isinstance(content, str):
            return None  # Tool transcripts require separate association validation.
        content = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
        if re.search(r'</?think\b', content, re.I): return None
        if not content: return None
        messages.append({'role': role, 'content': content})
    dialogue = [m for m in messages if m['role'] != 'system']
    if not dialogue or dialogue[0]['role'] != 'user' or dialogue[-1]['role'] != 'assistant':
        return None
    if any(m['role'] != ('user' if i % 2 == 0 else 'assistant') for i, m in enumerate(dialogue)):
        return None
    if any(m['role'] == 'system' for m in messages[1:]): return None
    return messages


def collect_sft(out, guard):
    accepted, excluded = [], []
    seen = set()
    sources = [('khtsly__Luau-Coder-1.0-Preview-SFT', 'train.parquet'),
               ('Pinkstack__LuauDev-instructions-SFT-preview', 'data.jsonl')]
    for dirname, filename in sources:
        directory = out / 'raw/hf' / dirname
        source = source_record(directory)
        for index, raw in enumerate(iter_rows(directory / filename)):
            if index % 512 == 0:
                print('sft_progress', dirname, index, 'kept', len(accepted), 'excluded', len(excluded), flush=True)
            prov = provenance(source, filename, index)
            conversation = normalize_conversation(raw)
            reason = None
            if conversation is None:
                reason = 'unsupported_or_invalid_conversation_schema'
                text = ''
            else:
                text = '\n'.join(m['content'] for m in conversation)
                if len(text) > MAX_CONVERSATION: reason = 'conversation_too_large'
                elif SECRET.search(text): reason = 'credential_pattern'
                elif guard.intersection(text_ngrams(text, 12)): reason = 'evaluation_question_overlap'
                elif not re.search(r'\b(Roblox|Luau|game:GetService|Instance\.new|ScriptService|DataStore)\b', text, re.I): reason = 'domain_not_established'
                elif digest(text) in seen: reason = 'exact_conversation_duplicate'
            if reason:
                excluded.append({'source': prov, 'reason': reason}); continue
            seen.add(digest(text))
            # Whole conversation is the unit: never split its turns into random splits.
            first_user = next(m['content'] for m in conversation if m['role'] == 'user')
            group = 'synthetic-question:' + digest(' '.join(words(first_user)))
            accepted.append({'id': digest(source['id'] + ':' + str(index) + ':' + text)[:24],
                'kind': 'synthetic_conversation', 'messages': conversation, 'provenance': prov,
                'group': group, 'split': split_for(group), 'topics': taxonomy(text),
                'rights': {'status': 'publisher_declaration_not_independent_rights_audit', 'declared_license': source['declared_license']},
                'validation': {'human_review': 'not_performed', 'engine_execution': 'not_run'},
                'transformations': ['reasoning_columns_not_imported', 'explicit_think_sections_removed'],
                'training_admission': 'candidate_only_requires_semantic_and_rights_review'})
    jsonl(out / 'staging/sft-records.jsonl', accepted)
    jsonl(out / 'audit/sft-normalization-exclusions.jsonl', excluded)
    save_json(out / 'audit/sft-normalization-counts.json', {'accepted_for_validation': len(accepted),
               'excluded': dict(collections.Counter(r['reason'] for r in excluded))})
    print('sft_normalized', len(accepted), 'excluded', len(excluded), flush=True)


def markdown_sections(text):
    """Nonoverlapping sections/paragraphs; never one row per line or paraphrase."""
    lines = text.splitlines()
    start, heading, fence, buffer = 1, '', False, []
    for no, line in enumerate(lines, 1):
        if re.match(r'^\s*```', line): fence = not fence
        if not fence and re.match(r'^#{1,4}\s', line) and buffer:
            content = '\n'.join(buffer).strip()
            if len(content) >= 100: yield start, no - 1, heading, content
            start, buffer, heading = no, [], re.sub(r'^#+\s*', '', line)
        if not fence and not line.strip() and sum(len(x) for x in buffer) > 6000:
            content = '\n'.join(buffer).strip()
            if content: yield start, no - 1, heading, content
            start, buffer = no + 1, []
        else:
            buffer.append(line)
    content = '\n'.join(buffer).strip()
    if len(content) >= 100: yield start, len(lines), heading, content


def build_knowledge(out):
    records, excluded = [], []
    seen = set()
    api = {'classes': {}, 'enums': {}, 'datatypes': {}, 'symbols': 0}
    def emit(text, source, path, unit, license_name, lines=None):
        if not isinstance(text, str) or len(text.strip()) < 60 or len(text) > 60000:
            excluded.append({'path': str(path), 'unit': unit, 'reason': 'empty_or_oversized_unit'}); return
        if SECRET.search(text):
            excluded.append({'path': str(path), 'unit': unit, 'reason': 'credential_pattern'}); return
        h = digest(text)
        if h in seen:
            excluded.append({'path': str(path), 'unit': unit, 'reason': 'duplicate_content'}); return
        seen.add(h)
        prov = provenance(source, path)
        if lines: prov.update({'start_line': lines[0], 'end_line': lines[1]})
        identity = source['id'] + ':' + str(path) + ':' + unit + ':' + str(lines) + ':' + h
        records.append({'id': digest(identity)[:24],
                        'kind': 'retrieval_reference', 'title': unit, 'text': text, 'provenance': prov,
                        'rights': {'spdx': license_name, 'attribution_required': True},
                        'split': 'reference', 'topics': taxonomy(text + ' ' + str(path)),
                        'content_sha256': h, 'training_admission': 'retrieval_only',
                        'validation': {'source_fidelity': 'extracted_from_pinned_source', 'runtime_validation': 'not_applicable'}})
    for name, license_name in [('Roblox__creator-docs', 'CC-BY-4.0'), ('luau-lang__site', 'MIT')]:
        directory = out / 'raw/github' / name
        source = source_record(directory)
        # Retain LICENSE-CODE in the same source/notice directory.
        extract_text_archive(directory / 'source.tar.gz', directory / 'text')
        for p in sorted((directory / 'text').rglob('*')):
            if not p.is_file(): continue
            rel = p.relative_to(directory / 'text')
            if name == 'Roblox__creator-docs' and not str(rel).startswith('content/en-us/'):
                continue
            if p.suffix in {'.yaml', '.yml'} and '/reference/engine/' in str(rel):
                try: data = yaml.safe_load(p.read_text())
                except yaml.YAMLError:
                    excluded.append({'path': str(rel), 'reason': 'yaml_parse_failure'}); continue
                if not isinstance(data, dict): continue
                entity = str(data.get('name', p.stem))
                if '/classes/' in str(rel): api['classes'][entity] = {'tags': data.get('tags', []), 'members': []}
                if '/enums/' in str(rel): api['enums'][entity] = []
                if '/datatypes/' in str(rel): api['datatypes'][entity] = []
                member_keys = {'properties', 'methods', 'events', 'callbacks', 'constructors', 'functions', 'constants', 'math_operations', 'items'}
                header = {k: v for k, v in data.items() if k not in member_keys}
                emit(yaml.safe_dump(header, sort_keys=False, allow_unicode=True), source, rel, entity, license_name)
                for kind in sorted(member_keys):
                    members = data.get(kind) or []
                    if not isinstance(members, list): continue
                    for i, member in enumerate(members):
                        if not isinstance(member, dict): continue
                        member_name = str(member.get('name', member.get('signature', kind + '_' + str(i))))
                        unit = entity + ':' + kind + ':' + member_name
                        content = yaml.safe_dump({'owner': entity, 'member_kind': kind, **member}, sort_keys=False, allow_unicode=True)
                        emit(content, source, rel, unit, license_name)
                        api['symbols'] += 1
                        if entity in api['classes']: api['classes'][entity]['members'].append(member_name)
                        if entity in api['enums']: api['enums'][entity].append(member_name.split('.')[-1])
                        if entity in api['datatypes']: api['datatypes'][entity].append(member_name)
            elif p.suffix in TEXT_EXTS:
                for lo, hi, heading, text in markdown_sections(p.read_text()):
                    emit(text, source, rel, heading or str(rel), license_name, (lo, hi))
    jsonl(out / 'release/knowledge/references.jsonl', records)
    jsonl(out / 'audit/knowledge-exclusions.jsonl', excluded)
    save_json(out / 'manifests/current-api.json', api)
    save_json(out / 'audit/knowledge-counts.json', {'records': len(records), 'classes': len(api['classes']),
               'enums': len(api['enums']), 'datatypes': len(api['datatypes']), 'member_symbols': api['symbols'],
               'exclusions': dict(collections.Counter(r['reason'] for r in excluded))})
    print('knowledge_records', len(records), 'api_classes', len(api['classes']), 'member_symbols', api['symbols'], flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--phase', choices=['all', 'hf-normalize', 'sft-normalize'], default='all')
    args = parser.parse_args()
    out = args.out.resolve()
    if (out / 'staging/normalization-complete.json').exists():
        raise SystemExit('Normalization already completed; use a new version instead of silently overwriting it.')
    guard, protected = make_guard(out)
    if args.phase == 'all':
        build_knowledge(out)
    # Independent HF-only continuation does not inspect local repository licences.
    # Existing reference output is preserved, not rebuilt or relabelled.
    if args.phase != 'sft-normalize':
        collect_code(out, guard, protected, include_existing=args.phase == 'all')
    elif not (out / 'staging/code-records.jsonl').is_file():
        raise SystemExit('Code normalization checkpoint is absent')
    collect_sft(out, guard)
    save_json(out / 'staging/normalization-complete.json', {'finished_at': now(),
               'builder_sha256': sha_file(Path(__file__)), 'raw_sample_manual_inspection': 'blocked_not_retried',
               'phase': args.phase, 'existing_repository_ingestion': args.phase == 'all',
               'code_executed': False, 'training_performed': False})


if __name__ == '__main__':
    main()
