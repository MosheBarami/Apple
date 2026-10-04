/**
 * THE EVIDENCE LEDGER — what this run changed, read back, looked at and played, as facts.
 *
 * It is the one thing the self-check (self-check.ts) stands on. Three consumers read it and nothing
 * else: the completion gate asks "did the work change since the last look" (look-gate.ts), the claim
 * audit asks "does anything this run observed support what the reply says" (claim-audit.ts), and the
 * `look` tool records what it saw (studio-look.ts). It carries FACTS, not opinions: no score, no
 * judgement, no list of subjects. What a fact means for a particular claim is the audit's business.
 *
 * HOW A FACT IS KNOWN matters more than what it says, so every fact carries it:
 *   write  the run set it (a tool call succeeded with that value). Real, but the place may have moved on.
 *   read   a tool read it back from the place. Outranks an earlier write.
 *   play   a real player's screen showed it during a Test session.
 * and WHEN it was known (`seq`, and `mutationSeq`, the number of successful changes so far), so a read
 * after the last change can be told from one before it.
 *
 * RUN-SCOPED AND BOUNDED. One ledger per run, stored in its own Durable Object key (never inside the
 * agent state, whose 128 KiB value cap the transcript already presses on). Every list is capped, every
 * string is cut, and a malformed record never throws: a failure to record must not break the run that
 * is being recorded. The ledger is plain JSON so it survives a Durable Object restart unchanged.
 *
 * Pure: the only import is a type-free table of colour words.
 */
import { familyOfLabel, familyOfRgb, type ColourFamily } from './colour-family.ts';
import { rootStudioPath } from './studio-props.ts';

export const LEDGER_LIMITS = Object.freeze({
  entries: 60,
  touched: 60,
  colours: 60,
  texts: 60,
  names: 100,
  looks: 30,
  plays: 8,
  issues: 8,
  textChars: 120,
  entryChars: 200,
  noteChars: 200,
});

export type LedgerKind = 'mutation' | 'read' | 'look' | 'play';
export type LookVerdict = 'seen' | 'not_seen' | 'cannot_tell';

export interface LedgerEntry { seq: number; kind: LedgerKind; tool: string; text: string; ok: boolean; mutationSeq: number }
export interface ColourFact {
  seq: number; mutationSeq: number; path: string; name: string; prop: string;
  via: 'write' | 'read'; family: ColourFamily | null; label?: string;
}
export interface TextFact { seq: number; mutationSeq: number; text: string; where: string; via: 'write' | 'read' | 'play'; visible: boolean | null }
export interface NameFact { seq: number; mutationSeq: number; path: string; name: string; className?: string; via: 'write' | 'read' }
export interface LookFact { seq: number; mutationSeq: number; about: string; verdict: LookVerdict; note: string; source: string }
export interface PlayFact {
  seq: number; mutationSeq: number; tool: string; ok: boolean;
  /** A real player joined and the client answered. False means nothing on screen was observed. */
  observed: boolean;
  verdict: string; errors: number; screens: number; summary: string;
  pressedNoChange: string[]; pressedChanged: string[]; touched: string[];
}

