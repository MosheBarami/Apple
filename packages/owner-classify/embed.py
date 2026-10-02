"""Optional dense tier (T2): sentence embeddings so a request is matched by meaning ("a tropical bird with a giant beak" ->
a toucan) and not only by shared words.

The model is all-MiniLM-L6-v2 (22M parameters, Apache-2.0), read in place from the int8 ONNX export that already ships inside
the Continue VS Code extension on this machine (nothing downloaded, nothing copied into the repo; override with
APPLE_EMBED_MODEL=<dir holding onnx/model_quantized.onnx, vocab.txt, tokenizer.json, config.json>). onnx_weights.py reads the
weights without onnxruntime and dequantises them into a torch BertModel. Needs torch + numpy, which the gateway's own Python
(system 3.9, no numpy) does not have, so queries are answered by a small resident helper process (`embed.py serve`) that
the gateway starts lazily and that search.py talks to through `client()`. If anything is missing the dense tier simply is not used.

    python3 embed.py build --dir owner-classify       # embeds every item (items.jsonl order == items.rowid-1) -> dense.f16.npy
    python3 embed.py serve --dir owner-classify       # JSON lines on stdin: {"q": "...", "k": 300}
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DEFAULT_DIR = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')


def model_dir():
    env = os.environ.get('APPLE_EMBED_MODEL')
    if env:
        return env
    hits = sorted(glob.glob(os.path.expanduser('~/.vscode/extensions/continue.continue-*/models/all-MiniLM-L6-v2')))
    return hits[-1] if hits else None


def doc_text(r):
    """What an item is, in the words a person would use for it: its name, kind, folder and what it contains. The template
    description (sizes, part counts) is left out: it says nothing about meaning."""
    bits = [r.get('name_clean') or r['name']]
    kind = ' '.join(x for x in (r.get('subtype') if r.get('subtype') not in (None, 'other') else None, r['type']) if x)
    bits.append(kind)
    if r.get('context'):
        bits.append(r['context'])
    tags = [t for t in (r.get('tags') or []) if t not in (r['type'], r.get('subtype'))][:8]
    if tags:
        bits.append(' '.join(tags))
    if r.get('contains'):
        bits.append('has ' + ' '.join(r['contains'][:6]))
    if r['type'] in ('map', 'system') and r.get('description'):
        bits.append(r['description'])
    if r['type'] == 'ui-screen' and r['composition'].get('texts'):
        bits.append(' '.join(r['composition']['texts'][:4]))
    return '. '.join(b for b in bits if b)[:300]


class Encoder:
    def __init__(self, src=None):
        import numpy as np
        import torch
        from transformers import BertConfig, BertModel, BertTokenizerFast
        import onnx_weights as O
        src = src or model_dir()
        if not src or not os.path.exists(os.path.join(src, 'onnx', 'model_quantized.onnx')):
            raise FileNotFoundError('no MiniLM model found (set APPLE_EMBED_MODEL)')
        inits, nodes = O.read_graph(os.path.join(src, 'onnx', 'model_quantized.onnx'))
        sd = {}
        for k, a in inits.items():
            if a.dtype == np.float32 and 'MatMul' not in k and not k.endswith(('_scale',)):
                sd[k] = torch.from_numpy(a.copy())
        for emb in ('word_embeddings', 'token_type_embeddings', 'position_embeddings'):
            base = 'embeddings.%s.weight' % emb
            q = inits[base + '_quantized'].astype(np.float32)
            sd[base] = torch.from_numpy((q - float(inits[base + '_zero_point'])) * float(inits[base + '_scale']))
        for nd in nodes:
            if nd['op'] == 'MatMulInteger':
                wq = nd['inputs'][1]
                stem = wq[:-len('_quantized')]
                w = (inits[wq].astype(np.float32) - inits[stem + '_zero_point'].astype(np.float32)[None, :]) * inits[stem + '_scale'][None, :]
                mod = nd['name'][1:-len('/MatMul_quant')].replace('/', '.')  # encoder.layer.0.attention.self.query
                sd[mod + '.weight'] = torch.from_numpy(np.ascontiguousarray(w.T))
        cfg = BertConfig.from_json_file(os.path.join(src, 'config.json'))
        self.model = BertModel(cfg, add_pooling_layer=False)
        sd.pop('embeddings.position_ids', None)
        missing, unexpected = self.model.load_state_dict(sd, strict=False)
        missing = [m for m in missing if 'position_ids' not in m]
        if missing or unexpected:
            raise RuntimeError('weights do not fit: missing %s unexpected %s' % (missing[:4], unexpected[:4]))
        self.torch = torch
        self.device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        self.model.eval().to(self.device)
        self.tok = BertTokenizerFast(vocab_file=os.path.join(src, 'vocab.txt'), do_lower_case=True)

    def encode(self, texts, batch=128):
        import numpy as np
        torch = self.torch
        out = []
        order = sorted(range(len(texts)), key=lambda i: len(texts[i]))  # similar lengths together: less padding
        res = [None] * len(texts)
        for a in range(0, len(order), batch):
            idx = order[a:a + batch]
            enc = self.tok([texts[i] for i in idx], padding=True, truncation=True, max_length=96, return_tensors='pt').to(self.device)
            with torch.no_grad():
                h = self.model(**enc).last_hidden_state
            m = enc['attention_mask'].unsqueeze(-1).to(h.dtype)
            v = (h * m).sum(1) / m.sum(1).clamp(min=1)
            v = torch.nn.functional.normalize(v, dim=1).float().cpu().numpy()
            for j, i in enumerate(idx):
                res[i] = v[j]
        return np.stack(res)


def _vocab(d):
    import sqlite3
    p = os.path.join(d, 'find.sqlite')
    if not os.path.exists(p):
        return []
    db = sqlite3.connect('file:%s?mode=ro' % p, uri=True)
    return [r[0] for r in db.execute('SELECT term FROM words WHERE length(term)>=3 ORDER BY term')]


def build(d, limit=None):
    import numpy as np
    enc = Encoder()
    texts = []
    with open(os.path.join(d, 'items.jsonl')) as f:
        for line in f:
            texts.append(doc_text(json.loads(line)))
            if limit and len(texts) >= limit:
                break
    t0 = time.time()
    vecs = enc.encode(texts)
    dt = time.time() - t0
    np.save(os.path.join(d, 'dense.f16.npy'), vecs.astype(np.float16))
    words = _vocab(d)
    if words:
        wv = enc.encode(words, batch=512)
        np.save(os.path.join(d, 'dense.words.f16.npy'), wv.astype(np.float16))
        json.dump(words, open(os.path.join(d, 'dense.words.json'), 'w'))
    json.dump(dict(model='all-MiniLM-L6-v2 (int8 ONNX dequantised)', source=model_dir(), docs=len(texts), seconds=round(dt, 1), device=enc.device),
              open(os.path.join(d, 'dense.meta.json'), 'w'))
    print('embedded %d docs in %.0fs on %s' % (len(texts), dt, enc.device))


def serve(d):
    import numpy as np
    enc = Encoder()
    mat = np.load(os.path.join(d, 'dense.f16.npy')).astype(np.float32)
    wp = os.path.join(d, 'dense.words.f16.npy')
    wmat = np.load(wp).astype(np.float32) if os.path.exists(wp) else None
    words = json.load(open(os.path.join(d, 'dense.words.json'))) if wmat is not None else []
    cache = {}
    for line in sys.stdin:
        try:
            req = json.loads(line)
            if 'ids' in req:  # cosines for given rowids (the query vector is cached from the call that came before)
                qv = cache.get(req['q'])
                if qv is None:
                    qv = cache[req['q']] = enc.encode([req['q']])[0]
                ids = np.array(req['ids'], dtype=np.int64) - 1
                resp = dict(scores={int(i) + 1: round(float(s), 4) for i, s in zip(ids, mat[ids] @ qv)})
                sys.stdout.write(json.dumps(resp) + '\n')
                sys.stdout.flush()
                continue
            terms = [t for t in req.get('terms', [])][:12]
            vecs = enc.encode([req['q']] + terms)
            if len(cache) > 64:
                cache.clear()
            cache[req['q']] = vecs[0]
            sims = mat @ vecs[0]
            k = min(int(req.get('k', 300)), len(sims))
            top = np.argpartition(-sims, k - 1)[:k]
            top = top[np.argsort(-sims[top])]
            resp = dict(docs=[[int(i) + 1, round(float(sims[i]), 4)] for i in top], terms={})  # rowid = index + 1
            for t, v in zip(terms, vecs[1:]):
                if wmat is None:
                    break
                ws = wmat @ v
                nn = np.argsort(-ws)[:int(req.get('nn', 5))]
                resp['terms'][t] = [[words[i], round(float(ws[i]), 3)] for i in nn if words[i] != t]
        except Exception as e:  # keep the helper alive
            resp = {'error': str(e)}
        sys.stdout.write(json.dumps(resp) + '\n')
        sys.stdout.flush()


class Client:
    """Talks to a resident `embed.py serve` process; starts it on first use.
    search(q, k, terms) -> ([(rowid, cosine)] best first, {term: [(vocabulary word, cosine)]})."""

    def __init__(self, d, python=None, startup_s=60):
        self.dir, self.python, self.startup_s = d, python, startup_s
        self.proc = None
        self.lock = threading.Lock()
        self.failed = None

    def _python(self):
        cands = [self.python, os.environ.get('APPLE_EMBED_PYTHON'), sys.executable, '/Library/Frameworks/Python.framework/Versions/3.9/bin/python3',
                 '/opt/homebrew/bin/python3', '/usr/local/bin/python3']
        for c in cands:
            if c and os.path.exists(c):
                r = subprocess.run([c, '-c', 'import torch, numpy, transformers'], capture_output=True)
                if r.returncode == 0:
                    return c
        raise RuntimeError('no Python with torch + numpy + transformers found (set APPLE_EMBED_PYTHON)')

    def _start(self):
        self.proc = subprocess.Popen([self._python(), os.path.join(HERE, 'embed.py'), 'serve', '--dir', self.dir], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)

    def search(self, q, k=300, terms=()):
        if self.failed and time.time() - self.failed < 300:
            raise RuntimeError('dense helper unavailable')
        with self.lock:
            try:
                if self.proc is None or self.proc.poll() is not None:
                    self._start()
                self.proc.stdin.write(json.dumps(dict(q=q, k=k, terms=list(terms))) + '\n')
                self.proc.stdin.flush()
                resp = json.loads(self.proc.stdout.readline())
            except Exception:
                self.failed = time.time()
                raise
        if 'error' in resp:
            raise RuntimeError(resp['error'])
        return [(r, c) for r, c in resp['docs']], resp['terms']

    def score(self, q, ids):
        """{rowid: cosine} for the given rowids (after search() for the same q)."""
        if not ids:
            return {}
        with self.lock:
            self.proc.stdin.write(json.dumps(dict(q=q, ids=list(ids))) + '\n')
            self.proc.stdin.flush()
            resp = json.loads(self.proc.stdout.readline())
        if 'error' in resp:
            raise RuntimeError(resp['error'])
        return {int(k): v for k, v in resp['scores'].items()}

    def close(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


def client(d):
    """A Client when the sidecar has dense vectors, else None (the finder then runs lexical + facets only)."""
    return Client(d) if os.path.exists(os.path.join(d, 'dense.f16.npy')) else None


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['build', 'serve', 'check'])
    ap.add_argument('--dir', default=DEFAULT_DIR)
    ap.add_argument('--limit', type=int)
    a = ap.parse_args()
    if a.cmd == 'build':
        build(a.dir, a.limit)
    elif a.cmd == 'serve':
        serve(a.dir)
    else:
        e = Encoder()
        import numpy as np
        qs = ['a tropical bird with a giant beak', 'toucan', 'table', 'a boat with a paddle wheel', 'paddleboat', 'hippopotamus', 'hippo']
        v = e.encode(qs)
        print(np.round(v @ v.T, 2))
