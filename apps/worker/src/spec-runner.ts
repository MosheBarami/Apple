// RUN A SPEC AGAINST THE PROJECT'S OWN MODULES.
//
// `run_and_check` is the only verification this product has had, and its verdict is "nothing
// printed an error during a five-second server simulation". That catches a script that throws on
// require. It cannot catch a shop that debits the wrong amount, a save that does not round-trip, a
// cooldown that never expires, or a door that opens for a player without the key — every failure
// where the code runs perfectly and does the wrong thing. Those are most of them.
//
// This runs ASSERTIONS. Each case is a Luau function; a case that returns is a pass, a case that
// errors is a failure carrying the error text. The harness pcalls every case so one failure cannot
// hide the cases after it, and reports timings so a case that quietly takes a second is visible.
//
// SECURITY — the reason this file builds the source and does not let the model build it.
// `set_mood` and `add_effect` generate Luau from tables in this repository, so nothing the model
// writes ever becomes code. This tool is the opposite: the case bodies ARE model-authored Luau, the
// same trust level as `run_luau`. So the assembled source goes through `refuseLuauIngress` before it
// is sent, exactly as run_luau's does, and the caller in tools.ts must not skip it. A spec harness
// is a perfectly good place to hide `require(12345)`, and requiring project modules by path — which
// is the entire point of the tool — is legal, so the require rule is doing real work here rather
// than being incidental.
//
// PLATFORM LIMIT, stated rather than papered over: a plugin cannot start Play Solo, so there is no
// LocalPlayer and no client. These assertions run against server and shared modules in edit context.
// A spec that needs a real player is not something this tool can honestly run, and the tool
// description says so rather than letting the model discover it as a confusing error.

export interface SpecCase {
  name: string;
  /** Luau. Runs as a function body; `error(...)` or a failed `assert(...)` is the failure signal. */
  code: string;
}

export type SpecStatus = 'pass' | 'fail' | 'skip';

export interface SpecCaseResult {
  name: string;
  status: SpecStatus;
  message?: string;
  durationMs?: number;
}

export interface SpecRun {
  passed: number;
  failed: number;
  skipped: number;
  cases: SpecCaseResult[];
}

export const SPEC_LIMITS = {
  /** Cases per run. The whole harness is one run_code op under one timeout. */
  maxCases: 24,
  maxCodeChars: 4_000,
  maxNameChars: 120,
  /** Per-case error text kept. Truncated IN LUAU so a runaway message never crosses the wire. */
  maxMessageChars: 300,
} as const;

/** Why a case list cannot be run, or null when it can. */
export function refuseSpecCases(cases: unknown): string | null {
  if (!Array.isArray(cases) || cases.length === 0) {
    return 'cases must be a non-empty array of { name, code }';
  }
  if (cases.length > SPEC_LIMITS.maxCases) {
    return `at most ${SPEC_LIMITS.maxCases} cases per run; split the spec`;
  }
  const seen = new Set<string>();
  for (const [i, c] of cases.entries()) {
    if (!c || typeof c !== 'object') return `case ${i + 1} is not an object`;
    const { name, code } = c as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) return `case ${i + 1} has no name`;
    if (name.length > SPEC_LIMITS.maxNameChars) return `case ${i + 1}'s name is too long`;
    if (typeof code !== 'string' || !code.trim()) return `case "${name}" has no code`;
    if (code.length > SPEC_LIMITS.maxCodeChars) {
      return `case "${name}" is ${code.length} chars; keep a case under ${SPEC_LIMITS.maxCodeChars}`;
    }
    // Two cases with one name produce a report where a reader cannot tell which one failed.
    const key = name.trim();
    if (seen.has(key)) return `two cases are both named "${key}"`;
    seen.add(key);
  }
  return null;
}

/** A Luau double-quoted string literal. Used ONLY for case names, never for case bodies. */
function luauString(s: string): string {
  return JSON.stringify(s);
}

/**
 * The harness.
 *
 * Case bodies are inserted as CODE, which is the point of the tool and is why the assembled source
 * must be put through the ingress filter by the caller. Case NAMES are inserted as string literals,
 * so a name can never become code however it is spelled.
 */
export function specLuau(cases: SpecCase[]): string {
  const prelude = [
    'local __r = {}',
    'local function __esc(v)',
    '\tlocal s = tostring(v)',
    '\ts = string.gsub(s, "\\\\", "\\\\\\\\")',
    '\ts = string.gsub(s, \'"\', \'\\\\"\')',
    '\ts = string.gsub(s, "\\n", "\\\\n")',
    '\ts = string.gsub(s, "\\r", "\\\\r")',
    '\ts = string.gsub(s, "\\t", "\\\\t")',
    // Anything else below 0x20 would make the JSON unparseable on the far side, and a control byte
    // in a message is never information — it is a file or a buffer leaking into an error string.
    '\ts = string.gsub(s, "[\\1-\\8\\11\\12\\14-\\31]", " ")',
    '\treturn s',
    'end',
    'local function __case(name, fn)',
    '\tlocal t0 = os.clock()',
    '\tlocal ok, err = pcall(fn)',
    '\tlocal ms = math.floor((os.clock() - t0) * 1000 + 0.5)',
    `\tlocal msg = ok and "" or string.sub(tostring(err), 1, ${SPEC_LIMITS.maxMessageChars})`,
    '\t__r[#__r + 1] = \'{"name":"\' .. __esc(name) .. \'","status":"\' .. (ok and "pass" or "fail")',
    '\t\t.. \'","durationMs":\' .. tostring(ms)',
    '\t\t.. (ok and "" or (\',"message":"\' .. __esc(msg) .. \'"\')) .. "}"',
    'end',
  ];
  const body = cases.map(
    (c) => `__case(${luauString(c.name.trim())}, function()\n${c.code}\nend)`,
  );
  return [
    ...prelude,
    ...body,
    'return \'{"cases":[\' .. table.concat(__r, ",") .. \']}\'',
  ].join('\n');
}

/** Read the harness's output back. Mirrors build-audit.parseAudit's unwrapping. */
export function parseSpecRun(raw: unknown): SpecRun | null {
  let value: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('result' in o) { value = o.result; continue; }
    if ('t' in o && 'v' in o) { value = o.v; continue; }
    if ('data' in o) { value = o.data; continue; }
    break;
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const rows = (value as Record<string, unknown>).cases;
  if (!Array.isArray(rows)) return null;

  const cases: SpecCaseResult[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : null;
    const status = o.status === 'pass' || o.status === 'fail' || o.status === 'skip' ? o.status : null;
    if (!name || !status) continue;
    const c: SpecCaseResult = { name, status };
    if (typeof o.message === 'string' && o.message) c.message = o.message;
    if (Number.isFinite(o.durationMs)) c.durationMs = Number(o.durationMs);
    cases.push(c);
  }
  return {
    cases,
    passed: cases.filter((c) => c.status === 'pass').length,
    failed: cases.filter((c) => c.status === 'fail').length,
    skipped: cases.filter((c) => c.status === 'skip').length,
  };
}

/**
 * Cases that were sent but did not come back.
 *
 * A case whose body hard-crashes the whole chunk — a syntax error, or something pcall cannot catch —
 * never reaches `__r`, so the report would simply be shorter than the spec. Silently returning
 * "3 passed" for a four-case spec is the same defect as the critic reporting a lens it never ran, so
 * the missing ones are named and counted as failures rather than dropped.
 */
export function missingCases(sent: SpecCase[], run: SpecRun): string[] {
  const back = new Set(run.cases.map((c) => c.name));
  return sent.map((c) => c.name.trim()).filter((n) => !back.has(n));
}
