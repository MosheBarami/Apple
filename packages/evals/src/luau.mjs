// Luau syntax checking via a local CLI. Verified on this machine (2026-08-30):
//   - `luau-lsp analyze --no-strict-dm-types <file>` works when invoked via the
//     real binary under ~/.rokit/tool-storage/johnnymorganz/luau-lsp/<ver>/luau-lsp.
//     The PATH shim (~/.rokit/bin/luau-lsp) refuses to run outside a rokit
//     manifest, so we probe candidates functionally instead of trusting PATH.
//   - Valid Roblox code still exits 1 with "TypeError: Unknown global 'game'"
//     (no definitions file loaded), so pass/fail keys on the presence of
//     "SyntaxError" in the output, not on the exit code.
//   - Fallback: homebrew `luau-analyze <file>` behaves identically.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const GOOD_PROBE = 'local x = 1\nprint(x)\n';
const BAD_PROBE = 'local x = 1\nif x then\n\tprint(x\nend\n';

function runChecker(candidate, file) {
  const args = [...candidate.args, file];
  const r = spawnSync(candidate.bin, args, { encoding: 'utf8', timeout: 20_000 });
  if (r.error) return { launched: false, output: String(r.error.message ?? r.error) };
  return { launched: true, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}`, status: r.status };
}

function hasSyntaxError(output) {
  return /SyntaxError/.test(output);
}

function rokitLuauLspCandidates() {
  const out = [];
  try {
    const base = join(homedir(), '.rokit', 'tool-storage', 'johnnymorganz', 'luau-lsp');
    const versions = readdirSync(base)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
      });
    for (const v of versions) {
      out.push({ name: `luau-lsp ${v} (rokit tool-storage)`, bin: join(base, v, 'luau-lsp'), args: ['analyze', '--no-strict-dm-types'] });
    }
  } catch {
    /* rokit not installed */
  }
  return out;
}

function candidates() {
  const list = [];
  if (process.env.LUAU_CHECK_BIN) {
    const bin = process.env.LUAU_CHECK_BIN;
    const isLsp = /luau-lsp/.test(bin);
    list.push({ name: `${bin} (env LUAU_CHECK_BIN)`, bin, args: isLsp ? ['analyze', '--no-strict-dm-types'] : [] });
  }
  list.push({ name: 'luau-lsp (PATH)', bin: 'luau-lsp', args: ['analyze', '--no-strict-dm-types'] });
  list.push(...rokitLuauLspCandidates());
  list.push({ name: 'luau-analyze (PATH)', bin: 'luau-analyze', args: [] });
  return list;
}

let resolved; // undefined = not probed yet; null = nothing usable

/**
 * Find a working Luau checker by functionally probing candidates: a candidate
 * qualifies only if it launches, reports no SyntaxError for a known-good file,
 * AND reports a SyntaxError for a known-bad file (proves detection works).
 */
export function resolveLuauChecker() {
  if (resolved !== undefined) return resolved;
  const dir = mkdtempSync(join(tmpdir(), 'golem-evals-probe-'));
  const good = join(dir, 'good.luau');
  const bad = join(dir, 'bad.luau');
  writeFileSync(good, GOOD_PROBE);
  writeFileSync(bad, BAD_PROBE);
  try {
    for (const cand of candidates()) {
      const g = runChecker(cand, good);
      if (!g.launched || hasSyntaxError(g.output) || /Failed to find tool/.test(g.output)) continue;
      const b = runChecker(cand, bad);
      if (!b.launched || !hasSyntaxError(b.output)) continue;
      resolved = cand;
      return resolved;
    }
    resolved = null;
    return resolved;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Check a Luau snippet for syntax errors.
 *
 * `unavailable: true` means THE CHECK DID NOT RUN, which is not the same fact as "the code is
 * broken" and must never be scored as one. Before this distinction existed, a machine with no
 * luau-lsp on it failed every `luau_syntax` check on every task, and the run reported that as
 * models writing unparseable Luau — a measurement of the machine printed as a measurement of
 * the model. `no code to check` and `checker failed to launch` stay ordinary failures: the first
 * is a real observation about the answer (it contained no code), and the second is a checker that
 * exists and broke on this input.
 *
 * @param {string} code
 * @param {{resolve?: () => object|null}} [opts] injectable resolver, so the absent-checker branch
 *   is reachable from a test on a machine where the checker IS installed.
 * @returns {{passed: boolean, detail: string, unavailable?: true, reason?: string}}
 */
export function checkLuauSyntax(code, opts = {}) {
  if (!code || !code.trim()) return { passed: false, detail: 'no code to check (no fenced code block found)' };
  const checker = (opts.resolve ?? resolveLuauChecker)();
  if (!checker) {
    return {
      passed: false,
      unavailable: true,
      reason: 'luau_checker_absent',
      detail: 'no working Luau checker found (tried luau-lsp, luau-analyze); set LUAU_CHECK_BIN',
    };
  }
  const dir = mkdtempSync(join(tmpdir(), 'golem-evals-luau-'));
  const file = join(dir, 'snippet.luau');
  try {
    writeFileSync(file, code.endsWith('\n') ? code : code + '\n');
    const r = runChecker(checker, file);
    if (!r.launched) return { passed: false, detail: `checker failed to launch: ${r.output.slice(0, 200)}` };
    if (hasSyntaxError(r.output)) {
      const line = r.output.split('\n').find((l) => /SyntaxError/.test(l)) ?? 'SyntaxError';
      return { passed: false, detail: line.trim().slice(0, 240) };
    }
    return { passed: true, detail: `no syntax errors (${checker.name})` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