export interface EvidenceLedger {
  v: 1;
  seq: number;
  /** Successful changes so far. A count, never capped. */
  mutationSeq: number;
  /**
   * `mutationSeq` at the last change the viewport could show: one that touched the workspace or the lighting, or whose paths
   * are unknown (assumed in view, so a look is never skipped on a guess). A look can only be owed for these: a screen or a
   * script is not in the picture, and a look at it would be a look at something else.
   */
  viewChangedSeq: number;
  entries: LedgerEntry[];
  /** Paths the run changed, newest last. The default subject of a look. */
  touched: string[];
  colours: ColourFact[];
  texts: TextFact[];
  names: NameFact[];
  looks: LookFact[];
  plays: PlayFact[];
  lookIssues: string[];
  /** Every look attempt, successful or not: this is what the per-run cap counts. */
  lookCount: number;
  lookFailures: number;
  /** Looks the gate itself ran, and the rounds it has sent the agent back, so each bound survives a restart. */
  forcedLooks: number;
  repairRounds: number;
  auditRounds: number;
  /** Blind critiques run (blind-critique.ts). Optional so a ledger stored before it existed reads as zero. */
  criticRounds?: number;
  /** Paths of models this run placed (a mutation whose result lists `inserted` paths), newest last: what a composer can be told to use. */
  inserted?: string[];
  /** `mutationSeq` at the last look that actually looked; null before any. */
  lastLookMutationSeq: number | null;
  /** `mutationSeq` when a look attempt last FAILED; the gate does not demand a look that just could not run. */
  lastLookFailedAt: number | null;
}

export function newLedger(): EvidenceLedger {
  return {
    v: 1, seq: 0, mutationSeq: 0, viewChangedSeq: 0, entries: [], touched: [], colours: [], texts: [], names: [], looks: [], plays: [],
    lookIssues: [], lookCount: 0, lookFailures: 0, forcedLooks: 0, repairRounds: 0, auditRounds: 0, lastLookMutationSeq: null, lastLookFailedAt: null,
  };
}

/**
 * Changed, in a way the viewport can show, since the last look that looked. False for a run that has changed nothing, and for one
 * that only changed screens and scripts. STRUCTURAL: it reads where the change landed, never what the request was about.
 */
export function lookNeeded(l: EvidenceLedger): boolean {
  return l.viewChangedSeq > (l.lastLookMutationSeq ?? 0);
}

/** The services a camera in edit mode draws: the workspace (terrain included) and the lighting that lights it. */
const VIEWABLE = /^game\.(?:Workspace|Lighting)(?:$|[.[])/;

/**
 * A change the viewport could show moves `viewChangedSeq`. Three things make it so, and the first two cannot be argued with:
 *   - the tool is one that builds in the world (`world`: a composer, an object or model placement, terrain), whatever paths it
 *     happens to report: composites report few paths, in other shapes, or none (round 2 of game 1: compose_game reported none);
 *   - the paths are unknown (assumed in view, so a look is never skipped on a guess);
 *   - any path is in the workspace or the lighting (paths are normalised first: `Workspace.X` is `game.Workspace.X`).
 * Only a change whose every reported path is a screen, a script or a service stays out of the picture.
 */
function noteChange(l: EvidenceLedger, paths: string[], world = false): void {
  if (world || paths.length === 0 || paths.some((p) => VIEWABLE.test(p))) l.viewChangedSeq = l.mutationSeq;
}

// ------------------------------------------------------------------------------------ helpers ---

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** A Studio path in any spelling a tool or a result uses (`Workspace.X`, `workspace.X`, `game.Workspace.X`), rooted at `game`; undefined for anything else. */
const asPath = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || v.length > 400) return undefined;
  const p = rootStudioPath(v.trim());
  return /^game(\.|\[|$)/.test(p) ? p : undefined;
};

function pushCapped<T>(list: T[], item: T, cap: number): void {
  list.push(item);
  if (list.length > cap) list.splice(0, list.length - cap);
}

