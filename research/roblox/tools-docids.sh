#!/bin/zsh
# usage: docids.sh '%pattern%' ...  -> first vecId per matching creator-docs URL
cd /Users/moshe/Developer/RbxAI-ci/apps/worker
w=""; for p in "$@"; do w="$w${w:+ or }url like '$p'"; done
./node_modules/.bin/wrangler d1 execute golem-corpus --remote --json --config wrangler.apple.jsonc --command "select min(vec_id) v, url, min(title) t from chunks where ($w) group by url order by url limit 120" 2>/dev/null | python3 -c "import json,sys;[print(r['v'],r['url'],r['t'][:50]) for r in json.load(sys.stdin)[0]['results']]"
