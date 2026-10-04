#!/usr/bin/env bash
# Runs once when the Codespace (or the prebuild) is created. Heavy, cacheable work only.
# No secrets are read or written here: nothing in this container needs one to install, typecheck,
# test or build the site.
set -euo pipefail

# Node 25 and later no longer bundle corepack, so install it, then let it provide the exact pnpm
# that package.json's "packageManager" field pins (pnpm@11.13.0 today). Reading the pin from the
# file means this script never needs editing when the version moves.
npm install -g corepack
corepack enable
pnpm --version

pnpm install --frozen-lockfile

# Chromium for the tests that decode real pixels and for `pnpm e2e`. Non-fatal: a missing browser
# fails those specific tests loudly later; it must not stop the Codespace from existing.
if ! { sudo -E env "PATH=$PATH" pnpm exec playwright install-deps chromium && pnpm exec playwright install chromium; }; then
  echo "WARNING: Chromium could not be installed. Pixel tests and \`pnpm e2e\` will fail until you run:" >&2
  echo "  sudo -E env \"PATH=\$PATH\" pnpm exec playwright install-deps chromium && pnpm exec playwright install chromium" >&2
fi