/** Roblox paths escape a name that is not a plain identifier as ["..."]; the ledger must agree with what Studio reports. */
function joinPath(parent: string, name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${parent}.${name}` : `${parent}[${JSON.stringify(name)}]`;
}

function lastSegment(path: string | undefined): string {
  if (!path) return '';
  const m = /(?:\.([A-Za-z_][A-Za-z0-9_]*)|\["((?:[^"\\]|\\.)*)"\])$/.exec(path);
  return m ? (m[1] ?? m[2] ?? '') : path;
}

const COLOUR_KEY = /^(Color|Color3|BrickColor|BackgroundColor3|TextColor3|BorderColor3|ImageColor3|TextStrokeColor3)$/;
const TEXT_KEY = /^(Text|PlaceholderText|ContentText)$/;

function colourOf(v: unknown): { family: ColourFamily | null; label?: string } | null {
  if (isObj(v) && v.t === 'Color3') return { family: familyOfRgb(v.v) };
  if (isObj(v) && v.t === 'BrickColor' && typeof v.v === 'string') return { family: familyOfLabel(v.v), label: cut(v.v, 40) };
  if (Array.isArray(v) && v.length === 3) return { family: familyOfRgb(v) };
  return null;
}

function textOf(v: unknown): string | null {
  const raw = isObj(v) && v.t === 'string' ? v.v : v;
  return typeof raw === 'string' && raw.trim() ? cut(raw.trim(), LEDGER_LIMITS.textChars) : null;
}

class Recorder {
  // Plain fields, not parameter properties: this file is also loaded by node's strip-only TypeScript.
  readonly l: EvidenceLedger;
  readonly seq: number;
  constructor(l: EvidenceLedger, seq: number) {
    this.l = l;
    this.seq = seq;
  }

  colour(path: string, name: string, prop: string, value: unknown, via: 'write' | 'read'): void {
    const c = colourOf(value);
    if (!c) return;
    const { l, seq } = this;
    const same = l.colours.findIndex((f) => f.path === path && f.prop === prop && f.via === via);
    if (same >= 0) l.colours.splice(same, 1);
    pushCapped(l.colours, { seq, mutationSeq: l.mutationSeq, path, name, prop, via, family: c.family, ...(c.label ? { label: c.label } : {}) }, LEDGER_LIMITS.colours);
  }

  text(text: string, where: string, via: 'write' | 'read' | 'play', visible: boolean | null): void {
    const { l, seq } = this;
    const same = l.texts.findIndex((f) => f.text === text && f.where === where && f.via === via);
    if (same >= 0) l.texts.splice(same, 1);
    pushCapped(l.texts, { seq, mutationSeq: l.mutationSeq, text, where, via, visible }, LEDGER_LIMITS.texts);
  }

  name(path: string, name: string, className: string | undefined, via: 'write' | 'read'): void {
    const { l, seq } = this;
    const same = l.names.findIndex((f) => f.path === path);
    if (same >= 0) l.names.splice(same, 1);
    pushCapped(l.names, { seq, mutationSeq: l.mutationSeq, path, name, ...(className ? { className } : {}), via }, LEDGER_LIMITS.names);
  }

  props(props: unknown, path: string, name: string, via: 'write' | 'read'): void {
    if (!isObj(props)) return;
    // The label's own Visible property: the one static fact that can say its text is NOT shown. True says nothing (an ancestor
    // may still hide it), so it only ever clears an earlier "hidden"; whether a player sees it is a player check's to say.
    const shown = isObj(props.Visible) && props.Visible.t === 'bool' ? props.Visible.v : undefined;
    const hidden = shown === false ? false : null;
    for (const [key, value] of Object.entries(props)) {
      if (COLOUR_KEY.test(key)) this.colour(path, name, key, value, via);
      else if (TEXT_KEY.test(key)) {
        const t = textOf(value);
        if (t) this.text(t, path, via, hidden);
      }
    }
    if (shown !== undefined) {
      for (const f of this.l.texts) if (f.where === path && f.via !== 'play') f.visible = hidden;
    }
  }
}

function touch(l: EvidenceLedger, path: string): void {
  const at = l.touched.indexOf(path);
  if (at >= 0) l.touched.splice(at, 1);
  pushCapped(l.touched, path, LEDGER_LIMITS.touched);
}

function forget(l: EvidenceLedger, path: string): void {
  const gone = (p: string) => p === path || p.startsWith(`${path}.`) || p.startsWith(`${path}[`);
  l.colours = l.colours.filter((f) => !gone(f.path));
  l.names = l.names.filter((f) => !gone(f.path));
  l.touched = l.touched.filter((p) => !gone(p));
  l.texts = l.texts.filter((f) => !gone(f.where));
}

// ---------------------------------------------------------------------- what a call wrote ---

/** Walk create-style item specs, recording what they wrote. Returns every path the specs name. */
function walkSpecs(rec: Recorder, items: unknown, parent: string, out: string[], depth = 0): void {
  if (!Array.isArray(items) || depth > 6) return;
  for (const raw of items.slice(0, 200)) {
    if (!isObj(raw)) continue;
    const name = str(raw.name);
    const parentPath = asPath(raw.parent) ?? parent;
    const path = name ? joinPath(parentPath, name) : undefined;
    if (path) {
      out.push(path);
      rec.name(path, name!, str(raw.className), 'write');
      rec.props(raw.props, path, name!, 'write');
    }
    walkSpecs(rec, raw.children, path ?? parentPath, out, depth + 1);
  }
}

const PATH_KEYS = ['path', 'parent', 'target', 'root', 'model', 'container', 'from', 'to'];
const PATH_LIST_KEYS = ['paths', 'targets', 'created', 'inserted', 'placed', 'moved'];

function pathsIn(value: unknown, out: string[]): void {
  if (!isObj(value)) return;
  for (const k of PATH_KEYS) { const p = asPath(value[k]); if (p) out.push(p); }
  for (const k of PATH_LIST_KEYS) {
    const list = value[k];
    if (Array.isArray(list)) for (const raw of list.slice(0, 100)) { const p = asPath(raw); if (p) out.push(p); }
  }
  if (Array.isArray(value.moves)) for (const m of value.moves.slice(0, 100)) { const p = isObj(m) ? asPath(m.path) : undefined; if (p) out.push(p); }
}

/** Record a successful change; returns the paths it touched, for the entry's one-line description. */
function recordMutation(rec: Recorder, tool: string, args: Record<string, unknown>, result: unknown, world: boolean): string[] {
  const { l } = rec;
  l.mutationSeq += 1;
  const paths: string[] = [];
  if (tool === 'delete_instances') {
    const gone: string[] = [];
    pathsIn(args, gone);
    for (const p of gone) forget(l, p);
    noteChange(l, gone, world);
    return gone;
  }
  walkSpecs(rec, args.items, 'game.Workspace', paths);
  pathsIn(args, paths);
  pathsIn(result, paths);
  // set_properties, set_properties_bulk and friends: props written to a path or a list of them.
  if (isObj(args.props)) {
    const targets = [args.path, ...(Array.isArray(args.targets) ? args.targets : []), ...(Array.isArray(args.paths) ? args.paths : [])]
      .map(asPath).filter((p): p is string => !!p);
    for (const p of targets.slice(0, 50)) rec.props(args.props, p, lastSegment(p), 'write');
  }
  if (isObj(result)) for (const k of ['created', 'inserted']) {
    const list = result[k];
    if (Array.isArray(list)) for (const raw of list.slice(0, 100)) { const p = asPath(raw); if (p && !l.names.some((n) => n.path === p)) rec.name(p, lastSegment(p), undefined, 'write'); }
  }
  if (isObj(result) && Array.isArray(result.inserted)) {
    for (const raw of result.inserted.slice(0, 20)) {
      const p = asPath(raw);
      if (p && !(l.inserted ?? []).includes(p)) pushCapped((l.inserted ??= []), p, LEDGER_LIMITS.touched);
    }
  }
  const unique = [...new Set(paths)];
  for (const p of unique) touch(l, p);
  noteChange(l, unique, world);
  return unique;
}

// ----------------------------------------------------------------------- what a read saw ---

function walkRead(rec: Recorder, node: unknown, ctxPath: string | undefined, budget: { n: number }, depth = 0): void {
  if (budget.n <= 0 || depth > 7) return;
  budget.n -= 1;
  if (Array.isArray(node)) {
    for (const child of node.slice(0, 200)) walkRead(rec, child, ctxPath, budget, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  const own = asPath(node.path);
  const path = own ?? ctxPath;
  const name = str(node.name) ?? lastSegment(path);
  if (isObj(node.props) && path) rec.props(node.props, path, name, 'read');
  if (own && str(node.name)) rec.name(own, node.name as string, str(node.class) ?? str(node.className), 'read');
  const root = asPath(node.root);
  if (typeof node.outline === 'string' && root) namesFromOutline(rec, root, node.outline);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'props' || key === 'outline') continue;
    if (typeof value === 'object' && value !== null) walkRead(rec, value, key === 'children' ? path : ctxPath, budget, depth + 1);
  }
}

/** get_project_tree hands the agent an indented outline of "Name (Class)" lines; rebuild the paths from the indentation. */
function namesFromOutline(rec: Recorder, root: string, outline: string): void {
  const stack: string[] = [];
  for (const line of outline.split('\n').slice(0, 400)) {
    const m = /^(\s*)(.+?) \(([A-Za-z0-9_]+)\)/.exec(line);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 2);
    const name = m[2]!;
    stack.length = Math.min(stack.length, depth);
    const path = depth === 0 ? root : joinPath(stack[depth - 1] ?? root, name);
    stack[depth] = path;
    if (depth > 0) rec.name(path, name, m[3], 'read');
  }
}

// -------------------------------------------------------------------------- what a play saw ---

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function recordPlay(rec: Recorder, tool: string, ok: boolean, result: unknown, extra: unknown): void {
  const { l, seq } = rec;
  const res = isObj(result) ? result : {};
  const raw = isObj(extra) ? extra : null;
  const verdict = str(res.verdict) ?? (raw ? 'raw' : 'unknown');
  const observed = raw
    ? raw.playerJoined === true && raw.characterSpawned === true && raw.clientReported === true
    : ok && !['no_report', 'no_player', 'unknown'].includes(verdict);
  const errors = Array.isArray(res.clientErrors) || Array.isArray(res.serverErrors)
    ? list(res.clientErrors).length + list(res.serverErrors).length
    : raw ? list(raw.clientErrors).length + list(raw.serverErrors).length : 0;

  let screens = 0;
  if (raw && observed) {
    for (const gui of list(raw.screenGuis)) {
      if (!isObj(gui)) continue;
      screens += 1;
      const enabled = gui.enabled !== false;
      const where = `PlayerGui.${str(gui.name) ?? '?'}`;
      for (const label of list(gui.labels).slice(0, 60)) {
        if (!isObj(label)) continue;
        const t = textOf(label.text);
        if (t) rec.text(t, `${where}.${str(label.name) ?? '?'}`, 'play', enabled && label.visible === true);
      }
    }
  } else if (observed && typeof res.playerSees === 'string') {
    for (const segment of res.playerSees.split(' | ')) {
      const gui = /ScreenGui "([^"]*)" \(([^)]*)\)(?::\s*(.*))?/.exec(segment);
      if (!gui) continue;
      screens += 1;
      const enabled = !/^DISABLED/i.test(gui[2] ?? '');
      const visible = /visible text (.*?)(?:;\s*hidden:|\.$|$)/.exec(gui[3] ?? '');
      if (visible) for (const t of visible[1]!.matchAll(/"([^"]*)"\s*\[([^\]]*)\]/g)) {
        const text = textOf(t[1]);
        if (text) rec.text(text, `PlayerGui.${gui[1]}.${t[2]}`, 'play', enabled);
      }
    }
  }

  const pressedNoChange: string[] = [];
  const pressedChanged: string[] = [];
  for (const press of list(res.presses)) {
    if (typeof press !== 'string') continue;
    const at = press.indexOf(':');
    const path = at > 0 ? press.slice(0, at) : press.slice(0, 80);
    if (/pressed, and the button activated/.test(press)) (/NOTHING changed/.test(press) ? pressedNoChange : pressedChanged).push(cut(path, 160));
  }
  const touched = list(res.touches).filter((t): t is string => typeof t === 'string' && /walked onto it/.test(t) && !/move failed/.test(t))
    .map((t) => cut(t.slice(0, t.indexOf(':') > 0 ? t.indexOf(':') : 80), 160));

  pushCapped(l.plays, {
    seq, mutationSeq: l.mutationSeq, tool, ok, observed, verdict, errors, screens,
    summary: cut(str(res.playerSees) ?? str(res.note) ?? '', 300),
    pressedNoChange: pressedNoChange.slice(0, 8), pressedChanged: pressedChanged.slice(0, 8), touched: touched.slice(0, 8),
  }, LEDGER_LIMITS.plays);
}

// ------------------------------------------------------------------------------- entry points ---

export interface ToolRecord {
  tool: string;
  kind: 'mutation' | 'read' | 'play';
  args: unknown;
  result: unknown;
  ok: boolean;
  /** A raw Studio payload the tool computed from the same read, when the model-facing result is a summary of it. */
  extra?: unknown;
  /**
   * A composite tool that FAILED after an earlier step already changed the place. The place did change, so the
   * change counter moves and the paths are remembered; what it wrote is not trusted, so no colour or text is.
   */
  partial?: boolean;
  /** The tool builds in the world (a composer, a model or object placement, terrain): its change is in the picture whatever paths it reports. */
  world?: boolean;
}

function describe(c: ToolRecord, touchedNow: string[]): string {
  const args = isObj(c.args) ? c.args : {};
  const subject = touchedNow.slice(0, 3).join(', ') || str(args.path) || '';
  const res = isObj(c.result) ? c.result : {};
  const note = c.ok ? (str(res.verdict) ?? '') : cut(str(res.error) ?? 'failed', 80);
  return cut(`${c.tool}${subject ? ` ${subject}` : ''}${note ? ` — ${note}` : ''}`, LEDGER_LIMITS.entryChars);
}

/** Record one finished tool call. Never throws. */
export function recordToolCall(l: EvidenceLedger, c: ToolRecord): void {
  try {
    l.seq += 1;
    const rec = new Recorder(l, l.seq);
    const args = isObj(c.args) ? c.args : {};
    let touchedNow: string[] = [];
    if (c.ok) {
      if (c.kind === 'mutation') touchedNow = recordMutation(rec, c.tool, args, c.result, c.world === true);
      else if (c.kind === 'read') {
        const budget = { n: 1500 };
        walkRead(rec, c.result, undefined, budget);
        if (c.extra !== undefined) walkRead(rec, c.extra, undefined, budget);
      } else recordPlay(rec, c.tool, true, c.result, c.extra);
    } else if (c.kind === 'play') {
      recordPlay(rec, c.tool, false, c.result, undefined);
    } else if (c.kind === 'mutation' && c.partial) {
      l.mutationSeq += 1;
      const paths: string[] = [];
      // Walked into a scratch ledger: the names are wanted, the facts are not.
      walkSpecs(new Recorder(newLedger(), 0), args.items, 'game.Workspace', paths);
      pathsIn(args, paths);
      pathsIn(c.result, paths);
      touchedNow = [...new Set(paths)];
      for (const p of touchedNow) touch(l, p);
      noteChange(l, touchedNow, c.world === true);
    }
    pushCapped(l.entries, { seq: l.seq, kind: c.kind, tool: c.tool, text: describe(c, touchedNow), ok: c.ok, mutationSeq: l.mutationSeq }, LEDGER_LIMITS.entries);
  } catch {
    // A ledger that cannot record a call is a ledger with a gap, which the audit already treats as "not checked".
  }
}

export interface LookRecord {
  ok: boolean;
  source: string;
  views: string[];
  observations: { about: string; verdict: LookVerdict; note: string }[];
  answers: { question: string; answer: string; verdict?: LookVerdict }[];
  issues: string[];
  error?: string;
}

/** Record one look attempt. Never throws. */
export function recordLook(l: EvidenceLedger, r: LookRecord): void {
  try {
    l.seq += 1;
    l.lookCount += 1;
    if (r.ok) {
      l.lastLookMutationSeq = l.mutationSeq;
      for (const o of r.observations.slice(0, 12)) {
        pushCapped(l.looks, { seq: l.seq, mutationSeq: l.mutationSeq, about: cut(o.about, 120), verdict: o.verdict, note: cut(o.note, LEDGER_LIMITS.noteChars), source: r.source }, LEDGER_LIMITS.looks);
      }
      for (const a of r.answers.slice(0, 4)) {
        pushCapped(l.looks, { seq: l.seq, mutationSeq: l.mutationSeq, about: cut(a.question, 120), verdict: a.verdict ?? 'cannot_tell', note: cut(a.answer, LEDGER_LIMITS.noteChars), source: r.source }, LEDGER_LIMITS.looks);
      }
      l.lookIssues = r.issues.slice(0, LEDGER_LIMITS.issues).map((s) => cut(s, LEDGER_LIMITS.noteChars));
    } else {
      l.lookFailures += 1;
      l.lastLookFailedAt = l.mutationSeq;
    }
    const count = (v: LookVerdict) => r.observations.filter((o) => o.verdict === v).length;
    pushCapped(l.entries, {
      seq: l.seq, kind: 'look', tool: 'look', ok: r.ok, mutationSeq: l.mutationSeq,
      text: r.ok
        ? `look (${r.source}, ${r.views.join('/') || 'one view'}): ${count('seen')} seen, ${count('not_seen')} not seen, ${count('cannot_tell')} cannot tell`
        : cut(`look failed: ${r.error ?? 'could not look'}`, LEDGER_LIMITS.entryChars),
    }, LEDGER_LIMITS.entries);
  } catch {
    /* see recordToolCall */
  }
}

/**
 * The ledger as plain lines for a model that must judge a reply against it. Oldest first, so the line a
 * later fact supersedes comes before it; cut from the FRONT when it does not fit, so the newest survive.
 */
export function ledgerDigest(l: EvidenceLedger, maxChars: number): string {
  const how = (via: string) => (via === 'write' ? 'set by this run' : via === 'read' ? 'read back from the place' : 'seen by a player');
  const rows: { seq: number; line: string }[] = [
    ...l.entries.map((e) => ({ seq: e.seq, line: `#${e.seq} ${e.kind}${e.ok ? '' : ' (failed)'}: ${e.text}` })),
    ...l.colours.map((c) => ({ seq: c.seq, line: `#${c.seq} colour of ${c.path} (${c.prop}) is ${c.label ?? c.family ?? 'unknown'}, ${how(c.via)}` })),
    ...l.texts.map((t) => ({ seq: t.seq, line: `#${t.seq} text "${t.text}" at ${t.where}, ${how(t.via)}${t.visible === true ? ', visible' : t.visible === false ? ', HIDDEN' : ''}` })),
    ...l.looks.map((o) => ({ seq: o.seq, line: `#${o.seq} look ${o.verdict.replace('_', ' ')}: ${o.about} — ${o.note}` })),
    ...l.plays.map((p) => ({ seq: p.seq, line: `#${p.seq} play ${p.verdict}${p.observed ? '' : ' (nothing observed)'}, ${p.errors} error(s): ${p.summary}` })),
  ].sort((a, b) => a.seq - b.seq);
  let text = rows.map((r) => r.line).join('\n');
  while (text.length > maxChars && rows.length > 1) {
    rows.shift();
    text = rows.map((r) => r.line).join('\n');
  }
  return text.length > maxChars ? text.slice(-maxChars) : text;
}
