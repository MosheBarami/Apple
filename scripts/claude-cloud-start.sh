#!/usr/bin/env bash
# Install project dependencies when a Claude Code cloud session starts.
set -u
set -o pipefail

say() { printf '[studpilot-cloud] %s\n' "$*"; }
warn() { printf '[studpilot-cloud] WARNING: %s\n' "$*" >&2; }

[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || exit 0

repo="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$repo" || ! -f "$repo/package.json" || ! -f "$repo/pnpm-lock.yaml" ]]; then
  warn "Repository root not found; skipping project install."
  exit 0
fi

if [[ -r /opt/studpilot-cloud/env.sh ]]; then
  source /opt/studpilot-cloud/env.sh
  if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
    printf '%s\n' 'source /opt/studpilot-cloud/env.sh' >> "$CLAUDE_ENV_FILE" ||
      warn "Could not persist PATH for later Bash commands."
  fi
fi

cd "$repo" || exit 0
if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm unavailable; check the cloud setup log."
  exit 0
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" != 24 ]]; then
  warn "Node 24 is not active; some CI checks may fail."
fi

say "Installing the committed pnpm workspace..."
if ! pnpm install --frozen-lockfile --prefer-offline; then
  warn "Workspace install failed; Claude can inspect and repair it in this session."
  exit 0
fi

if [[ -f playwright.config.ts || -f playwright.config.js ]]; then
  if [[ -f /opt/studpilot-cloud/playwright-deps-ok ]]; then
    pnpm exec playwright install chromium ||
      warn "Chromium download failed."
  elif [[ "$(id -u)" -eq 0 ]] ||
       (command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1); then
    pnpm exec playwright install --with-deps chromium ||
      warn "Playwright browser or OS dependencies were not fully installed."
  else
    pnpm exec playwright install chromium ||
      warn "Chromium download failed."
    warn "Playwright OS dependencies may still be missing."
  fi
fi

say "Project checkout is ready: $repo"
exit 0
