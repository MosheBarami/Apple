// Agent tool definitions + dispatcher. Tools either talk to Studio (via the session DO's
// op queue) or run worker-side (docs search, memory, checkpoints).
import type { Env } from './env';
import { rgbBase64ToDataUrl } from './png';
import type { GatewayToolDef, StudioOp, OpResult, CheckpointMeta, RenderViewResult, StudioFrame } from '@golem/shared';
import { RENDER_VIEWS } from '@golem/shared';
import { searchDocs } from './rag';
import { critiqueViews, critiqueToText, type VisualCritique } from './vision';
import {
  chooseAssetSource,
  verifyCreatorStoreAsset,
  findVerifiedAssets,
  scanInsertedHierarchy,
  summariseTree,
  ACCEPTABLE_ASSET_TYPES,
  SCAN_LIMITS,
  type AssetNeed,
  type AssetKind,
  type AssetProvenanceSource,
  type AssetVerdict,
  type FetchLike,
  type HttpResponseLike,
  type ScannedScriptInput,
} from './assets';
import { searchAssetLibrary } from './asset-library';
import { CENSUS_LUAU, parseCensus, destructiveDelta, needsProtection } from './playtest';
import { countConsole, parseLogEntries } from './playtest-stream';
import { PLAYTEST_FRAME_MIN_INTERVAL_MS } from './frame-bus';
import { compositionHardFails, structureFromLayout, structureLine, LAYOUT_LUAU, parseLayout } from './composition';
import { semanticCheck, semanticLine } from './semantic';
import { generateImage, storeImage, type ImageRequest, type PaletteRole } from './imagegen';
import { ensureProvenanceTables, recordAssetUse } from './provenance';
import { formatPanelReport, runCriticPanel } from './critic';
import { criticInputFromRender } from './critic-input';

export interface AgentCtx {
  env: Env;
  /**
   * The project these tools are acting on, when there is one.
   *
   * Optional because two callers genuinely have no project: the eval harness and the
   * admin `/run-tool` route build an AgentCtx directly to exercise a tool in isolation.
   * Attribution is recorded per project, so those callers record nothing — there is
   * nothing to attribute it to, which is different from failing to record it.
   */
  projectId?: string;
  studioConnected(): boolean;
  execStudioOp(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  createCheckpoint(label: string, kind: 'auto' | 'manual' | 'pre_agent'): Promise<CheckpointMeta | { error: string }>;
  /** Roll the place back to a checkpoint. Optional so an older caller still satisfies this type. */
  restoreCheckpoint?(id: string): Promise<{ ok: boolean; error?: string }>;
  addMemoryFact(fact: string): Promise<void>;
  /**
   * Forward a rasterised frame to the browser.
   *
   * Optional so an older caller still satisfies this type, and separate from
   * the tool result on purpose: pixels must reach the USER without ever
   * entering the model's transcript, where they would cost a fortune in
   * tokens and tell it nothing it did not already get from the metadata.
   */
  emitFrame?(frame: StudioFrame): void;
  /**
   * The live playtest channel, when the caller provides one.
   *
   * Optional for the same reason everything else here is: the eval harness and
   * the admin `run-tool` route build an AgentCtx directly, and a playtest they
   * cannot watch should still RUN — the safety behaviour in run_and_check is
   * the part that must never be conditional. Without this the tool does
   * everything it always did and simply streams nothing.
   */
  playtest?: PlaytestBus;
  /** last render/critique produced this run, so the loop can escalate reasoning on a failure */
  lastRender?: RenderViewResult;
  lastCritique?: VisualCritique;
  /**
   * A payload for the BROWSER only, never for the model.
   *
   * `detailForUi` derives the UI payload from the model-facing result, which is why the visual
   * tools could never show anything: their result is deliberately image-free, because tool results
   * are re-sent to the model on every later step and a frame is ~207KB of base64 RGB. The pixels
   * therefore stayed in `lastRender` on the server and the user never saw what the critic saw —
   * a verification step whose evidence is invisible is indistinguishable from one that did not run.
   *
   * A tool sets this when it has something to SHOW that must not be something to READ. `runTool`
   * prefers it over the derived detail, so the two payloads can differ by construction rather than
   * by a size cap accidentally dropping one of them.
   */
  uiDetail?: unknown;
  /**
   * Asset ids that came out of a verified search in THIS session.
   *
   * Membership records PROVENANCE and nothing else — not permission, and not a skip. It used to
   * double as a skip (an id in this set went to Studio without ever being resolved), which meant
   * one bad row in the curated library could put an unverified Model into a customer's place.
   *
   * Nor is it an admission list: an id that is NOT here is not refused, it is simply the weakest
   * provenance and waives nothing. Refusing it would need evidence this worker does not have —
   * see the note at the provenance computation in `insert_asset`.
   */
  discoveredAssetIds?: Set<number>;
  /**
   * The subset of the above that came out of `asset_library` rather than the Creator Store.
   *
   * Held separately because it changes which assertions may be waived (see `securityBlockers`),
   * never whether the gate runs.
   */
  libraryAssetIds?: Set<number>;
}

/**
 * What run_and_check needs in order to be watchable, and nothing more.
 *
 * Every method is a REPORT of something that already happened, never a request
 * to make something happen. `begin` is called after the checkpoint is taken,
 * `phase` after the transition, `captureFrame` returns whether a frame was
 * actually delivered. The tool cannot use this interface to tell the card a
 * story that differs from what it did.
 */
export interface PlaytestBus {
  /** A playtest has started. Returns its id. */
  begin(opts: { requestedSeconds: number; action: string }): string;
  /** Report the current phase and what is being done. */
  phase(phase: 'preparing' | 'running' | 'stopping' | 'finished' | 'failed', action: string, error?: string): void;
  /** Replace the console counts from a fresh log window. */
  console(errors: number, warnings: number): void;
  /**
   * Ask Studio for one frame and forward it if it arrives.
   * Resolves false when the rate gate, the budget or the plugin declined —
   * which the caller records as a drop rather than retrying immediately.
   */
  captureFrame(): Promise<boolean>;
  /** Whether the capture budget and rate gate would allow another frame now. */
  canCapture(): boolean;
}

const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({
  type: 'object',
  properties: props,
  required,
});

interface ToolImpl {
  def: GatewayToolDef;
  studio: boolean; // requires studio connection
  run(ctx: AgentCtx, args: Record<string, unknown>): Promise<unknown>;
}

const MAX_RESULT_CHARS = 3000; // tool output is re-sent every later step, so keep it tight

async function op(ctx: AgentCtx, studioOp: StudioOp, timeoutMs = 30_000): Promise<unknown> {
  const res = await ctx.execStudioOp(studioOp, timeoutMs);
  if (!res.ok) return { error: res.error ?? 'operation failed' };
  return res.data ?? { ok: true };
}

/**
 * Ask the plugin to rasterise the scene. Rendering five views of a busy place is real CPU work
 * inside Studio, so this gets a longer timeout than an ordinary op.
 */
async function renderViews(ctx: AgentCtx, target: string | undefined, view: string): Promise<RenderViewResult | { error: string }> {
  const res = await ctx.execStudioOp(
    { op: 'render_view', target, view: view as RenderViewResult['views'][number]['name'] | 'all' },
    view === 'all' ? 90_000 : 45_000,
  );
  if (!res.ok) return { error: res.error ?? 'render failed' };
  const data = res.data as RenderViewResult & { error?: string };
  if (data?.error) return { error: data.error };
  if (!data?.views?.length) return { error: 'the renderer returned no views' };
  // Push the pixels to the browser as they arrive. This is the only path by
  // which a frame reaches the user; the tool result below still strips them.
  if (ctx.emitFrame) {
    for (const v of data.views) {
      if (!v.rgbBase64) continue;
      ctx.emitFrame({
        rgbBase64: v.rgbBase64,
        width: v.meta.width,
        height: v.meta.height,
        view: v.name,
        subject: data.subject,
        capturedAt: Date.now(),
      });
    }
  }
  return data;
}

// ---------------------------------------------------------------------------------------------
// Untrusted-asset brokerage — the half of the gate that only the customer's place can answer
//
// assets.ts builds the whole apparatus and states the one order that is safe. `insert_asset` used
// none of it past the metadata gate: it resolved an id and handed the asset to Studio. That solves
// the half of the problem that can be solved without touching a place — but `hasScripts` is a
// third-party CLAIM about a third-party asset, made by an undocumented endpoint, about contents
// that can change after they were inspected. Whether the thing that LANDED carries Luau is a
// different question, and only the place can answer it.
//
// So every insertion now runs the broker's post-insertion sequence, and the ORDER is the security
// property (assets.ts, `brokerAsset`):
//
//   insert -> enumerate the hierarchy -> read every script out of the place -> scan
//          -> delete what the scan condemns -> RE-LIST to prove nothing survived
//
// Reordering any of it defeats it: an agent that inserts and then decides it is happy has already
// run the attacker's code, and "we deleted the scripts we knew about" is bookkeeping, not proof.
// Anything that cannot be proven clean is deleted WHOLE and the tool refuses.
// ---------------------------------------------------------------------------------------------

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/** Pull `{ scripts: [{ path, class }] }` out of a `list_scripts` result, defensively. */
function scriptRows(data: unknown): { path: string; className: string }[] {
  const rows = rec(data).scripts;
  if (!Array.isArray(rows)) return [];
  const out: { path: string; className: string }[] = [];
  for (const r of rows) {
    const path = strOrNull(rec(r).path);
    if (path) out.push({ path, className: strOrNull(rec(r).class) ?? 'Script' });
  }
  return out;
}

/** The one endpoint whose payload the metadata gate believes, wrapped so absence can be seen. */
const DETAILS_PATH = '/toolbox-service/v1/items/details';

export interface DetailsIntegrity {
  /** Fields the details response failed to report. Non-empty means the gate ran on a guess. */
  missing: string[];
}

/**
 * Wrap the details fetch so a MISSING field fails closed.
 *
 * `judgeAssetDetails` reads `asset.hasScripts === true`. That is correct against a documented
 * schema and wrong against this one: `toolbox-service/v1/items/details` is undocumented, so a
 * rename, a schema change or a partial response all arrive as "the field is not there" — and
 * `undefined === true` is `false`, which reads as "this asset carries no scripts" and passes the
 * single most important assertion in the system without a sound.
 *
 * The fix belongs at the trust boundary rather than inside the judge, which is pure and has no way
 * to tell absent from false. Absence is recorded here and the entry is rewritten to
 * `hasScripts: true`, so a silent schema change takes exactly the path a script-bearing asset takes.
 * The caller reads `missing` and reports what actually happened, so the refusal is never dressed up
 * as a script nobody saw.
 */
export function strictDetailsFetch(seen: DetailsIntegrity, base?: FetchLike): FetchLike {
  const inner: FetchLike = base ?? ((url, init) => fetch(url, init as RequestInit) as unknown as Promise<HttpResponseLike>);
  return async (url, init) => {
    const res = await inner(url, init);
    if (!url.includes(DETAILS_PATH) || !res.ok) return res;
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      // A details response that will not parse is a refusal, not an empty one — hand the parse
      // failure straight back so `verifyCreatorStoreAsset` records it as fail_network.
      return { ok: res.ok, status: res.status, json: () => Promise.reject(e instanceof Error ? e : new Error(String(e))) };
    }
    const rows = rec(body).data;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const asset = rec(row).asset;
        // An absent `asset` is a not-found, which the judge already fails on. Only a present asset
        // that declines to say anything about scripts is the silent-pass case this exists for.
        if (typeof asset !== 'object' || asset === null) continue;
        const a = asset as Record<string, unknown>;
        if (typeof a.hasScripts !== 'boolean') {
          seen.missing.push('hasScripts');
          a.hasScripts = true;
        }
      }
    }
    return { ok: res.ok, status: res.status, json: async () => body };
  };
}

