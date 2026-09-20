#!/usr/bin/env python3
"""Static validation of research candidates. Never execute downloaded Luau.

No record becomes production-approved training data here. Compilation, known
anti-pattern checks, source-rights evidence, and runtime correctness are distinct.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from acquire import DEFAULT_OUT, ROOT, now, save_json, sha_file
from build import iter_rows, jsonl, digest, code_hash, lex, FENCE, MAX_CODE, split_for

HERE = Path(__file__).resolve().parent


def strict_rows(path):
    for row in iter_rows(path):
        if not isinstance(row, dict) or '_decode_error' in row:
            raise ValueError('Malformed JSONL record in ' + str(path))
        yield row


def compile_batch(codes, compiler):
    """Compile as data, no Luau interpreter or Studio. No diagnostics text leaves here."""
    if not codes:
        return []
    with tempfile.TemporaryDirectory(prefix='apple-luau-static-') as tmp:
        paths = []
        for i, code in enumerate(codes):
            path = Path(tmp) / ('%05d.luau' % i)
            path.write_text(code, encoding='utf-8')
            paths.append(str(path))
        try:
            result = subprocess.run([compiler, '--null', *paths], stdin=subprocess.DEVNULL,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                    timeout=30, check=False)
        except subprocess.TimeoutExpired:
            return [{'status': 'unverified', 'reason': 'compiler_timeout'} for _ in codes]
        except OSError:
            return [{'status': 'unverified', 'reason': 'compiler_unavailable'} for _ in codes]
        if result.returncode == 0:
            return [{'status': 'pass'} for _ in codes]
        diagnostic = result.stderr.decode('utf-8', errors='replace')
        # The documented CLI emits each filename and location for parse/compile errors.
        failed = {int(x) for x in re.findall(r'/([0-9]{5})\.luau\(\d+,\d+\): (?:SyntaxError|CompileError):', diagnostic)}
        if result.returncode != 1 or not failed:
            return [{'status': 'unverified', 'reason': 'compiler_failed_without_attributed_diagnostic'} for _ in codes]
        # When the batch contains an unexpected diagnostic, do not infer the other files passed.
        unexpected = [line for line in diagnostic.splitlines() if line.strip()
                      and not re.search(r'/[0-9]{5}\.luau\(\d+,\d+\): (?:SyntaxError|CompileError):', line)]
        if unexpected:
            return [{'status': 'unverified', 'reason': 'compiler_unattributed_diagnostic'} for _ in codes]
        return [{'status': 'fail', 'reason': 'syntax_or_compile_error'} if i in failed else {'status': 'pass'}
                for i in range(len(codes))]


def compiler_controls(compiler):
    inputs = ['return 7', 'local =', 'error("RUNTIME_SENTINEL_MUST_NOT_EXECUTE")',
              'export type Point = {x: number, y: number}\nreturn function(p: Point): number return p.x + p.y end']
    values = compile_batch(inputs, compiler)
    expected = ['pass', 'fail', 'pass', 'pass']
    if [v['status'] for v in values] != expected:
        raise RuntimeError('Compiler control failed: ' + json.dumps(values))
    return {'expected': expected, 'observed': values, 'executes_harvested_code': False,
            'compiler_sha256': sha_file(Path(compiler)), 'flags': ['--null']}


def analyze_batch(items):
    process = subprocess.run(['node', str(HERE / 'analyze.mjs')],
        input=''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in items),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        timeout=60, check=False)
    if process.returncode:
        raise RuntimeError('Static analyzer process failed; no candidates admitted')
    outputs = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
    if len(outputs) != len(items) or [r.get('id') for r in outputs] != [r['id'] for r in items]:
        raise RuntimeError('Static analyzer response association failed')
    return outputs


def api_review(result, api):
    """Only explicitly named classes/services/enum members; not full type checking."""
    unresolved = []
    for name in result.get('services', []) + result.get('classes', []):
        if name not in api['classes']:
            unresolved.append('class_or_service:' + name)
    for value in result.get('enums', []):
        enum, member = value.split('.', 1)
        if enum not in api['enums'] or member not in api['enums'][enum]:
            unresolved.append('enum_member:' + value)
    return sorted(set(unresolved))


def policy_flags(compiled, static, api):
    flags = []
    if compiled['status'] != 'pass': flags.append(compiled.get('reason', 'syntax_unverified'))
    if not static.get('available'): flags.append('static_analysis_unavailable')
    else:
        flags.extend(static.get('dangerous', []))
        if static.get('errors'): flags.append('known_antipattern_error')
        if static.get('unsupported_standard_lua'): flags.append('non_roblox_lua_environment')
        if static.get('stub_marker'): flags.append('stub_marker_requires_review')
        if api_review(static, api): flags.append('explicit_api_symbol_unresolved')
    return sorted(set(flags))


def code_blocks(messages):
    """Inspect assistant code, not intentionally broken user code in debugging requests."""
    blocks, unsupported, malformed = [], 0, False
    for index, m in enumerate(messages):
        if m['role'] != 'assistant': continue
        text = m['content']
        matches = list(FENCE.finditer(text))
        covered = ''.join(match.group(0) for match in matches)
        if text.count('```') != covered.count('```'):
            malformed = True
        for block, match in enumerate(matches):
            language = match.group(1).strip().lower()
            code = match.group(2)
            if language in {'lua', 'luau', 'roblox', 'lua roblox'}:
                blocks.append({'turn': index, 'block': block, 'code': code})
            elif language:
                unsupported += 1
    return blocks, unsupported, malformed


def batchwise(values, size):
    batch = []
    for value in values:
        batch.append(value)
        if len(batch) == size:
            yield batch
            batch = []
    if batch: yield batch


def protected_completion_hashes(out):
    protected = set()
    path = out / 'raw/hf/Roblox__luau_corpus/test.jsonl'
    for row in strict_rows(path):
        prefix, completion = row.get('prompt'), row.get('completion')
        if not isinstance(prefix, str) or not isinstance(completion, str):
            raise RuntimeError('Official holdout schema changed; fail closed')
        if completion.strip(): protected.add(code_hash(completion))
        if (prefix + completion).strip(): protected.add(code_hash(prefix + completion))
    if not protected: raise RuntimeError('Official holdout protection is empty')
    return protected


def sft_overlap_flags(blocks, protected):
    return ['official_evaluation_code_overlap'] if any(code_hash(b['code']) in protected for b in blocks) else []


def validate_code(out, compiler, api):
    target = out / 'staging/code-checked.jsonl'
    if target.exists():
        raise RuntimeError('Code validation exists; use another version or recorded checkpoint')
    counts, reasons = Counter(), Counter()
    with target.with_suffix('.jsonl.partial').open('w', encoding='utf-8') as f:
        for batch in batchwise(strict_rows(out / 'staging/code-records.jsonl'), 64):
            compiled = compile_batch([r['text'] for r in batch], compiler)
            static = analyze_batch([{'id': r['id'], 'code': r['text']} for r in batch])
            for row, c, s in zip(batch, compiled, static):
                flags = policy_flags(c, s, api)
                row['validation'].update({'compiler': c, 'static': s,
                     'explicit_api_unresolved': api_review(s, api), 'review_flags': flags,
                     'type_check': 'not_run', 'semantic_tests': 'not_run'})
                row['training_admission'] = 'candidate_only_requires_rights_context_semantic_review'
                row['static_filter'] = 'review' if flags else 'pass'
                counts[row['static_filter']] += 1
                counts['checked'] += 1
                reasons.update(flags)
                f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
            if counts['checked'] % 1024 == 0:
                print('code_checked', counts['checked'], 'static_pass', counts['pass'], flush=True)
    os.replace(target.with_suffix('.jsonl.partial'), target)
    save_json(out/'audit/code-validation-counts.json', {'counts': dict(counts), 'review_flags': dict(reasons),
              'output_sha256': sha_file(target), 'validator_sha256': sha_file(Path(__file__))})
    return counts


def validate_sft(out, compiler, api):
    target = out / 'staging/sft-checked.jsonl'
    if target.exists():
        raise RuntimeError('SFT validation exists; use another version or recorded checkpoint')
    counts, reasons = Counter(), Counter()
    protected = protected_completion_hashes(out)
    with target.with_suffix('.jsonl.partial').open('w', encoding='utf-8') as f:
        for batch in batchwise(strict_rows(out / 'staging/sft-records.jsonl'), 16):
            all_blocks, per_row = [], []
            for row in batch:
                blocks, unsupported, malformed = code_blocks(row['messages'])
                flags = sft_overlap_flags(blocks, protected)
                if not blocks: flags.append('no_verifiable_luau_block')
                if unsupported: flags.append('additional_language_blocks_not_checked')
                if malformed: flags.append('unclosed_or_unsupported_fence')
                if any(len(b['code']) > MAX_CODE for b in blocks):
                    flags.append('oversized_code_block'); blocks = []
                start = len(all_blocks)
                all_blocks.extend({'id': row['id'] + ':' + str(b['turn']) + ':' + str(b['block']), **b} for b in blocks)
                per_row.append((start, len(all_blocks), flags))
            compiled, static = [], []
            for chunk in batchwise(all_blocks, 64):
                compiled.extend(compile_batch([b['code'] for b in chunk], compiler))
                static.extend(analyze_batch(chunk))
            for row, (lo, hi, flags) in zip(batch, per_row):
                results = []
                for j in range(lo, hi):
                    block_flags = policy_flags(compiled[j], static[j], api)
                    flags.extend(block_flags)
                    results.append({'turn': all_blocks[j]['turn'], 'block': all_blocks[j]['block'],
                                    'code_sha256': digest(all_blocks[j]['code']),
                                    'normalized_sha256': code_hash(all_blocks[j]['code']),
                                    'compiler': compiled[j], 'static': static[j]})
                flags = sorted(set(flags))
                row['validation'].update({'code_blocks': results, 'review_flags': flags,
                     'type_check': 'not_run', 'semantic_tests': 'not_run',
                     'prose_accuracy': 'not_reviewed', 'all_assistant_luau_fences_checked': hi > lo})
                row['static_filter'] = 'review' if flags else 'pass'
                counts['checked'] += 1
                counts['code_blocks'] += hi - lo
                counts[row['static_filter']] += 1
                reasons.update(flags)
                f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
            if counts['checked'] % 128 == 0:
                print('sft_checked', counts['checked'], 'static_pass', counts['pass'], flush=True)
    os.replace(target.with_suffix('.jsonl.partial'), target)
    save_json(out/'audit/sft-validation-counts.json', {'counts': dict(counts), 'review_flags': dict(reasons),
              'official_test_code_hashes': len(protected),
              'output_sha256': sha_file(target), 'validator_sha256': sha_file(Path(__file__))})
    return counts


class Union:
    def __init__(self): self.parent = {}
    def find(self, x):
        self.parent.setdefault(x, x)
        path, current = [], x
        while self.parent[current] != current:
            path.append(current); current = self.parent[current]
        for item in path: self.parent[item] = current
        return current
    def merge(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b: self.parent[max(a, b)] = min(a, b)


def shingle_hashes(text):
    tokens = lex(text)
    return {hashlib.blake2b('\x1f'.join(tokens[i:i+5]).encode(), digest_size=8).digest()
            for i in range(max(0, len(tokens) - 4))}


def near_dedupe(rows, threshold=.90):
    """Exact Jaccard decision after bottom-eight shingle candidate retrieval.

    Candidate retrieval is bounded and heuristic, not an exhaustive all-pairs
    proof. All detected duplicate groups are unioned before splits are assigned.
    """
    buckets, exact, groups = defaultdict(list), {}, Union()
    keep, dropped, links, truncated = [], [], [], 0
    hashes = {}
    for row in rows:
        group = row['group']; groups.find(group)
        text = row.get('text') or '\n'.join(m['content'] for m in row['messages'] if m['role'] != 'system')
        full_hash = code_hash(text) if row['kind'] == 'source_code' else digest(text)
        duplicate = exact.get(full_hash)
        shingles = shingle_hashes(text)
        anchors = sorted(shingles)[:8]
        if duplicate is None and len(shingles) >= 32:
            candidates = set()
            for anchor in anchors:
                ids = buckets[anchor]
                if len(ids) > 96: truncated += 1
                candidates.update(ids[:96])
            for idx in sorted(candidates):
                other = hashes[idx]
                if min(len(other), len(shingles)) / max(len(other), len(shingles)) < threshold: continue
                similarity = len(shingles & other) / len(shingles | other)
                if similarity >= threshold:
                    duplicate = idx
                    links.append({'removed_id': row['id'], 'kept_id': keep[idx]['id'], 'jaccard': round(similarity, 6)})
                    break
        if duplicate is not None:
            groups.merge(group, keep[duplicate]['group'])
            dropped.append({'id': row['id'], 'kept_id': keep[duplicate]['id'], 'reason': 'exact_or_near_duplicate',
                            'provenance': row['provenance']})
        else:
            idx = len(keep); keep.append(row); hashes[idx] = shingles; exact[full_hash] = idx
            for anchor in anchors: buckets[anchor].append(idx)
    for row in keep:
        row['original_group'] = row['group']
        row['group'] = groups.find(row['group'])
        row['split'] = split_for(row['group'])
    return keep, dropped, {'method': 'bottom-eight token-5gram retrieval; full token-5gram Jaccard decision',
          'threshold': threshold, 'near_links': links, 'candidate_bucket_truncations': truncated,
          'limitation': 'Heuristic candidate generation can miss near duplicates; not a semantic equivalence proof.'}


def package_tracks(out):
    # One cross-track grouping pass is required before any split is written.
    from finalize import finalize
    finalize(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--phase', choices=['code', 'sft', 'package', 'all'], default='all')
    args = parser.parse_args(); out = args.out.resolve()
    required = out / ('staging/code-records.jsonl' if args.phase == 'code' else 'staging/normalization-complete.json')
    if not required.is_file():
        raise SystemExit('Normalization is incomplete')
    if args.phase == 'package':
        package_tracks(out); return
    compiler = shutil.which('luau-compile')
    if not compiler: raise SystemExit('No Luau compiler; no false syntax pass')
    controls = compiler_controls(compiler)
    save_json(out/'audit/compiler-controls.json', controls)
    api = json.loads((out/'manifests/current-api.json').read_text())
    if len(api['classes']) < 100 or not api['enums']:
        raise SystemExit('API reference index missing or unexpectedly empty')
    if args.phase in {'code', 'all'}: validate_code(out, compiler, api)
    if args.phase in {'sft', 'all'}: validate_sft(out, compiler, api)
    if args.phase == 'all': package_tracks(out)


if __name__ == '__main__':
    main()
