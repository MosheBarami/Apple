import json,sys,collections
S='/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/work'
iid=sys.argv[1]
rows={r['id']:r for r in json.load(open('/Users/moshe/Developer/RbxAI-ci/packages/evals/owner-bench/results/2026-10-04-selfcheck.json'))}
r=rows.get(iid,{})
print(f"== {iid} [{r.get('category')}] {r.get('total')}/18 credits {r.get('credits')} {r.get('seconds')}s :: {(r.get('turns') or [''])[0][:90]}")
print('   scores', r.get('scores'))
for c in (r.get('critique') or [])[:3]: print('   -', c[:170])
try: m=json.load(open(f'{S}/traces/{iid}.json'))
except Exception as e: print('   no trace', e); sys.exit()
tr=[t for x in m if x.get('toolTrace') for t in x['toolTrace']]
c=collections.Counter(t['tool'] for t in tr)
print(f"   steps {len(tr)} failed {sum(1 for t in tr if not t.get('ok'))} :: " + ', '.join(f'{k} {v}' for k,v in c.most_common(12)))
for t in tr:
    if not t.get('ok'): print('   ✗', t['tool'], (t.get('error') or t.get('summary') or '')[:200])