/**
 * The assertions no source of an id may waive, re-read off the verdict's own fields.
 *
 * `AssetVerdict.verdict` names only the FIRST failure. That is fine to branch on today because
 * `judgeAssetDetails` evaluates security-first — but "fine because of the evaluation order inside
 * another module" is not a property worth depending on for this, so the four facts that actually
 * matter are asserted here directly.
 */
function securityBlockers(v: AssetVerdict): string[] {
  const blocked: string[] = [];
  if (!v.exists) blocked.push(`asset ${v.assetId} did not resolve to anything (${v.verdict})`);
  if (v.hasScripts || v.scriptCount > 0) blocked.push('the Creator Store itself reports that this asset carries Luau');
  if (v.shouldSandbox) blocked.push('Roblox flags this asset shouldSandbox');
  if (v.assetTypeId === null || !ACCEPTABLE_ASSET_TYPES[v.assetTypeId]) {
    blocked.push(`typeId ${v.assetTypeId ?? 'unknown'} is not insertable — a Model is refused because it is the container type that can carry scripts`);
  }
  if (v.visibilityStatus !== null && v.visibilityStatus !== 1) blocked.push(`visibilityStatus ${v.visibilityStatus} — not publicly visible`);
  return blocked;
}

/**
 * Insert one verified id and prove the place clean afterwards, or leave the place as it was found.
 *
 * Returns a tool result: small, and free of any line of the source it removed. An attacker's Luau
 * belongs in the audit trail, not in the model's transcript where it becomes an instruction.
 */
