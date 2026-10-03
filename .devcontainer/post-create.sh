#!/usr/bin/env bash
# Smoke check after the container exists: are the tools there, and does the shared wire contract
# typecheck. It reports and never fails the Codespace; a red result here is information about the
# branch (main's CI is itself red on other jobs), not a broken container.
set -uo pipefail

echo "node   $(node --version)"
echo "pnpm   $(pnpm --version)"
echo "python $(python3 --version 2>&1)"
echo "luau   $(luau --version 2>&1 | head -1 || true)"
echo "rojo   $(rojo --version 2>&1 | head -1 || true)"

# A path filter, not a package name, so this survives the package-scope rename.
if pnpm --filter ./packages/shared typecheck; then
  echo "SMOKE OK: packages/shared typechecks."
else
  echo "SMOKE FAILED: packages/shared does not typecheck on this branch." >&2
fi

cat <<'EOF'

This container runs code, tests, typecheck and the site/web builds.
It cannot do live Studio work: Roblox Studio and the local library gateway
(127.0.0.1:63747) exist only on the owner's Mac.  See .devcontainer/README.md.
EOF
exit 0
