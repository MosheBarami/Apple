#!/bin/zsh
cd /Users/moshe/Developer/RbxAI-rename
L=$1; : > $L.summary
step() { local name=$1; shift; local out=$L.$(echo $name | tr -c 'a-zA-Z0-9' '_').log; eval "$@" > $out 2>&1; local rc=$?; echo "[$rc] $name" >> $L.summary; }
step typecheck "pnpm -r typecheck"
step site-build "pnpm --filter @apple/site build"
step web-build "pnpm --filter @apple/web build"
step tests "pnpm -r --no-bail test"
step root-tests "node --test tests/*.test.mjs"
step ledger "node scripts/gate-check.mjs --lint"
for s in check-site-links check-credit-figures check-site-semantics check-dispositions check-app-bundle check-landing-budget check-asset-wall check-workspace-coverage check-ci-references; do step $s "node scripts/$s.mjs"; done
step rebrand "node scripts/check-rebrand.mjs --offline"
step evals-check "pnpm --filter @apple/evals check"
step secret-tests "python3 scripts/test_secret_scan.py"
step plugin-build "node apps/apple-plugin/scripts/build.mjs"
step e2e "pnpm exec playwright test --reporter=line"
step no-golem "node scripts/check-no-golem.mjs"
step secret-scan "python3 scripts/secret-scan.py"
echo DONE >> $L.summary