async function insertAndProveClean(ctx: AgentCtx, assetId: number, parent: string): Promise<unknown> {
  const inserted = await ctx.execStudioOp({ op: 'insert_asset', assetId, parent }, 45_000);
  if (!inserted.ok) return { error: inserted.error ?? 'insert_asset failed' };
  const raw = rec(inserted.data).inserted;
  const paths = (Array.isArray(raw) ? raw : []).filter((p): p is string => typeof p === 'string');
  if (!paths.length) return { error: `asset ${assetId} inserted nothing — nothing was added to the place` };

  /** Remove the whole asset and refuse. Never leaves the place in the state the scan objected to. */
  const discard = async (why: string): Promise<unknown> => {
    const del = await ctx.execStudioOp({ op: 'delete_instances', paths }, 20_000);
    return {
      error: `asset ${assetId} was inserted, refused and removed: ${why}`,
      ...(del.ok
        ? { removedWholeAsset: paths }
        : { removeFailed: del.error ?? 'delete failed', manualCleanupRequired: paths }),
    };
  };

  // 1. Enumerate. A subtree that cannot be walked is a subtree whose contents are unknown, and
  //    unknown is never scored as empty.
  const classes: string[] = [];
  let enumerationFailed = false;
  for (const p of paths) {
    const tree = await ctx.execStudioOp({ op: 'get_tree', root: p, maxDepth: 12, maxNodes: 400 }, 20_000);
    if (!tree.ok) {
      enumerationFailed = true;
      continue;
    }
    const sum = summariseTree(tree.data);
    classes.push(...sum.classes);
    if (sum.truncated) enumerationFailed = true;
  }

  // 2. Read the Luau back OUT OF THE PLACE. This is the whole point: the metadata said there was
  //    none, and this is the only reading of that claim that is not the claimant's own.
  const rows: { path: string; className: string }[] = [];
  for (const p of paths) {
    const listed = await ctx.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) {
      enumerationFailed = true;
      continue;
    }
    rows.push(...scriptRows(listed.data));
  }
  if (rows.length > SCAN_LIMITS.maxScripts) {
    return discard(`${rows.length} scripts in one asset, over the ${SCAN_LIMITS.maxScripts} scan cap — refused on count alone rather than partially cleared`);
  }
  const scripts: ScannedScriptInput[] = [];
  for (const s of rows) {
    const read = await ctx.execStudioOp({ op: 'read_script', path: s.path }, 20_000);
    // null, never '': a source that could not be read is the worst case, not the empty one.
    scripts.push({ path: s.path, className: s.className, source: read.ok ? strOrNull(rec(read.data).source) : null });
  }

  // 3. Judge.
  const scan = scanInsertedHierarchy({ rootPath: paths[0] as string, scripts, instanceClasses: classes, enumerationFailed });
  if (scan.verdict === 'reject') return discard(scan.reasons[0] ?? 'the safety scan rejected this asset');

  // 4. Strip what the scan condemned. A failed delete is a discard, not a warning.
  if (scan.removePaths.length) {
    const del = await ctx.execStudioOp({ op: 'delete_instances', paths: scan.removePaths }, 20_000);
    if (!del.ok) return discard(`${scan.removePaths.length} condemned script(s) could not be deleted (${del.error ?? 'delete failed'})`);
  }

  // 5. PROVE it. Re-listing is the only step that says anything about the place rather than about
  //    our own bookkeeping, so a listing that fails here is a refusal like any other.
  const leftover: string[] = [];
  for (const p of paths) {
    const listed = await ctx.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) return discard('the post-removal script listing failed, so the place cannot be proven clean');
    leftover.push(...scriptRows(listed.data).map((s) => s.path));
  }
  if (leftover.length) return discard(`${leftover.length} script(s) survived removal: ${leftover.slice(0, 6).join(', ')}`);

  return {
    assetId,
    inserted: paths,
    scan: scan.verdict,
    // Codes and one-line reasons only. An excerpt of the removed Luau would put the attacker's text
    // into the transcript, where the model reads it as prose.
    stripped: scan.scripts
      .filter((s) => s.action === 'remove')
      .map((s) => ({ path: s.path, class: s.className, severity: s.severity, why: [...new Set(s.findings.map((f) => f.code))].join(', ') })),
    ...(scan.findings.length ? { notes: scan.findings.slice(0, 6).map((f) => `${f.severity} ${f.code}: ${f.message}`) } : {}),
    proven: `re-listed after removal: zero scripts remain under ${paths.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------------------------
// run_luau's asset-ingress filter
//
// `run_luau` hands the model's Luau to the plugin's `run_code`, which concatenates it into a
// ModuleScript and requires it in PLUGIN context. That is a legitimate and load-bearing escape
// hatch — loops for trim and railings, terrain, bulk property edits, measurement — and it was also,
// verbatim, the primitive `insert_asset` is gated for: `game:GetObjects("rbxassetid://123")` is one
// line, and it reached the same place with none of the verification, none of the post-insertion
// scan, and no audit row.
//
// THE TRADE. Blocking the tool, or admitting only an allowlist of Luau, would cost far more than
// the gap is worth: almost everything the agent builds well, it builds with a loop. So the filter
// is narrow by construction — it refuses ASSET INGRESS and nothing else, and every refusal names
// `insert_asset` as the way to do the thing the code was reaching for. Ordinary building Luau
// contains none of these tokens, so the false-positive surface is close to zero.
//
// WHAT IT DOES NOT CLAIM. This is a pattern filter over source text, not a Luau evaluator, and a
// determined model can still defeat it:
//   * a string assembled through values the fold cannot resolve — a table of byte values, a loop
//     over `string.sub`, arithmetic on character codes, `table.concat` of computed parts;
//   * an ingress primitive reached through an alias captured before the call
//     (`local f = game.GetObjects` is caught, `local f = game[k]` with a computed `k` is not — which
//     is the whole reason computed indexing of `game` is refused outright);
//   * `edit_script` writing a game Script that calls `GetObjects`, then `run_and_check` running it.
//     That is a deliberate product capability — the user asked for a game — and is out of scope
//     here; it is bounded by the user owning and reading the scripts Golem writes.
//   * ASSIGNING A COMPUTED ASSET URI TO A CONTENT PROPERTY. `Paths.setProp` in the plugin refuses an
//     unverified `MeshId` / `Texture` / `SoundId`, which closes this for `create_instances` and
//     `set_properties` — but `run_code` executes Luau straight against the engine and never goes
//     through `setProp`, so that policy does not apply here. Measured as still allowed:
//     `m.MeshId = a .. b` through variables, `string.format("%s://%d", "rbxassetid", 999)`,
//     `table.concat({"rbxasset", "id://999"})`. The literal-fold catches adjacent literals only.
//     This is a LICENCE-AND-PROVENANCE hole, not code execution: those properties load inert media.
//     Recorded because the asymmetry is the dangerous part — a reader who knows the plugin gates
//     Content properties would reasonably assume all three ops are covered, and two of them are.
// So this raises the cost of the direct path and makes the indirect ones look like what they are.
// It is not a sandbox, and nothing downstream may be built as though it were one: the real
// guarantee still comes from the post-insertion scan that `insert_asset` runs inside the place.
// ---------------------------------------------------------------------------------------------

/** One refusal: a stable code for the audit trail, and the sentence the model is shown. */
export interface LuauIngressFinding {
  code: string;
  why: string;
}

/** End index of a `[[ … ]]` / `[==[ … ]==]` span starting at `i`, or null. Strings and comments both. */
function longBracketAt(src: string, i: number): number | null {
  if (src[i] !== '[') return null;
  let j = i + 1;
  let eq = 0;
  while (src[j] === '=') {
    eq += 1;
    j += 1;
  }
  if (src[j] !== '[') return null;
  const close = ']' + '='.repeat(eq) + ']';
  const at = src.indexOf(close, j + 1);
  return at < 0 ? src.length : at + close.length;
}

/**
 * Remove comments, leaving string literals intact.
 *
 * String-aware on purpose. A naive "cut from `--` to end of line" is a bypass rather than a
 * simplification: `local s = "--" game:GetObjects(id)` would lose the half of the line that
 * matters. Comments are removed at all so that `-- never call game:GetObjects here` is not a
 * refusal.
 */
function stripLuauComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === '-' && src[i + 1] === '-') {
      const long = longBracketAt(src, i + 2);
      if (long !== null) {
        i = long;
      } else {
        while (i < src.length && src[i] !== '\n') i += 1;
      }
      out += ' ';
      continue;
    }
    const long = longBracketAt(src, i);
    if (long !== null) {
      out += src.slice(i, long);
      i = long;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < src.length) {
        const c = src[i] as string;
        out += c;
        i += 1;
        if (c === '\\') {
          if (i < src.length) {
            out += src[i];
            i += 1;
          }
          continue;
        }
        if (c === ch) break;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Printable ASCII only. Decoding a control character helps nobody and could split a token. */
function printableChar(code: number, fallback: string): string {
  return code >= 32 && code <= 126 ? String.fromCharCode(code) : fallback;
}

/** `\65`, `\x41`, `\u{41}` → `A`. Applied per segment so an escaped backslash never starts one. */
function decodeLuauEscapes(seg: string): string {
  return seg
    .replace(/\\(\d{1,3})/g, (m, d: string) => printableChar(parseInt(d, 10), m))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h: string) => printableChar(parseInt(h, 16), m))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h: string) => printableChar(parseInt(h, 16), m));
}

/**
 * Undo the two evasions that are cheap to write and cheap to reverse: escape sequences, and
 * strings assembled out of literals.
 *
 * `"\114bxassetid://"`, `"rbxasset" .. "id://"` and `string.char(114,98,120)` all mean one thing to
 * the Luau parser, so they have to mean one thing here. The fold is textual and deliberately
 * conservative: anything it cannot resolve is left exactly as written rather than guessed at, and
 * the rules run over BOTH the original text and the folded text, so folding can only add findings.
 */
function foldLuauLiterals(src: string): string {
  // Split on the escaped backslash rather than substituting a sentinel: `"\\120"` is a backslash
  // followed by three digits, not the character `x`.
  let s = src
    .split('\\\\')
    .map(decodeLuauEscapes)
    .join('\\\\');

  s = s.replace(/\bstring\.char\s*\(([^()]*)\)/g, (m, args: string) => {
    const parts = args.split(',').map((p) => p.trim());
    if (!parts.length || !parts.every((p) => /^\d{1,3}$/.test(p))) return m;
    return '"' + parts.map((p) => printableChar(Number(p), '')).join('') + '"';
  });

  // Fixed point rather than a single pass: `"a" .. "b" .. "c"` needs two.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = s
      .replace(/(['"])([^'"\n]*)\1\s*\.\.\s*(['"])([^'"\n]*)\3/g, (_m, q: string, a: string, _q2: string, b: string) => q + a + b + q)
      .replace(/(\d)\s*\.\.\s*(\d)/g, '$1$2');
    if (next === s) return s;
    s = next;
  }
  return s;
}

/**
 * The tokens that mean "geometry from outside this place is about to arrive", plus the two that
 * mean "the source above is not the code that will run".
 */
const LUAU_INGRESS_RULES: readonly { code: string; pattern: RegExp; why: string }[] = [
  {
    code: 'get_objects',
    pattern: /\bGetObjects\b/,
    why: 'game:GetObjects loads an arbitrary asset id straight into the place — it is the exact primitive insert_asset exists to gate',
  },
  {
    code: 'insert_service',
    pattern: /\bInsertService\b|\bLoadAssetVersion\b|\bLoadAsset\b/,
    why: 'InsertService:LoadAsset / LoadAssetVersion insert a third-party asset with no verification',
  },
  {
    code: 'asset_uri',
    pattern: /rbx(?:assetid|thumb|http|gameasset):\/\//i,
    why: 'an rbxassetid:// or rbxthumb:// literal references content that has not been through the asset gate',
  },
  {
    code: 'content_from_asset',
    pattern: /\bContent\s*\.\s*from(?:AssetId|Uri)\b/,
    why: 'Content.fromAssetId / Content.fromUri hands an unverified asset id to AssetService',
  },
  {
    code: 'dynamic_code',
    pattern: /\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(/,
    why: 'loadstring/getfenv decide at runtime what code runs, so nothing in the source above them can be checked',
  },
  {
    code: 'computed_member',
    pattern: /\bgame\s*\[\s*[^'"\]\s]/,
    why: 'game[<computed>] hides which member is called; write game.Workspace or game:GetService("…") instead',
  },
];

/** The argument text of every `require(…)` call, brackets balanced. */
function requireArgs(src: string): string[] {
  const out: string[] = [];
  const re = /\brequire\s*\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
      i += 1;
    }
    out.push(src.slice(from, depth === 0 ? i - 1 : src.length));
  }
  return out;
}

/**
 * Everything `run_luau` refuses, as findings rather than a boolean, so the refusal can say WHICH
 * primitive was reached for.
 *
 * `require` is judged by its argument. A numeric literal is the classic marketplace backdoor, and
 * an argument with no path structure at all — a bare name, a call, `tonumber(s)` — cannot be read
 * from the source, so it is indistinguishable from one. Anything that traverses a path is allowed
 * (`require(script.Parent.Config)`, `require(SS.Modules.Config)` where `SS` is a service captured
 * further up), because that is what the legitimate uses of this tool look like and refusing them
 * would cost more than the rule is worth.
 */
export function scanLuauForAssetIngress(code: string): LuauIngressFinding[] {
  const stripped = stripLuauComments(code);
  const variants = [stripped, foldLuauLiterals(stripped)];
  const found = new Map<string, string>();
  for (const rule of LUAU_INGRESS_RULES) {
    if (variants.some((v) => rule.pattern.test(v))) found.set(rule.code, rule.why);
  }
  for (const variant of variants) {
    for (const arg of requireArgs(variant)) {
      const a = arg.trim();
      if (/^["']?\d/.test(a)) {
        found.set('require_asset_id', 'require(<asset id>) pulls a module off the marketplace at runtime — the classic Roblox backdoor');
      } else if (/\btonumber\b/.test(a) || !/[.:]/.test(a)) {
        found.set('require_computed', `require(${a.slice(0, 40)}) resolves to something the source does not say, so what it loads is unknown; require a module by its path`);
      }
    }
  }
  return [...found].map(([code_, why]) => ({ code: code_, why }));
}

/**
 * The refusal itself, shared by `run_luau` and by the admin diagnostics route, so the two cannot
 * drift apart. Returns null when the code may run.
 */
export function refuseLuauIngress(code: string): { error: string; blocked: string[] } | null {
  const findings = scanLuauForAssetIngress(code);
  if (!findings.length) return null;
  return {
    error:
      `this Luau was refused because it reaches for an asset-ingress primitive: ${findings.map((f) => f.why).join('; ')}. ` +
      'Luau is not how assets enter a place. Find an id with search_asset_library or find_verified_asset and insert it with insert_asset, ' +
      'which verifies the id and then reads the place back to prove nothing executable arrived with it. ' +
      'Everything else run_luau does — loops, terrain, bulk property edits, measurement — is unaffected.',
    blocked: findings.map((f) => f.code),
  };
}

/**
 * Write the attribution row for an asset that has just been placed.
 *
 * The ledger keys on `asset_library.id` — a namespaced slug like
 * `kenney/city-kit-suburban/building-a-01` — because a Roblox id says nothing about
 * where the bytes came from or under what licence. A Creator Store asset that is not
 * in the curated library therefore has no key, and inventing one that LOOKS like a
 * library id would be worse than having none: the report's left join would match a
 * real library row one day and credit the wrong author.
 *
 * So an unaccounted asset is keyed `unaccounted:roblox:<id>`, which contains a colon
 * and can never satisfy the library's own id pattern. The join always misses, the
 * report renders it as provenance-unknown, and that is the honest answer — it is the
 * one state `provenance: null` exists to express.
 *
 * Returns the key it wrote, or null when there was nothing to write it against.
 */
/**
 * Isolate-scoped, not global: a fresh isolate pays for one extra
 * `create table if not exists` and every insertion after it pays nothing. Getting this
 * wrong costs three cheap DDL statements, never correctness — which is why the flag is
 * set AFTER the call rather than before it, so a failed creation is retried.
 */
let provenanceTablesReady = false;

async function recordPlacedAsset(
  ctx: AgentCtx,
  assetId: number,
  parent: string,
): Promise<{ assetId: string; accounted: boolean; recorded?: false; why?: string } | null> {
  if (!ctx.projectId) return null;
  try {
    if (!provenanceTablesReady) {
      await ensureProvenanceTables(ctx.env);
      provenanceTablesReady = true;
    }
    // The library is asked about EVERY id, not only ones this session's search returned.
    // Gating the lookup on `fromLibrary` — which is session membership — meant a library
    // asset whose id arrived any other way was recorded as unaccounted and then reported
    // to the customer as an asset Golem could not account for. Both of the other arrival
    // routes are supported paths: an id the user pasted, and one carried over from an
    // earlier session. The query below answers correctly for any id, and provenance is a
    // property of the ASSET, not of how its number reached this function.
    let key: string | null = null;
    try {
      const row = await ctx.env.CORPUS.prepare('select id from asset_library where roblox_asset_id = ? limit 1')
        .bind(assetId)
        .first<{ id: string }>();
      key = row?.id ?? null;
    } catch (e) {
      // ONLY the missing table. The first version of this catch swallowed everything,
      // which made it do the very thing the read path in provenance.ts refuses to do —
      // and worse, durably. A transient D1 error would fall through and write a
      // PERMANENT `unaccounted:` row for an asset that is in the library; the row
      // outlives the blip, and because the primary key is (project_id, asset_id) a
      // later correct placement writes a SECOND row under the real library id, so one
      // physical asset appears in the report twice — once as unaccounted, once
      // credited. A missing table is a known state of the world; anything else is a
      // fault, and a fault must not be recorded as an answer.
      if (!String(e instanceof Error ? e.message : e).includes('no such table')) throw e;
      key = null;
    }
    const accounted = key !== null;
    // `viaLiveApi` is false here and it is a claim, not a default: the only source that
    // asks for a live-API credit is Poly Haven, and nothing on this path calls it. A
    // library asset was ingested offline by an operator and re-uploaded under Golem's
    // account; the insertion touches Roblox, not the origin's API.
    await recordAssetUse(ctx.env, ctx.projectId, key ?? `unaccounted:roblox:${assetId}`, {
      viaLiveApi: false,
      context: parent,
    });
    return { assetId: key ?? `unaccounted:roblox:${assetId}`, accounted };
  } catch (e) {
    // The reason travels back with the failure. A bare `catch { return null }` reported a
    // permanent schema mistake — a renamed column in `recordAssetUse` — exactly like a
    // one-off D1 blip, which is the same "well-covered logic, nothing watches the wiring"
    // shape this producer was written to fix. The placement still stands; only the record
    // is lost, and now it says what lost it.
    return { assetId: `unaccounted:roblox:${assetId}`, accounted: false, recorded: false, why: scrubEngineIdentity(String(e instanceof Error ? e.message : e)).slice(0, 160) };
  }
}

export const TOOLS: Record<string, ToolImpl> = {
  get_project_tree: {
    def: {
      name: 'get_project_tree',
      description: 'Snapshot of the game instance tree (names, classes, child counts). Start here to understand a project.',
      parameters: S({
        root: { type: 'string', description: 'Path to start from, e.g. "game.Workspace". Default: whole game (key services).' },
        maxDepth: { type: 'number', description: 'Depth limit, default 4' },
      }),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'get_tree', root: a.root as string | undefined, maxDepth: (a.maxDepth as number) ?? 4, maxNodes: 800 }),
  },
  list_scripts: {
    def: { name: 'list_scripts', description: 'List all scripts in the project with paths, class and line counts.', parameters: S({ root: { type: 'string' } }) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'list_scripts', root: a.root as string | undefined }),
  },
  read_script: {
    def: { name: 'read_script', description: 'Read full source of a script by path.', parameters: S({ path: { type: 'string' } }, ['path']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'read_script', path: String(a.path ?? '') }),
  },
  edit_script: {
    def: {
      name: 'edit_script',
      description:
        'Create or edit a script. Provide either `source` (full new content) or `edits` (find/replace list, exact match). To create a new script set `create_class` + `create_parent`.',
      parameters: S(
        {
          path: { type: 'string', description: 'Full path, e.g. game.ServerScriptService.RoundManager' },
          source: { type: 'string' },
          edits: {
            type: 'array',
            items: S({ find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean' } }, ['find', 'replace']),
          },
          create_class: { type: 'string', enum: ['Script', 'LocalScript', 'ModuleScript'] },
          create_parent: { type: 'string', description: 'Parent path when creating' },
        },
        ['path'],
      ),
    },
    studio: true,
    run: (ctx, a) =>
      op(ctx, {
        op: 'edit_script',
        path: String(a.path ?? ''),
        source: a.source as string | undefined,
        edits: a.edits as { find: string; replace: string; all?: boolean }[] | undefined,
        create:
          a.create_class && a.create_parent
            ? { className: a.create_class as 'Script' | 'LocalScript' | 'ModuleScript', parent: String(a.create_parent) }
            : undefined,
      }),
  },
  search_scripts: {
    def: { name: 'search_scripts', description: 'Search all script sources for a string. Returns matches with paths and line numbers.', parameters: S({ query: { type: 'string' } }, ['query']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'search_scripts', query: String(a.query ?? ''), maxResults: 40 }),
  },
  create_instances: {
    def: {
      name: 'create_instances',
      description:
        'Create instances (parts, models, UI, folders...). Each item: {className, name, parent, props?, children?}. Props are typed: {"Position":{"t":"Vector3","v":[0,5,0]}, "Anchored":{"t":"bool","v":true}, "Material":{"t":"EnumItem","v":"Enum.Material.Neon"}, "Color":{"t":"Color3","v":[1,0.5,0]}, "Size":{"t":"UDim2","v":[0.5,0,0.1,0]}, "AnchorPoint":{"t":"Vector2","v":[0.5,0.5]}}. Supported prop types: string,number,bool,Vector3,Vector2,CFrame,Color3,UDim2,UDim,EnumItem,BrickColor,Content,NumberRange,Rect,Instance,nil. If the result reports propIssues, the instances WERE created — fix the listed properties with set_properties.',
      parameters: S({ items: { type: 'array', items: { type: 'object' } } }, ['items']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'create_instances', items: (a.items as never[]) ?? [] }),
  },
  set_properties: {
    def: {
      name: 'set_properties',
      description: 'Set properties/attributes on an existing instance. Same typed prop format as create_instances.',
      parameters: S({ path: { type: 'string' }, props: { type: 'object' }, attributes: { type: 'object' } }, ['path']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'set_props', path: String(a.path ?? ''), props: a.props as never, attributes: a.attributes as never }),
  },
  delete_instances: {
    def: { name: 'delete_instances', description: 'Delete instances by path.', parameters: S({ paths: { type: 'array', items: { type: 'string' } } }, ['paths']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'delete_instances', paths: (a.paths as string[]) ?? [] }),
  },
  run_luau: {
    def: {
      name: 'run_luau',
      description:
        'Run a Luau snippet in Studio (edit-time, plugin context) for inspection, terrain, bulk edits, math. print() output and the returned value come back. No game scripts run. Use for anything the other tools cannot do. It may NOT be used to bring assets into the place: GetObjects, InsertService, rbxassetid://, Content.fromAssetId, loadstring and require of an asset id are refused here — use insert_asset, which verifies the id and scans the place afterwards.',
      parameters: S({ code: { type: 'string' } }, ['code']),
    },
    studio: true,
    run: async (ctx, a) => {
      const code = String(a.code ?? '');
      // Refused BEFORE the op is queued. By the time an asset reaches the place its scripts have
      // already had their chance to run, so there is no useful check on the far side of this.
      return refuseLuauIngress(code) ?? (await op(ctx, { op: 'run_code', code, timeoutMs: 10_000 }, 25_000));
    },
  },
  run_and_check: {
    def: {
      name: 'run_and_check',
      description:
        'Playtest verification: starts Run mode (server simulation), waits, collects console output/errors, stops. Returns the logs. Use AFTER building, to verify nothing errors. Run mode is NOT a sandbox — it executes your server scripts against the real place and Studio does not undo what they destroy — so this takes a protective checkpoint first, and restores automatically if the playtest destroys anything.',
      parameters: S({ seconds: { type: 'number', description: '2-15, default 5' } }),
    },
    studio: true,
    run: async (ctx, a) => {
      const secs = Math.min(15, Math.max(2, Number(a.seconds) || 5));

      // Census BEFORE. RunService:Run() executes server scripts against the EDIT DataModel and Stop
      // does not revert them, so anything a startup script destroys is destroyed for real.
      // Reproduced in live Studio — the transcript is in apps/worker/src/playtest.ts.
      const beforeRaw = await ctx.execStudioOp({ op: 'run_code', code: CENSUS_LUAU }, 30_000);
      const before = beforeRaw.ok ? parseCensus(beforeRaw.data) : null;

      // The playtest becomes watchable from here. `begin` is deliberately AFTER the
      // census and BEFORE the checkpoint, so a refusal below is reported to the card as
      // a failed playtest the user can see the reason for, rather than as a playtest
      // that never appeared to exist.
      ctx.playtest?.begin({ requestedSeconds: secs, action: 'Taking a protective checkpoint' });

      // Protective checkpoint. If there is real work here and it cannot be protected, REFUSE — an
      // unprotected playtest is precisely the hazard, and declining costs the user nothing.
      let checkpointId: string | null = null;
      if (needsProtection(before)) {
        const cp = await ctx.createCheckpoint('before playtest', 'auto');
        if ('error' in cp) {
          ctx.playtest?.phase('failed', 'Refused: the project could not be protected first', cp.error);
          return {
            error:
              `refused to playtest: could not take a protective checkpoint first (${cp.error}). ` +
              'Run mode executes server scripts against the real place and Studio does not undo what they destroy, ' +
              'so this would risk the build. Fix the checkpoint problem, or verify without a playtest.',
          };
        }
        checkpointId = cp.id;
      }

      ctx.playtest?.phase('preparing', 'Starting run mode in Studio');
      const start = await ctx.execStudioOp({ op: 'run_mode', action: 'start' }, 20_000);
      if (!start.ok) {
        ctx.playtest?.phase('failed', 'Run mode would not start', start.error);
        return { error: `could not start run mode: ${start.error}` };
      }

      // ------------------------------------------------------------- watch it run
      //
      // What replaced a blind `sleep(secs)`. The simulation runs for the same wall
      // clock either way; the difference is that the user can now see it.
      //
      // The loop is driven by the CLOCK, not by a frame counter: each pass captures a
      // frame if the rate gate allows one, and sleeps only for what is left of the
      // interval. A rasterise that takes 800ms therefore costs the playtest nothing —
      // it eats into the wait rather than extending the run past `secs`, so the
      // playtest still lasts as long as the agent asked for and no longer.
      //
      // Frames are captured through the EXISTING `render_view` op, at a size the
      // existing plugin already clamps to. No new op, no protocol bump, nothing that
      // an installed plugin would fail on — which matters because Roblox has no
      // automatic plugin updating and a new op would be broken for every current user
      // until each of them clicked Update by hand.
      const deadline = Date.now() + secs * 1000;
      const pt = ctx.playtest;
      if (pt) {
        pt.phase('running', 'Run mode is live — capturing frames');
        let logsSeen = 0;
        while (Date.now() < deadline) {
          const tickStart = Date.now();
          if (pt.canCapture()) await pt.captureFrame();

          // Console state is refreshed roughly every other capture. Reading it every
          // pass would double the op traffic to show a number that changes slowly.
          logsSeen += 1;
          if (logsSeen % 2 === 0) {
            const live = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 10_000);
            if (live.ok) {
              const counts = countConsole(parseLogEntries(live.data) ?? undefined);
              pt.console(counts.errors, counts.warnings);
            }
          }

          const spent = Date.now() - tickStart;
          const wait = Math.min(PLAYTEST_FRAME_MIN_INTERVAL_MS - spent, deadline - Date.now());
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
        pt.phase('stopping', 'Stopping run mode and checking what changed');
      } else {
        await new Promise((r) => setTimeout(r, secs * 1000));
      }

      const logs = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 15_000);
      if (logs.ok) {
        const counts = countConsole(parseLogEntries(logs.data) ?? undefined);
        ctx.playtest?.console(counts.errors, counts.warnings);
      }
      const stop = await ctx.execStudioOp({ op: 'run_mode', action: 'stop' }, 20_000);

      // Census AFTER, and restore if the playtest ate anything.
      const afterRaw = await ctx.execStudioOp({ op: 'run_code', code: CENSUS_LUAU }, 30_000);
      const after = afterRaw.ok ? parseCensus(afterRaw.data) : null;
      const lost = before && after ? destructiveDelta(before, after) : [];

      let restored: string | undefined;
      if (lost.length && checkpointId && ctx.restoreCheckpoint) {
        const res = await ctx.restoreCheckpoint(checkpointId);
        // The restore is VERIFIED, never assumed: re-census and confirm the losses are actually back.
        const checkRaw = res.ok ? await ctx.execStudioOp({ op: 'run_code', code: CENSUS_LUAU }, 30_000) : null;
        const check = checkRaw?.ok ? parseCensus(checkRaw.data) : null;
        const stillLost = before && check ? destructiveDelta(before, check) : ['the restore could not be verified'];
        restored =
          res.ok && stillLost.length === 0
            ? 'the project was restored from the pre-playtest checkpoint, and the restore was verified by re-counting'
            : `THE RESTORE DID NOT FULLY SUCCEED (${res.error ?? stillLost.join('; ')}) — checkpoint ${checkpointId} still holds the pre-playtest state`;
      }

      // The card's last word. A playtest that destroyed work says so even when the
      // restore succeeded, because "it was put back" and "nothing happened" are
      // different facts and the user is entitled to the first one.
      ctx.playtest?.phase(
        'finished',
        lost.length
          ? `Finished — the playtest destroyed committed work${restored ? ' and it was restored' : ''}`
          : 'Finished',
      );

      // Safety fields come FIRST. Tool results are truncated at MAX_RESULT_CHARS and the console log
      // is easily thousands of characters, so putting the destruction warning after it means the
      // agent never sees the one thing it must not miss.
      return {
        ...(lost.length
          ? {
              destroyedByPlaytest: lost,
              restored,
              warning:
                'A script destroyed committed work when the simulation started. Run mode is not a sandbox — it runs ' +
                'your scripts against the real place. Find the script that deletes instances on startup and guard it ' +
                'before playtesting again.',
            }
          : {}),
        ...(checkpointId ? { protectedByCheckpoint: checkpointId } : {}),
        ...(before && after ? {} : { censusUnavailable: true }),
        ranSeconds: secs,
        stopped: stop.ok,
        logs: logs.ok ? logs.data : { error: logs.error },
      };
    },
  },
  get_output_logs: {
    def: { name: 'get_output_logs', description: 'Read recent Studio output/console logs (errors, warnings, prints).', parameters: S({}) },
    studio: true,
    run: (ctx) => op(ctx, { op: 'get_logs', maxEntries: 120 }),
  },
  render_view: {
    def: {
      name: 'render_view',
      description:
        'Render the scene to real images from one or more camera angles and report what is actually visible. Use this to SEE your work — object properties cannot tell you whether a scene looks good.',
      parameters: S({
        target: { type: 'string', description: 'instance path to frame, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        view: { type: 'string', enum: [...RENDER_VIEWS, 'all'], description: 'camera preset; "all" renders every angle' },
      }),
    },
    studio: true,
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, String(a.view ?? 'hero'));
      if ('error' in res) return res;
      // The images themselves never enter the transcript — they are ~60KB each and tool results
      // are re-sent on every later step. inspect_visually is what actually shows them to a model.
      ctx.lastRender = res;
      return { subject: res.subject, boundsSizeStuds: res.boundsSize, views: res.views.map((v) => ({ view: v.name, ...v.meta })) };
    },
  },
  check_composition: {
    def: {
      name: 'check_composition',
      description:
        'Check your BLOCKOUT before adding any detail: whether you are building the thing that was actually requested, and whether the macro composition works. Costs nothing — no images, no critique. If it fails, adding parts cannot fix it; change the layout and check again.',
      parameters: S({
        target: { type: 'string', description: 'instance path to check, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        subject: { type: 'string', enum: ['scene', 'prop'], description: 'a prop has no landmark tier; defaults to scene' },
        intent: { type: 'string', description: "the user's request in their own words — used to check you are building the right KIND of thing" },
      }),
    },
    studio: true,
    run: async (ctx, a) => {
      // Deliberately the cheapest check in the product: one Studio round-trip for geometry, then
      // arithmetic. No vision model call and no image tokens, where inspect_visually costs a full
      // critique. That difference is what makes "reject the blockout and rebuild it" affordable
      // enough to do early, which is the only point at which rejecting it is cheap.
      // Geometry comes from run_code, not from a render. MEASURED: the plugin installed in the
      // owner's Studio returns render_view WITHOUT a `layout` field, so reading it there made this
      // whole gate inert in production — it answered "no geometry to judge" against a place full of
      // geometry. run_code is understood by every installed plugin, and it is cheaper than the
      // render it replaces: no rasterisation and no image payload.
      const raw = await ctx.execStudioOp({ op: 'run_code', code: LAYOUT_LUAU }, 30_000);
      if (!raw.ok) return { error: `could not read the scene: ${raw.error}` };
      const parts = parseLayout(raw.data);
      const structure = structureFromLayout(parts ?? undefined);
      if (!structure) return { error: 'no geometry to judge — build the blockout first' };
      const subject = a.subject === 'prop' ? 'prop' : 'scene';
      // SEMANTIC FIRST. Composition asks "is this well arranged"; semantics asks "is this the thing
      // that was asked for". The cottage built for a tavern-interior brief had a real vertical
      // hierarchy and was still completely wrong, so the second question has to be answered first —
      // and answered before any detail is paid for.
      const semantic = a.intent ? semanticCheck(String(a.intent), parts ?? undefined) : null;
      const failures = [...(semantic?.failures ?? []), ...compositionHardFails(structure, [], subject)];
      return {
        structure: structureLine(structure),
        ...(semantic ? { intentMatch: semanticLine(semantic) } : {}),
        passed: failures.length === 0,
        failures,
        guidance: semantic?.failures.length
          ? 'STOP. You are not building the thing that was requested. Do not add detail and do not correct this in place — the layout itself is the wrong shape. Clear what you built and lay out the right kind of space.'
          : failures.length
            ? 'These are structural. More parts, more materials and more props will not move any of them — that was measured. Change the LAYOUT: give one element clear dominance in height and mass and let everything else step down beneath it.'
            : 'Blockout is sound and it is the right kind of thing. Build detail on top of it.',
      };
    },
  },
  inspect_visually: {
    def: {
      name: 'inspect_visually',
      description:
        'Render the scene and have it critiqued as an image against a visual quality gate. Returns a score, named defects and specific fixes. Call this after building anything visual, and again after fixing, until it passes.',
      parameters: S(
        {
          target: { type: 'string', description: 'instance path to inspect. Omit for the whole workspace.' },
          intent: { type: 'string', description: 'what the user asked for, in one line — the critique is judged against this' },
        },
        ['intent'],
      ),
    },
    studio: true,
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, 'all');
      if ('error' in res) return res;
      ctx.lastRender = res;
      const intent = String(a.intent ?? 'a well-built Roblox scene');
      const critique = await critiqueViews(ctx.env, res, intent);

      // THE DETERMINISTIC PANEL, alongside the model's opinion.
      //
      // `critic.ts` shipped in zero bytes until now: its only importer anywhere was a test, and the
      // deployed bundle contained no trace of it. It is 900 lines of measured rules with an evidence
      // gate — a criticism that cannot cite a number is DISCARDED rather than down-weighted — and it
      // was running nowhere while the product asked a vision model for a score instead.
      //
      // The two are complementary and are reported separately on purpose. `critiqueViews` is a
      // model's judgement of pixels; the panel is arithmetic over what the plugin measured. Where
      // they disagree, that disagreement is information.
      //
      // The panel runs with NO judge, so it makes zero model calls and costs nothing. Five of its
      // eighteen metrics are pixel-derived and are not supplied, because reproducing them here would
      // mean inferring a downsample and a masking rule defined in the eval harness — and the panel
      // now REPORTS what it could not check, so a partial run says so instead of looking clean.
      const panel = await runCriticPanel(criticInputFromRender(res, intent));

      // THE PANEL'S VERDICT REACHES THE AGENT, not only the screen.
      //
      // Until now `panel` went into `ctx.uiDetail` and nowhere else. `uiDetail` is the browser.
      // The retry loop reads `ctx.lastCritique`, and `session.ts` decides `visualDefectsFound`
      // from it — so the panel could confirm a measured defect, print it in the workspace, and the
      // run would still report a clean build and move on. A critic whose findings reach the screen
      // and influence nothing the agent does is a display, not a critic, and this repository has
      // twice recorded that the panel "is display-only" as an item to fix rather than fixing it.
      //
      // `hardFails` is the seam, because it is already DEFINED as "rules tripped by measured
      // structure, independent of the model's opinion" — which is exactly what the panel produces.
      // It already flows to the model's text via critiqueToText, to the workspace through the
      // generative-ui adapter, and to the retry decision through `passed`. Nothing new is threaded;
      // the measured verdict simply stops being discarded.
      //
      // CONFIRMED ONLY. `panel.unchecked` is an absence of evidence and must never fail a build —
      // that distinction is the whole point of the evidence gate, and inverting it here would make
      // a partial run indistinguishable from a bad one.
      if (panel.adjudication.confirmed.length) {
        critique.hardFails = [
          ...critique.hardFails,
          ...panel.adjudication.confirmed.map((d) => `${d.subject} — ${d.claims[0] ?? 'measured defect'} [${d.severity}, confirmed by ${d.confirmedBy}]`),
        ];
        // A measured, evidence-backed defect is not a clean build, whatever the model said. The
        // two verdicts are complementary and this is the direction the disagreement has to resolve:
        // the panel cites numbers the model never saw.
        critique.passed = false;
      }
      ctx.lastCritique = critique;

      // SHOW THE USER WHAT THE CRITIC LOOKED AT.
      //
      // The model gets text, a score and a verdict — deliberately no pixels, because this result is
      // re-sent on every later step and a frame is ~207KB of base64 RGB. The BROWSER gets the image,
      // once, on this row. Without it the workspace showed a score with nothing behind it, which is
      // the same shape as the failure this whole product exists to prevent: a verdict the user is
      // asked to trust with no evidence attached.
      //
      // One view, not all of them. The hero is what the critique is mostly about, and a gallery
      // would cost four times the bytes to say the same thing.
      const hero = res.views.find((v) => v.name === 'hero') ?? res.views[0];
      if (hero) {
        // Encoded HERE rather than in the browser. The client used to convert raw RGB itself, which
        // meant sending 207KB to deliver a picture that is ~25KB as PNG.
        const png = await rgbBase64ToDataUrl(hero.rgbBase64, hero.meta.width, hero.meta.height).catch(() => null);
        if (png) {
          ctx.uiDetail = {
            render: {
              subject: res.subject,
              boundsSize: res.boundsSize,
              lighting: res.lighting,
              views: [{ name: hero.name, pngDataUrl: png, meta: hero.meta }],
            },
            critique,
            panel: {
              confirmed: panel.adjudication.confirmed,
              // Non-empty means this verdict is PARTIAL. The browser renders it as such rather than
              // as a clean result, because a clean result over unchecked rules is the failure this
              // whole subsystem exists to prevent.
              unchecked: panel.unchecked,
              report: formatPanelReport(panel),
            },
          };
        }
      }
      return { text: critiqueToText(critique), score: critique.score, passed: critique.passed };
    },
  },
  choose_asset_source: {
    def: {
      name: 'choose_asset_source',
      description:
        'Where should this piece of the scene come from? Returns an ordered list of sources with rationale and the verification gate each requires. Call this BEFORE building anything you might be tempted to search for. Procedural wins almost everywhere; foliage and characters are the exceptions.',
      parameters: S(
        { need: { type: 'string', enum: ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle', 'lighting'] } },
        ['need'],
      ),
    },
    studio: false,
    run: async (_ctx, a) => chooseAssetSource(String(a.need ?? 'prop') as AssetNeed),
  },
  search_asset_library: {
    def: {
      name: 'search_asset_library',
      description:
        "Search Apple's curated CC0 asset library. Every hit has a recorded licence that permits use — which is not the same as being safe, and each id is still resolved and security-gated by insert_asset like any other. Prefer this over the Creator Store for anything procedural geometry cannot do — foliage and characters especially.",
      parameters: S(
        {
          query: { type: 'string' },
          kind: { type: 'string', enum: ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle'] },
          maxTriangles: { type: 'number' },
        },
        ['query'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      let hits;
      try {
        hits = await searchAssetLibrary(ctx.env, String(a.query ?? ''), {
          kind: a.kind ? (String(a.kind) as AssetKind) : undefined,
          maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
          insertableOnly: true,
          k: 8,
        });
      } catch (e) {
        // THE LIBRARY NOT EXISTING IS NOT THE SAME FACT AS THE LIBRARY HAVING NO MATCH,
        // and this deployment is in the first state: nothing in the repository calls
        // `ensureAssetTables` or `upsertAssets`, so `asset_library` has never been
        // created and every call here raised `no such table: asset_library_fts`. The
        // model saw a raw SQL string it could do nothing with.
        //
        // Returning [] instead would be worse than the raw error, not better: it would
        // read as "the curated library has nothing like that", which is a claim about
        // an empty table nobody has ever filled. So the state is named, and the model
        // is told to take the Creator Store path DELIBERATELY rather than by accident.
        if (String(e instanceof Error ? e.message : e).includes('no such table')) {
          return {
            error:
              'the curated asset library is not available in this deployment — it has never been '
              + 'populated, so this is not a statement that it has nothing matching your query. '
              + 'Use find_verified_asset for the Creator Store instead, or build the thing from '
              + 'Parts with create_instances.',
          };
        }
        throw e;
      }
      // Recorded as provenance, on both sets. A library hit is still resolved and gated before it
      // may be inserted — the library says an id is LICENSED, not that it is safe.
      for (const h of hits) {
        if (h.robloxAssetId === null) continue;
        (ctx.discoveredAssetIds ??= new Set()).add(h.robloxAssetId);
        (ctx.libraryAssetIds ??= new Set()).add(h.robloxAssetId);
      }
      return hits.map((h) => ({ assetId: h.robloxAssetId, name: h.name, kind: h.kind, triangles: h.triangles, boundsStuds: h.boundsStuds, tags: h.tags }));
    },
  },
  find_verified_asset: {
    def: {
      name: 'find_verified_asset',
      description:
        'Last resort when the library has nothing: search the Creator Store and return only ids that passed full verification (free, publicly visible, ZERO scripts, Mesh/Image only — never a Model, trusted creator, inside the triangle budget). Never invent an assetId; only ids returned here or by search_asset_library can be inserted.',
      parameters: S({ query: { type: 'string' }, maxTriangles: { type: 'number' }, robloxOnly: { type: 'boolean' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const integrity: DetailsIntegrity = { missing: [] };
      const res = await findVerifiedAssets(ctx.env, String(a.query ?? ''), {
        category: 'mesh',
        robloxOnly: a.robloxOnly === true,
        maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
        want: 3,
        fetchImpl: strictDetailsFetch(integrity),
      });
      for (const v of res.passed) (ctx.discoveredAssetIds ??= new Set()).add(v.assetId);
      return {
        note: res.search.note,
        ...(integrity.missing.length
          ? { schemaWarning: `the details endpoint stopped reporting ${[...new Set(integrity.missing)].join(', ')} for one or more candidates; those were refused rather than assumed script-free` }
          : {}),
        passed: res.passed.map((v) => ({ assetId: v.assetId, name: v.name, type: v.assetType, triangles: v.triangles })),
        rejected: res.rejected.map((v) => ({ assetId: v.assetId, verdict: v.verdict, reasons: v.reasons })),
      };
    },
  },
  insert_asset: {
    def: {
      name: 'insert_asset',
      description:
        'Insert an asset by numeric assetId. Use an id from search_asset_library or find_verified_asset, or one the USER gave you — never one you produced yourself: a made-up id resolves to something random or to nothing. Where the id came from does not decide whether it is checked. EVERY id is resolved against the Creator Store and must pass the full gate (free, publicly visible, zero scripts, Mesh or Image — a Model is always refused, trusted creator, inside the triangle budget), and every insertion is then scanned INSIDE the place: Luau that arrived with the asset is removed, the place is re-listed to prove it clean, and an asset that cannot be proven clean is deleted whole and refused. To create objects, build them from Parts with create_instances instead.',
      parameters: S({ assetId: { type: 'number' }, parent: { type: 'string' } }, ['assetId']),
    },
    studio: true,
    run: async (ctx, a) => {
      const assetId = Number(a.assetId);
      if (!Number.isInteger(assetId) || assetId <= 0) return { error: `${String(a.assetId)} is not a valid asset id` };
      const parent = String(a.parent ?? 'game.Workspace');

      // WHERE an id came from decides which assertions may be waived. It never decides whether the
      // gate runs — a membership test is not a verification, and treating it as one is how a bad
      // library row would have reached a place unresolved and unscanned.
      //
      // AND IT CANNOT DECIDE MORE THAN THAT, which the tool description used to claim it did: it
      // promised that an id from outside this session's searches is refused. It was not, and the
      // code could not have kept the promise. `verifyCreatorStoreAsset` refuses `model_output`, but
      // nothing here assigns it, because nothing here can: an id the user pasted and an id the model
      // invented arrive at this function as the same integer. The evidence that would separate them
      // — the user's own message text — lives in the session Durable Object and is not passed to a
      // tool, and adding a hook nobody fills in would be the same dead branch in a new place.
      //
      // So the description now states what this actually does, and `user_supplied` means exactly
      // "not discovered in this session" — the LEAST trusted provenance, which waives nothing and
      // faces the full gate plus the in-place scan below. Refusing it outright was considered and
      // rejected: a user pasting an id they own is a real flow, and it is the flow that is hardest
      // to work around when it is broken. The provenance is reported in the result so that an id
      // nobody searched for is visible in the transcript and in the audit log rather than inferred.
      const fromLibrary = ctx.libraryAssetIds?.has(assetId) === true;
      const provenance: AssetProvenanceSource = fromLibrary ? 'library' : ctx.discoveredAssetIds?.has(assetId) ? 'search_result' : 'user_supplied';

      const integrity: DetailsIntegrity = { missing: [] };
      const verdict = await verifyCreatorStoreAsset(ctx.env, assetId, { provenance, fetchImpl: strictDetailsFetch(integrity) });
      if (integrity.missing.length) {
        return {
          error:
            `asset ${assetId} was refused: the asset details response did not report ${[...new Set(integrity.missing)].join(', ')}, ` +
            'so whether it carries scripts could not be checked. A field that is absent is treated as the worst case, never as false.',
        };
      }

      // A curated-library id is an asset an operator ingested with a recorded licence, source URL
      // and sha256, and uploaded under Golem's own account. It therefore has no marketplace price,
      // no votes and no verified-creator badge by construction, and failing it on those three would
      // refuse every asset in the library. Those three, and ONLY those three, are waived — the
      // script, sandbox, type and moderation assertions are re-read field by field in
      // `securityBlockers`, and the waiver is reported back so nobody has to infer it.
      const blockers = fromLibrary ? securityBlockers(verdict) : verdict.ok ? [] : [`${verdict.verdict}. ${verdict.reasons.join(' ')}`];
      if (blockers.length) return { error: `asset ${assetId} was not verified: ${blockers.join(' ')}` };

      ctx.discoveredAssetIds = (ctx.discoveredAssetIds ?? new Set()).add(assetId);
      const placed = await insertAndProveClean(ctx, assetId, parent);
      if (typeof placed !== 'object' || placed === null || 'error' in placed) return placed;

      // AFTER the asset is proven clean and in the place, and never before: the ledger
      // records what a project actually uses, and an insertion that was refused is not
      // a use. Failures here are swallowed on purpose — an attribution row is a record
      // ABOUT the build, and losing one must not undo a placement that succeeded.
      //
      // WHAT A LOST WRITE ACTUALLY COSTS, stated correctly. An earlier version of this
      // comment claimed it "degrades into a visible unaccounted" — it does not. The
      // report reads `project_asset_use`, so a row that was never written is not
      // unaccounted, it is ABSENT, and the asset simply does not appear. The key-space
      // argument covers a row that was written with a sentinel; it cannot cover a row
      // that does not exist. `recorded: false` therefore goes into the tool result, so
      // the loss is at least visible in the transcript and the audit log rather than
      // nowhere, and the panel's footer says a clean result covers only what is listed.
      const recorded = await recordPlacedAsset(ctx, assetId, parent);

      return {
        ...placed,
        provenance,
        // `null` means there was no project to attribute to at all — the eval harness
        // and the admin run-tool route. Saying "recorded: false" there would report a
        // failure that never happened.
        ...(recorded ? { attribution: recorded } : {}),
        ...(fromLibrary && !verdict.ok ? { waivedForLibraryAsset: verdict.reasons } : {}),
      };
    },
  },
  generate_model: {
    def: {
      name: 'generate_model',
      description:
        "Generate a 3D model from text with Roblox's own GenerationService, then QC it automatically. Free, ~20s, 10/min. Use ONLY for what procedural geometry cannot do: organic silhouettes, curved vehicle bodywork, one bespoke hero prop. The result is session-scoped and does not survive save/publish. The returned QC verdict is authoritative — if it fails, fix or discard; success does not mean good.",
      parameters: S(
        {
          prompt: { type: 'string' },
          intent: { type: 'string', description: 'what it is meant to be, e.g. "tree" or "lamp post" — drives the scale check' },
          maxTriangles: { type: 'number', description: 'default 6000' },
          predefinedSchema: { type: 'string', enum: ['Body1', 'Car5'] },
          parent: { type: 'string' },
        },
        ['prompt'],
      ),
    },
    studio: true,
    run: (ctx, a) =>
      op(
        ctx,
        {
          op: 'generate_model',
          prompt: String(a.prompt ?? ''),
          intent: a.intent ? String(a.intent) : undefined,
          maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
          predefinedSchema: a.predefinedSchema ? String(a.predefinedSchema) : undefined,
          parent: String(a.parent ?? 'game.Workspace'),
        },
        120_000,
      ),
  },
  inspect_model: {
    def: {
      name: 'inspect_model',
      description:
        'Measure an inserted or generated model against the QC gate: triangle count, bounding box, scale plausibility for its intent, pivot offset from its base, orientation, texturing, collision, anchoring, and whether it contains scripts. Returns per-check pass/fail plus concrete fixes.',
      parameters: S({ path: { type: 'string' }, intent: { type: 'string' } }, ['path']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'inspect_model', path: String(a.path ?? ''), intent: a.intent ? String(a.intent) : undefined }, 45_000),
  },
  generate_image: {
    def: {
      name: 'generate_image',
      description:
        "Generate an original 2D image — UI icon, decal, tiling texture, thumbnail or concept study — art-directed to the Roblox simulator style (thick near-black outlines, saturated colour, chunky flat-shaded forms). Describe the SUBJECT only and set the structured fields; the style grammar is applied for you, so do not write 'roblox style' into the subject. Two things are refused rather than attempted: words baked into the image (put type in a TextLabel with a UIStroke instead — it is sharper and stays editable) and logos or brand marks (use the provider's own official asset). The result reports a deterministic flatness check: 'too_detailed' means the render came back realistic and should be regenerated or discarded. The pixels are parked under `imageKey` for an hour; there is NOT yet a path that uploads them to Roblox or applies them to a Decal, so never tell the user the image has been placed.",
      parameters: S(
        {
          subject: { type: 'string', description: 'What to draw, as a plain noun phrase. No words to render, no brand names.' },
          target: { type: 'string', enum: ['ui_icon', 'decal', 'texture', 'thumbnail', 'concept'] },
          palette: {
            type: 'array',
            description: 'Palette roles from the style spec, e.g. ["currency_soft"] for a coin or ["grass","dirt"] for ground.',
            items: { type: 'string', enum: ['grass', 'dirt', 'stone', 'cliff', 'foliage', 'wood', 'sky', 'sand', 'accent', 'positive', 'danger', 'premium', 'currency_soft', 'currency_hard', 'locked'] },
          },
          outline: { type: 'string', enum: ['heavy', 'very_heavy'], description: 'default heavy; the style never uses a thin outline' },
          lowPoly: { type: 'string', enum: ['flat_vector', 'chunky_low_poly', 'blocky'] },
          lighting: { type: 'string', enum: ['flat', 'high_key', 'clear_daylight'] },
          camera: { type: 'string', enum: ['straight_on', 'three_quarter', 'isometric', 'top_down'] },
          background: { type: 'string', enum: ['flat_solid', 'soft_vignette_free', 'sky', 'plain_white'] },
          aspect: { type: 'string', enum: ['1:1', '4:3', '3:4', '16:9', '9:16'], description: 'composition hint; the canvas itself is square' },
          steps: { type: 'number', description: '1-8, default 4' },
          seed: { type: 'number' },
        },
        ['subject', 'target'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const req: ImageRequest = {
        subject: String(a.subject ?? ''),
        target: (a.target as ImageRequest['target']) ?? 'ui_icon',
        palette: Array.isArray(a.palette) ? (a.palette as PaletteRole[]) : undefined,
        outline: a.outline as ImageRequest['outline'],
        lowPoly: a.lowPoly as ImageRequest['lowPoly'],
        lighting: a.lighting as ImageRequest['lighting'],
        camera: a.camera as ImageRequest['camera'],
        background: a.background as ImageRequest['background'],
        aspect: a.aspect as ImageRequest['aspect'],
        steps: a.steps ? Number(a.steps) : undefined,
        seed: a.seed ? Number(a.seed) : undefined,
      };
      const res = await generateImage(ctx.env, req);
      // A refusal is a result, not a crash: the model gets told what to do instead.
      if ('refused' in res) return { error: res.message, reason: res.reason, offending: res.offending };
      // The pixels never enter the transcript — a base64 PNG is ~230k characters of nothing the
      // model can read. They go to KV under a key, exactly as render_view keeps frames out.
      // No project, no parking spot. The pixels are addressed by project, so a tool call with no
      // project (the admin single-tool route) has nowhere legitimate to put them and must say so
      // rather than fall back to an unscoped key nobody can authorise a read against.
      if (!ctx.projectId) return { error: 'generate_image needs a project to store the result against' };
      const imageKey = await storeImage(ctx.env, res.pngBase64, ctx.projectId);
      return {
        imageKey,
        width: res.width,
        height: res.height,
        bytes: res.bytes,
        steps: res.steps,
        flatness: res.flatness.verdict,
        flatnessNote: res.flatness.note,
        aspectHonoured: res.aspectHonoured,
        prompt: res.prompt,
      };
    },
  },
  search_docs: {
    def: {
      name: 'search_docs',
      description: 'Search official Roblox documentation (APIs, services, properties, guides). Use when unsure about an API.',
      parameters: S({ query: { type: 'string' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const hits = await searchDocs(ctx.env, String(a.query ?? ''), 5);
      return hits.map((h) => ({ title: h.title, url: h.url, excerpt: h.text.slice(0, 900) }));
    },
  },
  remember: {
    def: {
      name: 'remember',
      description: 'Save a durable fact to project memory (decisions, conventions, user preferences).',
      parameters: S({ fact: { type: 'string' } }, ['fact']),
    },
    studio: false,
    run: async (ctx, a) => {
      await ctx.addMemoryFact(String(a.fact ?? ''));
      return { saved: true };
    },
  },
  create_checkpoint: {
    def: {
      name: 'create_checkpoint',
      description: 'Save a restorable checkpoint of the project (scripts + instance tree). Do this before large changes.',
      parameters: S({ label: { type: 'string' } }, ['label']),
    },
    studio: true,
    run: async (ctx, a) => ctx.createCheckpoint(String(a.label ?? 'checkpoint'), 'auto'),
  },
};

export function toolNames(): string[] {
  return Object.keys(TOOLS);
}

/**
 * Tools the model may call, given what this deployment can actually do.
 *
 * `assetLibrary: false` removes `search_asset_library` rather than leaving it to fail. The system
 * prompt tells the model to try it FIRST, and on a deployment where the tables were never created
 * every one of those calls returned `no such table` — a wasted inference step on every build that
 * reaches for an asset, and a raw SQL string the model could do nothing with.
 *
 * Removing it is not the same as pretending the library is empty. `search_asset_library` keeps its
 * loud missing-table branch for any path that still reaches it; this only stops OFFERING a tool
 * that cannot work here.
 */
export function toolDefs(
  studioConnected: boolean,
  allowed?: Set<string>,
  opts: { assetLibrary?: boolean } = {},
): GatewayToolDef[] {
  const assetLibrary = opts.assetLibrary ?? true;
  return Object.entries(TOOLS)
    .filter(([name, t]) => (studioConnected || !t.studio) && (!allowed || allowed.has(name)))
    .filter(([name]) => assetLibrary || name !== 'search_asset_library')
    .map(([, t]) => t.def);
}

/**
 * The largest structured result we will hand to the browser.
 *
 * The `detail` payload exists so the web app's typed generative-UI validator
 * has something real to validate — before this it was always undefined, which
 * silently made the entire component registry dead outside mock mode. It is
 * capped independently of MAX_RESULT_CHARS because the two limits protect
 * different things: that one protects the model's context, this one protects
 * the WebSocket.
 */
const MAX_DETAIL_CHARS = 24_000;

/**
 * The cap for an explicit UI payload, which is a different thing from a derived one.
 *
 * MAX_DETAIL_CHARS protects the socket from tool results that are ALSO re-sent to the model every
 * step. An evidence panel is sent once, on one tool row, and carries an encoded image. The socket
 * already streams 200KB playtest frames (frame-bus.ts), so the constraint here is "one screenshot,
 * not a gallery" rather than "keep it tiny".
 */
const MAX_UI_DETAIL_CHARS = 96_000;

function capUiDetail(value: unknown): unknown {
  try {
    return JSON.stringify(value).length > MAX_UI_DETAIL_CHARS ? undefined : value;
  } catch {
    return undefined;
  }
}

/**
 * Structured results are forwarded to the UI, plain strings are not.
 *
 * A tool that returns a bare string has nothing a component could render, and
 * an `error` result is already conveyed by `ok: false` plus the summary. Only
 * objects that carry actual structure are worth sending.
 */
function detailForUi(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return undefined;
  if ('error' in (result as Record<string, unknown>)) return undefined;
  // Cheap size guard: serialise once and drop anything oversized rather than
  // truncating it into invalid JSON that the validator would reject anyway.
  let encoded: string;
  try {
    encoded = JSON.stringify(result);
  } catch {
    return undefined;
  }
  if (encoded.length > MAX_DETAIL_CHARS) return undefined;
  return result;
}

export async function runTool(
  ctx: AgentCtx,
  name: string,
  argsJson: string,
): Promise<{ summary: string; resultForLlm: string; ok: boolean; detail?: unknown }> {
  const impl = TOOLS[name];
  if (!impl) return { summary: `unknown tool ${name}`, resultForLlm: JSON.stringify({ error: `unknown tool: ${name}` }), ok: false };
  if (impl.studio && !ctx.studioConnected()) {
    return { summary: `${name}: Studio not connected`, resultForLlm: JSON.stringify({ error: 'Studio is not connected. Ask the user to connect Studio, or continue without Studio tools.' }), ok: false };
  }
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { summary: `${name}: bad arguments`, resultForLlm: JSON.stringify({ error: 'arguments were not valid JSON' }), ok: false };
  }
  try {
    ctx.uiDetail = undefined; // never let one tool's panel leak into the next tool's row
    const result = await impl.run(ctx, args);
    let str = typeof result === 'string' ? result : JSON.stringify(result);
    if (str.length > MAX_RESULT_CHARS) str = str.slice(0, MAX_RESULT_CHARS) + `\n...[truncated ${str.length - MAX_RESULT_CHARS} chars]`;
    const failed = typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>);
    // An explicit UI payload wins. It is capped separately and more generously than the derived
    // one: this socket already carries 200KB playtest frames, so a single ~25KB evidence panel per
    // build is not what needs protecting — a 24KB cap sized for re-sent tool results is.
    const detail = ctx.uiDetail !== undefined ? capUiDetail(ctx.uiDetail) : detailForUi(result);
    ctx.uiDetail = undefined;
    return { summary: summarize(name, args, failed), resultForLlm: str, ok: !failed, detail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /* §1: provider and model identity are implementation details and must not
       reach a normal user. This catch used to put the RAW exception into the
       summary, which is broadcast as `tool_end.summary` and rendered verbatim in
       the Thinking card — so a Workers AI failure surfaced to anyone with an
       ordinary account as:

         generate_image failed: AiError: 3040: Request failed for model
         @cf/black-forest-labs/flux-1-schnell on ...

       naming both the model and the provider. The raw text still goes to the
       server log, where admin/diagnostics can read it; what crosses the boundary
       to the user and to the model is scrubbed. */
    console.error(`[tool:${name}] ${msg}`);
    return { summary: `✗ ${name}`, resultForLlm: JSON.stringify({ error: scrubEngineIdentity(msg) }), ok: false };
  }
}

/**
 * Strip anything that names the engine behind Golem.
 *
 * Deliberately a denylist of shapes rather than an allowlist of safe text. An
 * allowlist would also drop the actionable half of an error — "Studio
 * disconnected", "asset not found" — and make the model worse at recovering from
 * a failure it could otherwise handle. The shapes below cover every id this
 * worker can emit: Workers AI model paths are always `@cf/vendor/model`, and the
 * token-billed providers have fixed names.
 *
 * Adding a provider means adding it here. The security suite asserts that a tool
 * error carrying a model id does not survive this function.
 */
export function scrubEngineIdentity(msg: string): string {
  return msg
    .replace(/@cf\/[\w.-]+\/[\w.-]+/g, 'the engine')
    .replace(/\bfor model\s+\S+/gi, 'for the engine')
    .replace(/\b(?:workers-ai|openai|google|deepseek|anthropic|gemini|gpt-[\w.-]+|glm-[\w.-]+)\b/gi, 'the engine')
    .replace(/\bAiError\b/g, 'EngineError')
    .slice(0, 300);
}

function summarize(name: string, args: Record<string, unknown>, failed: boolean): string {
  const target = (args.path ?? args.query ?? args.root ?? args.label ?? args.fact ?? '') as string;
  const t = typeof target === 'string' && target ? ` · ${target.slice(0, 60)}` : '';
  return `${failed ? '✗' : '✓'} ${name}${t}`;
}
