// security.mjs — §4 of docs/SOURCE-INTELLIGENCE.md: the gate that decides what must never be
// learned from. It runs second in the pipeline, immediately after provenance, so a malicious
// loader never reaches a chunker, an embedder, or a reviewer's clipboard.
//
// Analysis is static and offline. This module imports nothing, executes nothing, and takes no
// `fetchImpl`, because there is no question about a source it could answer by asking the network
// that would be worth the risk of asking.
//
// ---------------------------------------------------------------------------------------------
// CALIBRATION, which is the whole design.
//
// apps/worker/src/assets.ts carries a sibling scanner pointed at a stranger's model landing in a
// paying customer's place. There, `HttpService` is critical and the mere existence of a script is
// a finding, because a decoration has no business running code. That calibration is right for that
// gate and wrong for this one.
//
// This scanner is pointed at the opposite population: whole repositories of legitimate game code,
// where HttpService, RemoteEvents, `require`, and long data tables are the ordinary furniture of
// the craft. A scanner that condemns ordinary game code is a scanner someone switches off, and a
// switched-off scanner is worse than no scanner, because it also carries a false assurance.
//
// So severity is assigned by *how impossible the signal is in honest code*:
//
//   high    cannot occur in legitimate Roblox game code at all. Executor-only globals, which do
//           not exist in the Roblox Luau sandbox; `game:HttpGet`, which is not a Roblox API;
//           `require(<asset id>)`; `.ROBLOSECURITY`. One of these condemns a file on its own.
//   medium  suspicious in the aggregate, ordinary in isolation. `loadstring`, `getfenv`, the word
//           "autofarm", a base64 blob. Recorded for a reviewer; never disqualifying alone. These
//           become high only through a NAMED combination (see PROMOTIONS) — never through a
//           generic "two mediums" rule, which would condemn the first UI module that embeds an
//           icon as base64 on one long line.
//   low     ordinary, recorded only so combinations can be reasoned about. `HttpService` is the
//           whole category: an analytics POST is normal, an analytics POST feeding `loadstring`
//           is not, and the only way to say the second is to have noticed the first.
//
// "Default to unsafe on ambiguity" (§4) is honoured, but *ambiguous* here means one narrow thing:
// the source could not be fully inspected — unreadable, or longer than the scan cap so only a
// prefix was examined. It does not mean "contains a string I recognise". A recognised string with
// an innocent reading is a medium signal, which is a note, not a verdict.
//
// MEASURED, not asserted. Run over this repository's own 29 real Luau files — the whole
// crystal-canyon simulator (datastores, remotes, purchases, a code-redemption system) and the
// Studio plugin — 28 come back clean with ZERO signals of any severity. The 29th is
// apps/plugin/globalTypes.d.luau, a 694 KB generated Roblox API type dump, which is past the scan
// cap and is therefore reported `unscannable` rather than cleared or maligned. That is the
// intended result on all 29.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS DOES NOT CATCH, written down so nobody mistakes a pass for a guarantee.
//
// This is a static scanner over text. A determined author who splits a payload across several
// files, assembles a dangerous name from pieces this module does not model, or hides intent in
// data a Luau interpreter would have to run to unfold, will get a clean verdict. Three specific
// gaps are known and deliberate:
//
//   - Signals are not combined across files (see scanTree). Closing that would catch a split hub
//     and would also condemn every anti-cheat repository in the corpus. The trade is taken.
//   - An unresolvable `require(x)` is not a signal. It is the ordinary way every Roblox codebase
//     is assembled, and flagging it would flag the corpus.
//   - Dense, well-formed code that simply IS a cheat — no executor globals, no loader, no
//     obfuscation, just a clean implementation of an exploit — is only reached by vocabulary,
//     and vocabulary is deliberately weak here.
//
// A clean verdict therefore means "no signal this scanner models", which is what the pipeline
// treats it as: one gate of several, before licence classification and human review, not a
// certificate. §4's quarantine is recorded rather than silent for the same reason.

/** Severity vocabulary, pinned by the SecurityVerdict type other intake modules build against. */
const SEVERITY_ORDER = { low: 1, medium: 2, high: 3 };

