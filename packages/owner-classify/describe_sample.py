"""Model-filled fields (a natural description and synonym/hypernym tags) on a SMALL stratified sample, to measure time and tokens
before anyone approves a full run. Free and local only: no hosted model is ever called from here.

    python3 describe_sample.py [--dir owner-classify] [--n 300] [--dry]                  # build the prompts, count tokens, write nothing paid
    python3 describe_sample.py --backend ollama --model <name> [--n 300]                   # a local Ollama server on 127.0.0.1:11434

--dry (the default when no backend is given) writes <dir>/describe-sample.jsonl with the prompts only, and prints measured prompt
sizes (words, and BERT word-pieces as a stand-in for a real model tokenizer: the true count differs by tokenizer, usually
within +-25%) and the full-run estimate formula. With --backend ollama it also generates, records seconds per item and output
tokens (from Ollama's own eval_count), and the agreement of the model's subtype with the deterministic one when it states one.

Nothing in the repo downloads a model. Today the machine has no generative model (Ollama is installed, no weights), so only
--dry has been run; see the report for the numbers.
"""
import argparse
import collections
import json
import os
import random
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')

SYSTEM = ('You write search metadata for a library of Roblox assets. Answer with JSON only: '
          '{"description": "<one plain sentence, at most 150 characters, what the thing is and looks like>", '
          '"tags": ["<6-10 lowercase words: what it is, synonyms, broader category, style, mood>"], "subtype": "<one word>"}')


def prompt_for(r):
    c = r.get('colour')
    bits = ['name: ' + (r['name'] or r['name_clean']), 'type: ' + r['type']]
    if r.get('subtype') and r['subtype'] != 'other':
        bits.append('guessed kind: ' + r['subtype'])
    if r.get('context'):
        bits.append('folder: ' + r['context'])
    if r.get('contains'):
        bits.append('contains: ' + ', '.join(r['contains'][:8]))
    if c:
        bits.append('colours: ' + ', '.join(t['name'] for t in c['top']))
    if r['size'].get('cls'):
        bits.append('size: ' + r['size']['cls'])
    bits.append('from the game: ' + (r['provenance'].get('game') or '?'))
    if r.get('game_tags'):
        bits.append('game theme: ' + ', '.join(r['game_tags'][:4]))
    return '\n'.join(bits)


def stratified(items, n, seed=11):
    """n items spread over types in proportion to a square-root of the type's size (so small types still appear), generic-name items oversampled."""
    rng = random.Random(seed)
    by = collections.defaultdict(list)
    for r in items:
        if r['type'] in ('media-pack',):
            continue
        by[r['type']].append(r)
    weights = {t: len(v) ** 0.5 for t, v in by.items()}
    total = sum(weights.values())
    out = []
    for t, v in by.items():
        k = max(1, round(n * weights[t] / total))
        generic = [r for r in v if r['quality']['reasons'] and 'generic name' in r['quality']['reasons']]
        pick = rng.sample(generic, min(len(generic), max(1, k // 4)))
        rest = [r for r in v if r not in pick]
        pick += rng.sample(rest, min(len(rest), k - len(pick)))
        out += pick
    rng.shuffle(out)
    return out[:n]


def wordpieces(texts):
    try:
        from transformers import BertTokenizerFast
        import embed
        d = embed.model_dir()
        tok = BertTokenizerFast(vocab_file=os.path.join(d, 'vocab.txt'), do_lower_case=True)
        return [len(tok(t)['input_ids']) for t in texts]
    except Exception:
        return None


def ollama(model, system, prompt, host='http://127.0.0.1:11434'):
    body = json.dumps(dict(model=model, system=system, prompt=prompt, stream=False, format='json', options=dict(temperature=0.2, num_predict=160))).encode()
    req = urllib.request.Request(host + '/api/generate', body, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=DEFAULT_DIR)
    ap.add_argument('--n', type=int, default=300)
    ap.add_argument('--backend', choices=['ollama'])
    ap.add_argument('--model')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args(argv)
    sys.path.insert(0, HERE)
    items = [json.loads(l) for l in open(os.path.join(a.dir, 'items.jsonl'))]
    sample = stratified(items, a.n)
    prompts = [SYSTEM + '\n' + prompt_for(r) for r in sample]
    words = [len(p.split()) for p in prompts]
    pieces = wordpieces(prompts)
    rep = dict(n=len(sample), by_type=dict(collections.Counter(r['type'] for r in sample)), prompt_words_mean=round(sum(words) / len(words), 1),
               prompt_wordpieces_mean=round(sum(pieces) / len(pieces), 1) if pieces else None)
    out = []
    if a.backend == 'ollama' and not a.dry:
        if not a.model:
            sys.exit('--model is required with --backend ollama')
        secs, toks, agree, stated = [], [], 0, 0
        for r, p in zip(sample, prompts):
            t0 = time.time()
            try:
                resp = ollama(a.model, SYSTEM, prompt_for(r))
            except Exception as e:
                sys.exit('ollama not reachable or model missing: %s' % e)
            secs.append(time.time() - t0)
            toks.append(resp.get('eval_count', 0))
            try:
                j = json.loads(resp['response'])
            except ValueError:
                j = {}
            if j.get('subtype') and r.get('subtype') not in (None, 'other'):
                stated += 1
                agree += j['subtype'].lower() == r['subtype']
            out.append(dict(id=r['id'], prompt=prompt_for(r), model=j, seconds=round(secs[-1], 2), out_tokens=toks[-1]))
        rep.update(seconds_per_item=round(sum(secs) / len(secs), 2), out_tokens_mean=round(sum(toks) / len(toks), 1), subtype_agreement=(agree, stated))
    else:
        out = [dict(id=r['id'], prompt=prompt_for(r)) for r in sample]
        rep['note'] = 'dry run: prompts only, no model called'
    with open(os.path.join(a.dir, 'describe-sample.jsonl'), 'w') as f:
        for o in out:
            f.write(json.dumps(o, ensure_ascii=False) + '\n')
    n_items = len({r['id'] for r in items if r['type'] != 'media-pack'})
    in_tok = (rep['prompt_wordpieces_mean'] or rep['prompt_words_mean'] * 1.4)
    rep['full_run'] = dict(items=n_items, input_tokens_M=round(n_items * in_tok / 1e6, 2), output_tokens_M_at_70=round(n_items * 70 / 1e6, 2),
                           cost_formula='input_tokens_M * price_in_per_M + output_tokens_M * price_out_per_M (prices not looked up here)')
    print(json.dumps(rep, indent=1))


if __name__ == '__main__':
    main()