/** Worse of two severities. Rolls signals up to a file, and files up to a tree. */
export function worstSeverity(a, b) {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

/**
 * Thresholds, each with the reason it sits where it does. Exported so a test can pin them: a
 * threshold that can drift silently is a threshold that will.
 */
export const SCAN_LIMITS = {
  /** Beyond this only a prefix is examined, and a partial look cannot clear a file — it is
   *  reported unscannable instead. Hand-written Luau essentially never approaches 500 KB;
   *  generated data modules occasionally do, and those deserve a human. */
  maxSourceChars: 500_000,
  /** Files examined in one tree. A repository larger than this is not refused for being large —
   *  it is reported unscannable, because clearing 4,000 files and shrugging at the rest is the
   *  kind of assurance that is worse than none. */
  maxFiles: 4_000,
  /** Per verdict. Past this the file is already condemned or already noted; more buys nothing. */
  maxSignals: 24,
  excerptChars: 160,
  /** A line past this is not hand-written. 400 is over three times StyLua's default column limit,
   *  so a formatted repository never reaches it and a long literal table row still fits. */
  longLine: 400,
  /** A line past THIS is a packed payload rather than a long line, and condemns on its own.
   *  Two thousand characters on one line has no honest reading in a source file. */
  packedLine: 2_000,
  /** `\xNN`-style escapes are how a loader hides its vocabulary from exactly this scan. Both
   *  conditions must hold: enough escapes to be a scheme rather than a few control characters,
   *  AND enough of the file covered that the file is encoded rather than merely containing one
   *  escaped string. Honest Luau with a few `\n` and a `\27` terminal code fails both. */
  minEscapes: 20,
  escapeRatio: 0.15,
  /** `..` chains on one line. Twelve is past what a message-building line reaches and into names
   *  assembled at runtime so they cannot be grepped for. Set above the asset scanner's ten
   *  because legitimate game code does build long strings, and this scanner sees far more of it. */
  concatChain: 12,
  /** An unbroken base64-shaped run. 160 characters is longer than any identifier or hash and far
   *  shorter than an embedded image, which is the point: the icon-in-a-UI-module case is expected
   *  to trip this, at medium, and stay safe. */
  base64Run: 160,
  /** Consecutive numeric entries in a table literal. Two hundred is reachable by hand-written
   *  geometry, curve or level data, so it is only a note; a thousand is not — nobody types a
   *  thousand-element numeric literal for data they could have put in a mesh or a JSON asset. */
  numericRun: 200,
  numericRunHigh: 1_000,
  /** `string.char()` calls before text is being reassembled from character codes rather than
   *  written. A handful is a legitimate way to build a control character. */
  charChain: 5,
  /** Lines between creating a Remote and firing it before "created and immediately fired" stops
   *  being a fair description. Past this window the remote is plumbing, which is normal. */
  remoteWindow: 10,
};

/**
 * A file that trips several detectors gets exactly one class, chosen by this order. The order is
 * by SPECIFICITY, not by badness — every class here is equally disqualifying, so the useful thing
 * to hand a reviewer is the most precise available answer to "what is this?". `backdoor` beats
 * `executor` because "requires a module by asset id" tells them more than "is exploit code".
 */
export const SECURITY_CLASSES = [
  'backdoor',
  'remote-payload-loader',
  'credential-theft',
  'executor',
  'obfuscated-loader',
  'exfiltration',
  'suspicious-remote',
  'unscannable',
];

/** The class a single high signal implies on its own. Kinds absent here are never high alone. */
const INTRINSIC_CLASS = {
  'executor-global': 'executor',
  'remote-payload-fetch': 'executor',
  'require-asset-id': 'backdoor',
  'credential-access': 'credential-theft',
  'packed-line': 'obfuscated-loader',
  'escape-density': 'obfuscated-loader',
  'numeric-table': 'obfuscated-loader',
  'phone-home-remote': 'suspicious-remote',
  unscannable: 'unscannable',
};

/**
 * Globals that only exist inside an exploit executor. This is the sharpest knife in the drawer:
 * `hookmetamethod` is not a Roblox API, is not in Luau, and cannot be reached from a game script,
 * so its presence is not evidence of intent — it is evidence of environment. A false positive
 * requires someone to have defined a function of their own by that exact name.
 */
const EXECUTOR_GLOBALS =
  /\b(?:hookfunction|hookmetamethod|getrawmetatable|setreadonly|make_writeable|makewriteable|getgenv|getrenv|getsenv|getreg|getgc|getconnections|firetouchinterest|fireclickdetector|fireproximityprompt|queue_on_teleport|queueonteleport|identifyexecutor|is_synapse_function|checkcaller|islclosure|newcclosure|setclipboard|getnilinstances|getloadedmodules|saveinstance|getcustomasset|protect_gui)\b|\bsyn\s*\.\s*(?:request|protect_gui|crypt|queue_on_teleport)\b/;

/**
 * Cheat vocabulary. Every one of these has an innocent reading — an anti-cheat module documents
 * the attacks it blocks, and "Auto Farm" is a perfectly ordinary simulator gamepass — so each is
 * only a medium note. Two distinct terms in one file, or one term beside a loader or executor
 * signal, is what makes it a verdict. `ESP` is matched case-sensitively on purpose: lowercased it
 * lives inside "response" and "especially" and would fire on half the corpus.
 */
const CHEAT_TERMS = [
  ['aimbot', /\baimbot\b/i],
  ['silent aim', /\bsilent\s*aim\b/i],
  ['wallhack', /\bwall\s*hacks?\b/i],
  ['ESP', /\bESP\b/],
  ['noclip', /\bno\s*clip\b/i],
  ['fly hack', /\bfly\s*hack\b/i],
  ['kill aura', /\bkill\s*aura\b/i],
  ['autofarm', /\bauto\s*farm(?:ing)?\b/i],
  ['dupe', /\bdup(?:e|ing)\b/i],
  ['infinite yield', /\binfinite\s*yield\b/i],
  ['script hub', /\bscript\s*hub\b/i],
  ['universal script', /\buniversal\s+script\b/i],
  ['exploit ui library', /\b(?:rayfield|orionlib|kavo\s*ui|linoria)\b/i],
];

/**
 * Per-line detectors that ask the same question every time. `require` and Remotes are not here:
 * both turn on their argument or their neighbourhood, which a table row cannot express.
 */
const LINE_RULES = [
  { kind: 'executor-global', severity: 'high', pattern: EXECUTOR_GLOBALS },
  {
    //[[ Not a Roblox API. `game:HttpGet` is an executor extension; honest code reaches
    //   HttpService. The RECEIVER COLON is what carries that reasoning, and the pattern used to
    //   have a second alternative — a bare `\bHttpGet\s*\(` — that did not.
    //
    //   With `/i` that alternative matched any function named `httpGet`, and it fired five times
    //   in `evaera/roblox-lua-promise`'s `docs/WhyUsePromises.md`, a tutorial whose whole subject
    //   is wrapping `HttpService:GetAsync` in a Promise:
    //
    //       local function httpGet(url)          <- flagged
    //       local promise = httpGet("https://google.com")   <- flagged
    //
    //   That condemned one of the most widely used libraries in the Roblox ecosystem as an
    //   `executor`, which is the precise failure this scanner's own test file warns about: a
    //   scanner that condemns legitimate code is a scanner someone switches off, and a
    //   switched-off scanner is worse than none because it also carries a false assurance.
    //
    //   Requiring the receiver keeps every true positive. `loadstring(game:HttpGet(url))()` still
    //   matches; so does any other receiver, because the colon is matched and the name before it
    //   is not. `HttpService:GetAsync` feeding `loadstring` was never caught here anyway — it is
    //   caught by the fetch-and-execute pair rule, which is the correct detector for it, since a
    //   fetch with no execution sink is not a payload loader. ]]
    kind: 'remote-payload-fetch',
    severity: 'high',
    pattern: /:\s*HttpGet(?:Async)?\s*\(|\bhttp_request\s*\(|\brequest\s*\(\s*\{\s*Url\b/i,
  },
  {
    // The session cookie. There is no reading of this in a repository that is about making games.
    kind: 'credential-access',
    severity: 'high',
    pattern: /\bROBLOSECURITY\b/,
  },
  {
    // Genuinely ambiguous: plenty of honest games log purchases and reports to a Discord webhook.
    // It is also the single most common place stolen data is sent. Medium, and promoted beside a
    // credential or cheat signal.
    kind: 'exfiltration-endpoint',
    severity: 'medium',
    pattern: /discord(?:app)?\.com\/api\/webhooks|\bdiscord\.gg\//i,
  },
  {
    // Disabled on Roblox servers by default, but real in plugins and command bars. Alone: a note.
    // The bracket-index form (`_G["loadstring"]`, `getfenv()["loadstring"]`) is here because
    // reaching a global by string literal is how the plain name is kept out of a grep — and
    // because honest code has no reason to index a global it could simply name.
    kind: 'dynamic-code',
    severity: 'medium',
    pattern: /\bloadstring\s*\(|(?:^|[^:.\w])load\s*\(\s*["'`]|\[\s*["'](?:loadstring|load|getfenv|setfenv|require|HttpGet)["']\s*\]/,
  },
  {
    // Legacy Luau — old module loaders used getfenv legitimately, and old code is exactly what
    // this corpus is full of. Suspicious in company, unremarkable alone.
    kind: 'env-manipulation',
    severity: 'medium',
    pattern: /\bgetfenv\s*\(|\bsetfenv\s*\(/,
  },
  {
    // Ordinary. Recorded at low ONLY so `loadstring` + a fetch can be recognised as the pair §4
    // names. On its own this must never move a verdict, or every analytics call becomes an alert.
    kind: 'http-call',
    severity: 'low',
    pattern: /\bHttpService\b|:\s*(?:GetAsync|PostAsync|RequestAsync)\s*\(/,
  },
];

/**
 * Named combinations. This table is the reason "ambiguous" stays narrow: a medium is promoted by
 * a specific partner that gives it a specific meaning, never by the mere presence of a second
 * medium. `encoded-blob` + `long-line` is a UI module with an icon in it and stays safe; the same
 * blob beside a `loadstring` is a loader.
 */
const PROMOTIONS = [
  { all: ['dynamic-code', 'remote-payload-fetch'], class: 'remote-payload-loader', why: 'builds code at runtime from a payload fetched over HTTP' },
  { all: ['dynamic-code', 'http-call'], class: 'remote-payload-loader', why: 'feeds an HTTP response to loadstring — the remote-payload loader §4 names' },
  { all: ['dynamic-code', 'encoded-blob'], class: 'obfuscated-loader', why: 'builds code at runtime out of an encoded blob' },
  { all: ['dynamic-code', 'escape-density'], class: 'obfuscated-loader', why: 'builds code at runtime out of escaped text' },
  { all: ['dynamic-code', 'char-chain'], class: 'obfuscated-loader', why: 'builds code at runtime out of text reassembled from character codes' },
  { all: ['dynamic-code', 'numeric-table'], class: 'obfuscated-loader', why: 'builds code at runtime out of a numeric array' },
  { all: ['dynamic-code', 'long-line'], class: 'obfuscated-loader', why: 'builds code at runtime from a line too long to have been written by hand' },
  { all: ['dynamic-code', 'env-manipulation'], class: 'obfuscated-loader', why: 'rewrites its own environment around code it builds at runtime' },
  { all: ['encoded-blob', 'char-chain'], class: 'obfuscated-loader', why: 'reassembles an encoded blob character by character' },
  { all: ['cheat-vocabulary', 'executor-global'], class: 'executor', why: 'names a cheat and calls an executor-only global' },
  { all: ['cheat-vocabulary', 'dynamic-code'], class: 'executor', why: 'names a cheat and builds code at runtime' },
  { all: ['cheat-vocabulary', 'env-manipulation'], class: 'executor', why: 'names a cheat and rewrites its environment' },
  { all: ['cheat-vocabulary', 'exfiltration-endpoint'], class: 'executor', why: 'names a cheat and carries an exfiltration endpoint' },
  { all: ['exfiltration-endpoint', 'credential-access'], class: 'exfiltration', why: 'handles a session cookie and carries a webhook to send it to' },
  { all: ['exfiltration-endpoint', 'dynamic-code'], class: 'exfiltration', why: 'carries a webhook beside code built at runtime' },
];

function excerptOf(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, SCAN_LIMITS.excerptChars);
}

function signal(kind, severity, path, excerpt, line) {
  return { kind, severity, path, excerpt: excerptOf(excerpt), line };
}

/**
 * `require` turns entirely on its argument. `require(script.Parent.Config)` and
 * `require(Modules[name])` are how every Roblox codebase is assembled; treating an unresolvable
 * require as hostile — as the asset-insertion scanner does, correctly, for a stranger's model —
 * would condemn the whole corpus. Only a numeric literal is a signal here, and it is high on its
 * own: `require(1234567)` fetches a module off the marketplace at runtime, so what it serves can
 * change after this repository was inspected and nothing about it can ever be verified.
 */
function scanRequires(line, lineNo, path) {
  const out = [];
  const re = /\brequire\s*\(/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < line.length && i - start < 200 && depth > 0; i++) {
      if (line[i] === '(') depth++;
      else if (line[i] === ')') depth--;
    }
    const arg = line.slice(start, depth === 0 ? i - 1 : i).trim();
    // Five digits is the floor for a Roblox asset id, and keeps `require(2)` out of the net.
    // `require(tonumber(...))` is caught whatever is inside the call: honest code requires a
    // path, never a number, so coercing an argument to a number to require it has no other use.
    if (/^["']?\d{5,}/.test(arg) || /^tonumber\s*\(/.test(arg)) out.push(signal('require-asset-id', 'high', path, line, lineNo));
  }
  return out;
}

/**
 * The one-variable laundering of the above: `local id = 4623459072` on one line and `require(id)`
 * on another. Both halves are needed, and the variable name must match, which is what keeps this
 * off the many honest files that contain a large integer literal (every `rbxassetid://` in the
 * corpus is one) and the many that contain a `require`.
 */
function scanRequireLaundering(lines, path) {
  const out = [];
  /* NOT anchored with `$`. It used to be, which meant the statement-separated
     same-line form — `local id = 4623459072; require(id)` — slipped through
     while its byte-identical two-line twin was caught. An attacker does not
     have to be clever to find that; they have to press semicolon. The `j !== i`
     guard below is therefore also dropped for the same-line case. */
  const assign = /(?:^|;)\s*(?:local\s+)?([A-Za-z_]\w*)\s*=\s*(\d{5,})\b/;
  for (let i = 0; i < lines.length; i++) {
    const m = assign.exec(lines[i] ?? '');
    if (!m) continue;
    const used = new RegExp(`\\brequire\\s*\\(\\s*${m[1]}\\s*\\)`);
    for (let j = 0; j < lines.length; j++) {
      if (used.test(lines[j] ?? '')) {
        out.push(signal('require-asset-id', 'high', path, `${(lines[i] ?? '').trim()} ... ${(lines[j] ?? '').trim()}`, j + 1));
        break;
      }
    }
  }
  return out;
}

/**
 * The malicious remote is not "a remote exists" — every networked game has dozens. It is a script
 * that mints its own channel and phones home down it in the same breath. All three conditions are
 * required: the remote is created here, it is fired within a few lines, and the firing line
 * carries identity. A networking module that creates remotes at startup and fires them from
 * elsewhere fails the second condition, which is exactly the point.
 */
function scanRemotes(lines, path) {
  const out = [];
  const create = /(?:local\s+([A-Za-z_]\w*)\s*=\s*)?Instance\.new\s*\(\s*["'](?:RemoteEvent|RemoteFunction)["']/;
  const identity = /\bLocalPlayer\b|\bUserId\b|\bDisplayName\b|:\s*GetFullName\s*\(|JSONEncode/;
  for (let i = 0; i < lines.length; i++) {
    const made = create.exec(lines[i] ?? '');
    if (!made) continue;
    const name = made[1];
    const fire = name ? new RegExp(`\\b${name}\\s*:\\s*(?:Fire\\w*|Invoke\\w*)\\s*\\(`) : /:\s*(?:Fire\w*|Invoke\w*)\s*\(/;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + SCAN_LIMITS.remoteWindow); j++) {
      const line = lines[j] ?? '';
      if (fire.test(line) && identity.test(line)) {
        out.push(signal('phone-home-remote', 'high', path, line, j + 1));
        break;
      }
    }
  }
  return out;
}

/**
 * Longest run of consecutive `<number>,` entries. Counted with a linear scan rather than a
 * repeated-group regex, because the input is by definition hostile and may be half a megabyte,
 * and a nested quantifier over half a megabyte of digits is a denial of service waiting to be
 * handed to us.
 */
function longestNumericRun(source) {
  const re = /\s*\d{1,6}\s*,/g;
  let m;
  let run = 0;
  let best = 0;
  let bestIndex = 0;
  let startIndex = 0;
  let prevEnd = -1;
  while ((m = re.exec(source)) !== null) {
    if (m.index === prevEnd) run++;
    else {
      run = 1;
      startIndex = m.index;
    }
    prevEnd = m.index + m[0].length;
    if (run > best) {
      best = run;
      bestIndex = startIndex;
    }
  }
  return { run: best, index: bestIndex };
}

/**
 * Whole-file shape. Obfuscated Luau does not contain a keyword announcing itself; it is reliably
 * one enormous line, or mostly escapes, or a blob, or an array that is really bytecode.
 */
function scanShape(source, lines, path) {
  const out = [];

  let longestIdx = 0;
  for (let i = 1; i < lines.length; i++) if ((lines[i] ?? '').length > (lines[longestIdx] ?? '').length) longestIdx = i;
  const longest = lines[longestIdx] ?? '';
  if (longest.length >= SCAN_LIMITS.packedLine) out.push(signal('packed-line', 'high', path, longest, longestIdx + 1));
  else if (longest.length >= SCAN_LIMITS.longLine) out.push(signal('long-line', 'medium', path, longest, longestIdx + 1));

  const escapes = source.match(/\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\\d{1,3}/g);
  if (escapes && escapes.length >= SCAN_LIMITS.minEscapes) {
    const covered = escapes.join('').length / Math.max(1, source.length);
    if (covered >= SCAN_LIMITS.escapeRatio) out.push(signal('escape-density', 'high', path, escapes.slice(0, 24).join(''), null));
  }

  for (let i = 0; i < lines.length; i++) {
    const concats = ((lines[i] ?? '').match(/\.\./g) ?? []).length;
    if (concats >= SCAN_LIMITS.concatChain) {
      out.push(signal('concat-chain', 'medium', path, lines[i], i + 1));
      break;
    }
  }

  const blob = new RegExp(`[A-Za-z0-9+/]{${SCAN_LIMITS.base64Run},}={0,2}`).exec(source);
  if (blob) out.push(signal('encoded-blob', 'medium', path, blob[0], null));

  const numeric = longestNumericRun(source);
  if (numeric.run >= SCAN_LIMITS.numericRun) {
    const severity = numeric.run >= SCAN_LIMITS.numericRunHigh ? 'high' : 'medium';
    out.push(signal('numeric-table', severity, path, source.slice(numeric.index, numeric.index + 80), null));
  }

  const charChains = (source.match(/string\s*\.\s*char\s*\(/g) ?? []).length;
  if (charChains >= SCAN_LIMITS.charChain) out.push(signal('char-chain', 'medium', path, 'string.char(...)', null));

  return out;
}

/** One clause per kind, so the verdict's `reason` reads as a sentence a human wrote. */
const KIND_CLAUSE = {
  'executor-global': 'calls an executor-only global that does not exist in the Roblox Luau sandbox',
  'remote-payload-fetch': 'calls game:HttpGet, an executor extension rather than a Roblox API',
  'require-asset-id': 'requires a module by numeric asset id — the marketplace backdoor',
  'credential-access': 'handles the .ROBLOSECURITY session cookie',
  'packed-line': 'packs its source onto one line far past anything hand-written',
  'escape-density': 'encodes most of its own text as character escapes',
  'numeric-table': 'embeds a numeric array long enough to be bytecode rather than data',
  'phone-home-remote': 'creates a Remote and immediately fires player identity down it',
  unscannable: 'could not be read in full, so nothing about it can be cleared',
};

function pickClass(candidates) {
  for (const cls of SECURITY_CLASSES) if (candidates.includes(cls)) return cls;
  return candidates[0] ?? null;
}

/** Line number of an absolute offset, and the whole line it falls on. */
function lineAt(source, index) {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return { no: source.slice(0, index).split('\n').length, text: source.slice(start, end === -1 ? undefined : end) };
}

/**
 * Scan one file. `source` may be null or undefined — that is the unscannable case, not a clean one.
 *
 * @param {{ path?: string, source?: string|null }} file
 * @returns {{ safe: boolean, class: string|null, signals: Array<object>, reason: string }} SecurityVerdict
 */
/**
 * Statically decode the cheapest obfuscations, so the high-severity LITERAL rules
 * see the string an attacker was trying to hide.
 *
 * The adversarial pass found this was the scanner's worst gap. The credential
 * rule is a bare `\bROBLOSECURITY\b`, and every character-level disguise beat it:
 * `string.char(46,82,79,...)` produced NO signal at all (the char-chain rule
 * counts CALLS, and one call is below its threshold), `".ROBLO" .. "SECURITY"`
 * produced nothing, and a fully armed stealer — char-coded cookie name,
 * `getcookie`, a webhook URL and a `PostAsync` — came back SAFE.
 *
 * This is a rewrite, NOT an evaluation. §4's standing rule is that downloaded
 * code is never executed, so there is no eval, no Function, no vm: only three
 * textual substitutions whose output is fed back through the same rules. Decoding
 * cannot invent a match that was not spelled out in the source.
 *
 * It is deliberately shallow. It will not follow a value through a variable or
 * unroll a loop, and a determined attacker will still get past it. The point is
 * that they now have to be determined: the one-line disguises stop working.
 */
export function decodeObfuscatedLiterals(source) {
  let out = source;

  // string.char(46, 82, 79, ...) -> ".RO..."   (and the `("").char` spelling)
  out = out.replace(/(?:string|\(\s*["'][^"']*["']\s*\))\s*[.:]\s*char\s*\(([^()]{0,600})\)/gi, (whole, args) => {
    const codes = args.split(',').map((a) => Number(a.trim()));
    if (!codes.length || codes.some((n) => !Number.isInteger(n) || n < 0 || n > 0x10ffff)) return whole;
    return `"${codes.map((n) => String.fromCodePoint(n)).join('')}"`;
  });

  // string.reverse("YTIRUCESOLBOR.") -> ".ROBLOSECURITY"
  out = out.replace(/(?:string|\(\s*["'][^"']*["']\s*\))\s*[.:]\s*reverse\s*\(\s*(["'])(.*?)\1\s*\)/gi,
    (_w, q, body) => `${q}${[...body].reverse().join('')}${q}`);

  // "\x2eROBLO" / "\46ROBLO" -> the literal characters
  out = out.replace(/\\x([0-9a-fA-F]{2})/g, (_w, h) => String.fromCharCode(parseInt(h, 16)));
  out = out.replace(/\\(\d{1,3})(?!\d)/g, (w, d) => {
    const n = Number(d);
    return n <= 255 ? String.fromCharCode(n) : w;
  });

  // "\.ROBLO" .. "SECURITY" -> ".ROBLOSECURITY". Repeated so a chain of three
  // or more folds completely rather than one pair at a time.
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/(["'])([^"'\n]*)\1\s*\.\.\s*(["'])([^"'\n]*)\3/g, (_w, q, a, _q2, b) => `${q}${a}${b}${q}`);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function scan({ path = '', source } = {}) {
  if (typeof source !== 'string') {
    const s = signal('unscannable', 'high', path, 'source unavailable', null);
    return { safe: false, class: 'unscannable', signals: [s], reason: `unscannable: ${path || 'file'} ${KIND_CLAUSE.unscannable}.` };
  }

  const truncated = source.length > SCAN_LIMITS.maxSourceChars;
  const body = truncated ? source.slice(0, SCAN_LIMITS.maxSourceChars) : source;
  const lines = body.split(/\r?\n/);
  const signals = [];

  if (truncated) {
    signals.push(signal('unscannable', 'high', path, `${source.length} characters; only the first ${SCAN_LIMITS.maxSourceChars} were examined`, null));
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const rule of LINE_RULES) if (rule.pattern.test(line)) signals.push(signal(rule.kind, rule.severity, path, line, i + 1));
    signals.push(...scanRequires(line, i + 1, path));
  }

  // Cheat vocabulary is counted over the whole file rather than per line, because the question it
  // answers — "how many *different* cheats does this name?" — is a file-level question.
  const cheats = [];
  for (const [term, re] of CHEAT_TERMS) {
    const hit = re.exec(body);
    if (!hit) continue;
    cheats.push(term);
    const at = lineAt(body, hit.index);
    signals.push(signal('cheat-vocabulary', 'medium', path, at.text, at.no));
  }

  signals.push(...scanRequireLaundering(lines, path));
  signals.push(...scanRemotes(lines, path));
  signals.push(...scanShape(body, lines, path));

  /* Second pass over statically decoded text. Only the rules that match a LITERAL
     string are re-run: shape rules (line length, escape density, concat chains)
     must NOT see the decoded form, because decoding is exactly what removes the
     shape they measure — re-running them here would erase the obfuscation signal
     rather than add to it. */
  const decoded = decodeObfuscatedLiterals(body);
  if (decoded !== body) {
    const decodedLines = decoded.split(/\r?\n/);
    for (let i = 0; i < decodedLines.length; i++) {
      const line = decodedLines[i] ?? '';
      for (const rule of LINE_RULES) {
        if (rule.severity !== 'high') continue;
        if (!rule.pattern.test(line)) continue;
        // Do not double-report something the plain pass already saw.
        if (rule.pattern.test(lines[i] ?? '')) continue;
        signals.push(signal(rule.kind, 'high', path, `decoded: ${line.trim().slice(0, 120)}`, i + 1));
      }
    }
  }

  // ---- promotion -----------------------------------------------------------------------------
  const present = new Set(signals.map((s) => s.kind));
  const classes = [];
  const promoted = [];

  // Two distinct cheat names in one file is no longer a documented attack; it is a menu.
  if (cheats.length >= 2) {
    for (const s of signals) if (s.kind === 'cheat-vocabulary') s.severity = 'high';
    classes.push('executor');
    promoted.push({ cls: 'executor', why: `names ${cheats.length} distinct cheats (${cheats.slice(0, 4).join(', ')})` });
  }

  for (const rule of PROMOTIONS) {
    if (!rule.all.every((k) => present.has(k))) continue;
    for (const s of signals) if (rule.all.includes(s.kind)) s.severity = 'high';
    classes.push(rule.class);
    promoted.push({ cls: rule.class, why: rule.why });
  }

  for (const s of signals) if (s.severity === 'high' && INTRINSIC_CLASS[s.kind]) classes.push(INTRINSIC_CLASS[s.kind]);

  const worst = signals.reduce((acc, s) => worstSeverity(acc, s.severity), 'low');
  const safe = worst !== 'high';
  // An unscannable file is called unscannable even when the prefix that WAS read tripped other
  // detectors, because every one of those findings was derived from a partial view and none of
  // them can be trusted to be the whole story. The findings still ride along in `signals`, so a
  // reviewer sees the backdoor; they are just not allowed to name a file nobody could read.
  const cls = safe ? null : present.has('unscannable') ? 'unscannable' : pickClass(classes);

  // Worst-first, so a truncated signal list still leads with whatever condemned the file.
  signals.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  const kept = signals.slice(0, SCAN_LIMITS.maxSignals);

  let reason;
  if (safe) {
    const notes = signals.filter((s) => s.severity === 'medium').length;
    reason =
      notes === 0
        ? `${path || 'file'}: no exploit, loader, credential or obfuscation signal.`
        : `${path || 'file'}: ${notes} signal(s) worth a reviewer's eye, none disqualifying on its own.`;
  } else {
    // The sentence must explain the class that was actually chosen, or a reviewer is handed a
    // verdict and an unrelated excuse for it. Prefer the signal (or the promotion) that produced
    // `cls`; only fall back to the worst signal when nothing matches.
    const lead =
      kept.find((s) => s.severity === 'high' && INTRINSIC_CLASS[s.kind] === cls && KIND_CLAUSE[s.kind]) ??
      kept.find((s) => s.severity === 'high' && KIND_CLAUSE[s.kind]);
    const where = lead && lead.line !== null ? `${path || 'file'}:${lead.line}` : path || 'file';
    const clause = promoted.find((p) => p.cls === cls)?.why ?? (lead ? KIND_CLAUSE[lead.kind] : 'carries a disqualifying signal');
    reason = `${cls}: ${where} ${clause}.`;
  }

  return { safe, class: cls, signals: kept, reason };
}

/** Accepts `[{path, source}]` or a `{ path: source }` map, because callers hold both shapes. */
function normaliseFiles(files) {
  if (Array.isArray(files)) return files;
  if (files && typeof files === 'object') return Object.entries(files).map(([path, source]) => ({ path, source }));
  return [];
}

/**
 * Scan a whole checkout and take the worst verdict. Signals are deliberately NOT combined across
 * files: a repository with a `loadstring` in a plugin and an `HttpService` call in an analytics
 * module is two ordinary files rather than a loader, and an anti-cheat repo documenting "aimbot"
 * in one module and "noclip" in another is precisely the false positive a cross-file cheat count
 * would manufacture. A file is judged by what is in it.
 *
 * @param {Array<{path?: string, source?: string|null}>|Record<string,string>} files
 * @returns {{ safe: boolean, class: string|null, signals: Array<object>, reason: string }} SecurityVerdict
 */
export function scanTree(files) {
  const list = normaliseFiles(files);
  if (list.length === 0) return { safe: true, class: null, signals: [], reason: 'empty tree: nothing to scan.' };
  if (list.length > SCAN_LIMITS.maxFiles) {
    const s = signal('unscannable', 'high', '', `${list.length} files, over the ${SCAN_LIMITS.maxFiles}-file scan cap`, null);
    return {
      safe: false,
      class: 'unscannable',
      signals: [s],
      reason: `unscannable: ${list.length} files is past the ${SCAN_LIMITS.maxFiles}-file cap, and a partial pass cannot clear a tree.`,
    };
  }

  const verdicts = list.map((f) => scan(f));
  const signals = verdicts.flatMap((v) => v.signals);
  signals.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  const unsafe = verdicts.filter((v) => !v.safe);
  if (unsafe.length === 0) {
    const notes = signals.filter((s) => s.severity === 'medium').length;
    return {
      safe: true,
      class: null,
      signals: signals.slice(0, SCAN_LIMITS.maxSignals),
      reason: `${list.length} file(s) scanned, ${notes} note(s), nothing disqualifying.`,
    };
  }

  const cls = pickClass(unsafe.map((v) => v.class));
  const lead = unsafe.find((v) => v.class === cls) ?? unsafe[0];
  return {
    safe: false,
    class: cls,
    signals: signals.slice(0, SCAN_LIMITS.maxSignals),
    reason: `${unsafe.length} of ${list.length} file(s) disqualified — ${lead.reason}`,
  };
}
