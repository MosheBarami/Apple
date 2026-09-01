// Static Roblox anti-pattern detection for Luau the model writes.
//
// The gap this closes: `luau_syntax` proves a snippet PARSES, and `contains`/`regex` prove it
// mentions the right API. Neither can tell the difference between a shop that debits the server's
// copy of the balance and one that trusts a price the client sent — both parse, both contain
// "RemoteEvent", both score 1.0. Every check in the suite passed on code that would be drained of
// currency within an hour of going live.
//
// So these rules read the code, not the vocabulary. Each one names the exploit or the outage it
// prevents; a rule that cannot name a concrete failure does not belong here, because an unjustified
// static rule is just a style opinion that costs a model points.
//
// Deliberate limits, stated so nobody reads more into a clean report than it earns:
//   - Regex + block scanning, not a parser. It sees one file with no project context, so it cannot
//     follow a value across a ModuleScript boundary.
//   - It answers "does this code contain a known-bad shape", never "is this code correct".
//   - Comments are stripped before matching (a comment saying `-- never use wait()` must not fire
//     the deprecated-API rule). String CONTENTS are deliberately kept: `Instance.new("BodyVelocity")`
//     and `:WaitForChild("Ring")` are the exact shapes several rules exist to catch.

/** 1-based line number of a character offset. */
function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * Blank out comments while preserving offsets, line numbers and string literals.
 * String literals are SCANNED (so a `--` inside a string is not read as a comment start) but their
 * text is kept, because Roblox's dangerous shapes live inside strings.
 */
export function stripComments(source) {
  const src = String(source ?? '');
  const out = [];
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i, i + 8);
    if (rest.startsWith('--')) {
      const long = /^--(\[=*\[)/.exec(src.slice(i, i + 16));
      if (long) {
        const close = `]${'='.repeat(long[1].length - 2)}]`;
        const end = src.indexOf(close, i + long[0].length);
        const stop = end === -1 ? src.length : end + close.length;
        out.push(blank(src.slice(i, stop)));
        i = stop;
        continue;
      }
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? src.length : nl;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    const longStr = /^\[=*\[/.exec(src.slice(i, i + 16));
    if (longStr) {
      const close = `]${'='.repeat(longStr[0].length - 2)}]`;
      const end = src.indexOf(close, i + longStr[0].length);
      const stop = end === -1 ? src.length : end + close.length;
      out.push(src.slice(i, stop));
      i = stop;
      continue;
    }
    const q = src[i];
    if (q === '"' || q === "'" || q === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, src.length);
      out.push(src.slice(i, stop));
      i = stop;
      continue;
    }
    out.push(q);
    i += 1;
  }
  return out.join('');
}

// Block openers each need exactly one closer. `elseif` is intentionally not an opener: it reuses
// the `if`'s `end`, so counting it would run every block scan off the end of the function.
const BLOCK_TOKENS = /\b(function|do|if|repeat|end|until)\b/g;

/**
 * End offset (exclusive) of the Luau block opened at or after `from`.
 * Used to give a rule the BODY of a handler instead of "the next 500 characters", which is the
 * difference between "this connection yields" and "something later in the file yields".
 */
export function blockEnd(src, from) {
  BLOCK_TOKENS.lastIndex = from;
  let depth = 0;
  let m;
  while ((m = BLOCK_TOKENS.exec(src))) {
    const tok = m[1];
    if (tok === 'end' || tok === 'until') {
      depth -= 1;
      if (depth <= 0) return m.index + tok.length;
    } else {
      depth += 1;
    }
  }
  return src.length;
}

/** Body of every `Signal:Connect(function(...)` whose signal name matches `signalRe`. */
function connectedBodies(src, signalRe) {
  const re = new RegExp(`${signalRe.source}[^\\n]{0,80}?:Connect\\s*\\(\\s*function\\s*\\(([^)]*)\\)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    out.push({ index: m.index, params: m[1].split(',').map((s) => s.trim()).filter(Boolean), body: src.slice(start, blockEnd(src, m.index)) });
  }
  return out;
}

/** Character ranges covered by a `pcall(function() ... end)` wrapper. */
function pcallRanges(src) {
  const ranges = [];
  const re = /\b(?:x?pcall)\s*\(\s*function\b/g;
  let m;
  while ((m = re.exec(src))) ranges.push([m.index, blockEnd(src, m.index + m[0].length - 'function'.length)]);
  return ranges;
}

// No leading \b on the alternation: a method call is preceded by `)` or `"`, and `\b` between two
// non-word characters never holds, so `\b:WaitForChild` matched nothing at all. That silent miss is
// what made yield-inside-currency-debit pass its own bad sample — the failure this file exists to
// catch, in the file that catches it.
const YIELDS = /\btask\.(?:wait|delay|desynchronize|synchronize)\b|(?<![.:\w])wait\s*\(|:(?:Wait|WaitForChild|GetAsync|SetAsync|UpdateAsync|IncrementAsync|RemoveAsync|InvokeServer|InvokeClient|LoadCharacter|PromptPurchase)\s*\(|RunService\.(?:Heartbeat|RenderStepped|Stepped)|HttpService:\w+Async/;
const CURRENCY = /\b(leaderstats|Coins?|Cash|Money|Gold|Gems?|Tokens?|Bucks|Credits?|Balance|Wallet)\b/i;
const DATASTORE_CALL = /:(SetAsync|UpdateAsync|GetAsync|RemoveAsync|IncrementAsync|GetSortedAsync)\s*\(/g;

/**
 * Which side of the client/server boundary this file runs on. Several rules are only wrong on one
 * side — `.Value = x` on a currency is normal on the server and meaningless on the client — so a
 * rule that ignored context would either miss the exploit or punish correct server code.
 * Ambiguous files resolve to 'unknown' and context-scoped rules are skipped rather than guessed.
 */
export function inferContext(src) {
  const client = /LocalPlayer|OnClientEvent|:FireServer\s*\(|:InvokeServer\s*\(|RenderStepped|PlayerGui|UserInputService|LocalScript/.test(src);
  const server = /OnServerEvent|:FireClient|:FireAllClients|DataStoreService|PlayerAdded|PlayerRemoving|ServerScriptService|ServerStorage|BindToClose/.test(src);
  if (client && !server) return 'client';
  if (server && !client) return 'server';
  return 'unknown';
}

/**
 * Every rule: `{id, severity, contexts, title, why, find(ctx) -> [{line, detail}]}`.
 * `why` is not decoration — it is the justification the finding is reported with, so a model (or a
 * human reading the eval output) is told which exploit the deduction refers to.
 */
export const RULES = [
  {
    id: 'remote-function-to-client',
    severity: 'error',
    contexts: null,
    title: 'RemoteFunction invoked on a client',
    // An exploiter's client simply never returns from the invocation. The SERVER thread that called
    // :InvokeClient yields forever — one player wedges a server system (round timer, shop, save
    // loop) for everyone. There is no timeout parameter. The safe direction is RemoteEvent
    // :FireClient plus a separate client->server reply.
    why: 'a malicious client can never return, hanging the server thread forever; use RemoteEvent :FireClient',
    find({ src }) {
      return matches(src, /:InvokeClient\s*\(/g, () => 'server invokes a RemoteFunction on a client');
    },
  },
  {
    id: 'client-authoritative-currency',
    severity: 'error',
    contexts: ['client'],
    title: 'Client writes a currency value',
    // Two failures in one shape. If the assignment is to a replicated IntValue it is a no-op the
    // player sees and the server does not, so the UI lies. If the design actually relies on it,
    // any executor re-runs the LocalScript and mints currency. Balances are server state.
    why: 'the client cannot own a balance: the write either does not replicate (UI lies) or is free currency for any executor',
    find({ src }) {
      return lineMatches(src, (line) => CURRENCY.test(line) && /\.Value\s*(?:\+|-|\*|\/)?=[^=]/.test(line), 'client assigns to a currency Value');
    },
  },
  {
    id: 'server-trusts-client-amount',
    severity: 'error',
    contexts: ['server'],
    title: 'Server applies a client-supplied amount',
    // The classic duplication exploit: the client sends the price/amount and the server believes
    // it. FireServer("Sword", -99999) then credits the player. Prices and rewards must be looked
    // up server-side from a table the client cannot reach; the client may only send an item id.
    why: 'the client chooses its own price/reward; look the amount up server-side from an id',
    find({ src }) {
      const out = [];
      for (const h of connectedBodies(src, /OnServerEvent/)) {
        const suspect = h.params.slice(1).filter((p) => /amount|price|cost|reward|value|qty|quantity|count|delta/i.test(p));
        for (const name of suspect) {
          const flows = new RegExp(`\\.Value\\s*(?:\\+|-)?=[^=\\n]*\\b${name}\\b`);
          if (flows.test(h.body)) out.push({ line: lineOf(src, h.index), detail: `remote parameter \`${name}\` flows straight into a .Value assignment` });
        }
      }
      return out;
    },
  },
  {
    id: 'unvalidated-remote-arg',
    severity: 'error',
    contexts: ['server'],
    title: 'RemoteEvent handler does not validate its arguments',
    // Remote arguments are attacker-controlled: any type, any size, nil, a table 200 levels deep,
    // an Instance from somewhere else in the DataModel. Indexing them unchecked is the standard
    // "attempt to index nil" server error an exploiter uses to kill a system, and unbounded strings
    // are how a remote spam turns into a memory exhaustion.
    why: 'remote arguments are attacker-controlled; check typeof/nil/range before using them',
    find({ src }) {
      const out = [];
      for (const h of connectedBodies(src, /OnServerEvent/)) {
        if (h.params.length < 2) continue;
        const validates = /\btypeof\s*\(|\btype\s*\(|\btonumber\s*\(|:IsA\s*\(|\bassert\s*\(|if\s+not\s+\w|==\s*nil|~=\s*nil|table\.find\s*\(|math\.clamp\s*\(/.test(h.body);
        if (!validates) out.push({ line: lineOf(src, h.index), detail: `handler takes ${h.params.slice(1).join(', ')} and never checks type, nil or range` });
      }
      return out;
    },
  },
  {
    id: 'busy-wait-loop',
    severity: 'error',
    contexts: null,
    title: 'Unyielding `while true do`',
    // A loop that never yields never lets the scheduler resume anything else on that thread. On the
    // server Roblox's watchdog kills it with "Script timeout: exhausted allowed execution time"
    // after a few seconds, so the feature works in Studio and silently stops working in a live
    // server — the hardest class of bug to reproduce.
    why: 'a loop with no yield pins the thread until the Roblox watchdog kills the script',
    find({ src }) {
      const out = [];
      const re = /\bwhile\s+(true|1)\s+do\b/g;
      let m;
      while ((m = re.exec(src))) {
        const body = src.slice(m.index + m[0].length, blockEnd(src, m.index + m[0].length - 2));
        if (!YIELDS.test(body)) out.push({ line: lineOf(src, m.index), detail: 'loop body contains no task.wait or event yield' });
      }
      return out;
    },
  },
  {
    id: 'unbounded-wait-for-child',
    severity: 'warn',
    contexts: null,
    title: '`WaitForChild` with no timeout',
    // Without a timeout the thread yields forever if the instance is renamed, deleted, or simply
    // has not streamed in yet. Nothing errors and nothing prints — the rest of the script just
    // never runs, which is why this reproduces for players and never for the developer standing
    // next to the model.
    why: 'an untimed WaitForChild yields forever on a renamed, deleted or not-yet-streamed instance — silent, not an error',
    find({ src }) {
      return matches(src, /:WaitForChild\s*\(\s*(?:"[^"]*"|'[^']*'|[\w.]+)\s*\)/g, () => 'no timeout argument and therefore no nil path');
    },
  },
  {
    id: 'datastore-without-pcall',
    severity: 'error',
    contexts: null,
    title: 'DataStore call outside pcall',
    // DataStore calls THROW on throttling and on backend failure. An unprotected throw aborts the
    // enclosing handler, so the rest of a PlayerRemoving save never runs and the session is lost
    // with a stack trace nobody reads. Every DataStore call is a network call and must be treated
    // as one.
    why: 'DataStore calls throw on throttle/outage; an unprotected throw aborts the save mid-way',
    find({ src }) {
      const ranges = pcallRanges(src);
      const out = [];
      DATASTORE_CALL.lastIndex = 0;
      let m;
      while ((m = DATASTORE_CALL.exec(src))) {
        const idx = m.index;
        const inPcall = ranges.some(([a, b]) => idx >= a && idx <= b);
        const lineStart = src.lastIndexOf('\n', idx) + 1;
        const sameStatement = /\b(?:x?pcall)\s*\(/.test(src.slice(lineStart, idx));
        if (!inPcall && !sameStatement) out.push({ line: lineOf(src, idx), detail: `${m[1]} is not protected by pcall` });
      }
      return out;
    },
  },
  {
    id: 'datastore-without-retry',
    severity: 'warn',
    contexts: null,
    title: 'DataStore write with pcall but no retry',
    // pcall alone converts a crash into SILENT data loss, which is worse: the player's progress is
    // gone and the server looks healthy. The dominant DataStore failure is a throttle that succeeds
    // seconds later, so a bounded retry with backoff recovers almost all of them.
    why: 'pcall without a retry turns a recoverable throttle into permanent silent data loss',
    find({ src }) {
      const writes = [...src.matchAll(/:(SetAsync|UpdateAsync|IncrementAsync)\s*\(/g)];
      if (!writes.length) return [];
      // The bound is often a named constant (`for attempt = 1, MAX_ATTEMPTS`), so requiring a
      // literal digit here flagged correct, well-factored retry loops. Naming an attempt counter at
      // all is treated as evidence of a retry: this rule exists to catch "pcall and pray", and a
      // false positive on good code costs a model points it earned.
      const retries = /for\s+\w+\s*=\s*1\s*,\s*[\w.]+|repeat\b[\s\S]{0,600}?\buntil\b|while\s+not\s+\w+\b|\battempts?\b|\btries\b|\bretr(?:y|ies|ied)\b|\bbackoff\b/i.test(src);
      if (retries) return [];
      return [{ line: lineOf(src, writes[0].index), detail: 'no retry loop around any DataStore write' }];
    },
  },
  {
    id: 'set-async-read-modify-write',
    severity: 'error',
    contexts: null,
    title: 'Read-modify-write with SetAsync instead of UpdateAsync',
    // GetAsync then SetAsync is not atomic. Two servers (or the same player rejoining fast) read
    // the same balance and both write back; the second write silently erases the first. This is the
    // mechanism behind every "my items disappeared" and every duplication report. UpdateAsync does
    // the read and the write as one operation.
    why: 'GetAsync+SetAsync is a lost update across servers; UpdateAsync makes read-modify-write atomic',
    find({ src }) {
      const get = /:GetAsync\s*\(/.exec(src);
      const set = /:SetAsync\s*\(/.exec(src);
      if (!get || !set) return [];
      if (/:UpdateAsync\s*\(/.test(src)) return [];
      return [{ line: lineOf(src, set.index), detail: 'GetAsync then SetAsync on the same store with no UpdateAsync anywhere' }];
    },
  },
  {
    id: 'yield-inside-currency-debit',
    severity: 'error',
    contexts: null,
    title: 'Yield between the balance check and the debit',
    // The re-entrancy exploit. A yield between "can they afford it" and "take the money" lets a
    // second FireServer run the same handler while the balance still reads the old value: the
    // player is charged once and receives the item twice. Check and debit must be one uninterrupted
    // block, with the yield after.
    why: 'a yield between check and debit lets a second remote fire re-enter and buy twice on one payment',
    find({ src }) {
      const check = /\.Value\s*[<>]=?\s*\w/.exec(src);
      if (!check) return [];
      const after = src.slice(check.index);
      const assign = /\.Value\s*(?:=|-=|\+=)/.exec(after.slice(check[0].length));
      if (!assign) return [];
      const between = after.slice(check[0].length, check[0].length + assign.index);
      if (!YIELDS.test(between)) return [];
      return [{ line: lineOf(src, check.index), detail: 'balance is re-read after a yield that another remote fire can interleave with' }];
    },
  },
  {
    id: 'no-session-lock',
    severity: 'warn',
    contexts: ['server'],
    title: 'Player data loaded without a session lock',
    // Two servers can hold the same profile: a fast rejoin, a teleport between places, or a server
    // that has not finished its final save. The older server's autosave then overwrites the newer
    // one and the player loses everything since the rejoin. A lock stamped with `game.JobId` in the
    // record (via UpdateAsync) is what makes the handoff safe.
    why: 'without a JobId session lock, two servers hold the same profile and the stale one overwrites the fresh one',
    find({ src }) {
      const loads = connectedBodies(src, /PlayerAdded/).filter((h) => /:(GetAsync|UpdateAsync)\s*\(/.test(h.body));
      if (!loads.length) return [];
      if (/\bJobId\b|SessionLock|session_?lock|ProfileService|ProfileStore/i.test(src)) return [];
      return [{ line: lineOf(src, loads[0].index), detail: 'PlayerAdded loads data with no JobId lock or ownership check' }];
    },
  },
  {
    id: 'no-bindtoclose-save',
    severity: 'warn',
    contexts: ['server'],
    title: 'No BindToClose flush',
    // On shutdown and on soft-shutdown Roblox does not reliably run PlayerRemoving for everyone
    // before the process exits, so the last session's progress dies with the server. BindToClose
    // buys up to 30 seconds to flush what is still in memory.
    why: 'without BindToClose a server shutdown drops the last unsaved session for every player still in it',
    find({ src }) {
      const writes = /:(SetAsync|UpdateAsync|IncrementAsync)\s*\(/.exec(src);
      if (!writes) return [];
      if (/BindToClose/.test(src)) return [];
      return [{ line: lineOf(src, writes.index), detail: 'writes player data but never registers game:BindToClose' }];
    },
  },
  {
    id: 'deprecated-api',
    severity: 'warn',
    contexts: null,
    title: 'Deprecated global or body mover',
    // `wait()` is throttled to roughly 30Hz and drifts without bound under load; `spawn()` inserts
    // an arbitrary delay before the first resume, which is why "it works in Studio" round timers
    // desync live. The Body* movers are legacy physics and are outperformed and outbehaved by the
    // constraint equivalents. `:connect` is the pre-2016 casing and is removed in strict mode.
    why: 'wait/spawn/delay drift under load and Body* movers are legacy physics; use task.* and constraints',
    find({ src }) {
      const out = [];
      out.push(...matches(src, /(?<![.:\w])wait\s*\(/g, () => 'bare wait() — use task.wait()'));
      out.push(...matches(src, /(?<![.:\w])(?:spawn|delay)\s*\(/g, (m) => `${m[0].replace(/\s*\($/, '')}() — use task.spawn/task.delay`));
      out.push(...matches(src, /:connect\s*\(/g, () => ':connect is the removed lowercase alias — use :Connect'));
      out.push(...matches(src, /\bBody(?:Velocity|Position|Gyro|Thrust|Angular\w*)\b/g, (m) => `${m[0]} is a legacy body mover — use the constraint equivalent`));
      return out;
    },
  },
  {
    id: 'keyboard-only-input',
    severity: 'warn',
    contexts: ['client'],
    title: 'Action bound to the keyboard only',
    // Most Roblox sessions are phones and consoles. A KeyCode-only binding does not degrade there,
    // it simply does not exist — the feature is unreachable for the majority of players and the bug
    // report is "the button does nothing". ContextActionService binds one action across keyboard,
    // gamepad and an on-screen touch button in a single call.
    why: 'a KeyCode-only binding is unreachable on phones and gamepads, which are most Roblox sessions',
    find({ src }) {
      if (!/Enum\.KeyCode|InputBegan|IsKeyDown/.test(src)) return [];
      if (/ContextActionService|BindAction|TouchEnabled|Enum\.UserInputType\.Touch|Enum\.KeyCode\.Button|GamepadEnabled|TouchTap/.test(src)) return [];
      const m = /Enum\.KeyCode|InputBegan/.exec(src);
      return [{ line: lineOf(src, m.index), detail: 'keyboard input with no touch or gamepad path' }];
    },
  },
  {
    id: 'expensive-call-per-frame',
    severity: 'warn',
    contexts: null,
    title: 'Instance lookup inside a per-frame connection',
    // RenderStepped/Heartbeat bodies run 60 times a second, per client, forever. A GetDescendants
    // over a populated Workspace or an Instance.new in there is the single most common cause of
    // "the game gets laggy after five minutes" — the cost is invisible in a fresh Studio session
    // and compounds with playtime. Hoist the lookup out of the connection.
    why: 'per-frame GetChildren/GetDescendants/Instance.new is the standard cause of progressive frame-rate collapse',
    find({ src }) {
      const out = [];
      for (const h of connectedBodies(src, /(?:RenderStepped|Heartbeat|Stepped|PreRender|PreSimulation|PostSimulation)/)) {
        const bad = /:(GetChildren|GetDescendants|GetPlayers|FindFirstChild|WaitForChild|GetService)\s*\(|Instance\.new\s*\(/.exec(h.body);
        if (bad) out.push({ line: lineOf(src, h.index), detail: `${bad[0].replace(/\s*\($/, '')} runs every frame inside this connection` });
      }
      return out;
    },
  },
  {
    id: 'streaming-unsafe-descendant',
    severity: 'warn',
    contexts: ['client'],
    title: 'Client dot-indexes a Workspace descendant',
    // With StreamingEnabled the client's Workspace holds only what has streamed in. A direct dot
    // index throws "X is not a valid member of Workspace" at a distance that depends on where the
    // player is standing, which is why it never reproduces for the developer next to the model.
    why: 'under StreamingEnabled a client-side dot index into Workspace throws depending on player distance',
    find({ src }) {
      return matches(src, /\b(?:workspace|game\.Workspace|game:GetService\("Workspace"\))\.[A-Z]\w+\.[A-Z]\w+/g, (m) => `${m[0]} is not guaranteed to be streamed in`);
    },
  },
  //[[ ==================================================================================
  //   EXTRACTED FROM CANONICAL LIBRARIES, 2026-09-01.
  //
  //   Nineteen anti-patterns were proposed by reading five libraries that exist because
  //   somebody already hit the bug — ProfileService, Janitor, roblox-lua-promise, Knit and
  //   goodsignal — and every one was then attacked by a reviewer whose default was to reject.
  //   TWO SURVIVED. The seventeen rejections are the more useful number: they were thrown out
  //   for firing on correct code (`player-keyed-table-never-cleared` fires on delegated
  //   cleanup; `client-dot-index-replicated-storage` fires on the standard Rojo/Wally require
  //   idiom), for being factually wrong about Luau (`uncancelled-per-player-thread` treated
  //   `task.wait` as an error boundary), or for duplicating one of the sixteen.
  //
  //   That ratio is the standard this file's header sets: "an unjustified static rule is just a
  //   style opinion that costs a model points."
  //   ================================================================================== ]]
  {
    id: 'process-receipt-without-purchase-id',
    severity: 'error',
    //[[ Deliberately `null` rather than ['server']. A minimal ProcessReceipt file trips none of
    //   `inferContext`'s server tokens — no OnServerEvent, no DataStoreService, no PlayerAdded —
    //   so it resolves to 'unknown' and a server-scoped rule would silently skip the one file
    //   this rule exists for. ]]
    contexts: null,
    title: 'ProcessReceipt grants a purchase without consulting the receipt id',
    // Roblox RE-DELIVERS a receipt — on the next join, on another server, after a restart — until
    // a call returns PurchaseGranted, and again if that reply is lost in flight. A handler that
    // never looks at `receiptInfo.PurchaseId` cannot tell a redelivery from a new purchase, so one
    // payment grants the product two or three times: currency minted by the payment system itself.
    // ProfileService's reference implementation builds a whole PurchaseIdLog around this.
    why: 'Roblox re-delivers receipts until one is granted; without PurchaseId the same payment is granted repeatedly',
    find({ src }) {
      const out = [];
      //[[ FILE-SCOPED, not body-scoped, and the verifier made that correction. A correct handler
      //   often delegates the idempotency check to a same-file helper, so requiring the id inside
      //   the handler body fires on code that is right. Requiring it anywhere in the file still
      //   catches the bad shape and leaves both Roblox's canonical UpdateAsync-log implementation
      //   and ProfileService's own example clean. ]]
      if (/\bPurchaseId\b/.test(src)) return out;
      const re = /(?:MarketplaceService\s*\.\s*)?ProcessReceipt\s*=\s*function\s*\(/g;
      let m;
      while ((m = re.exec(src))) {
        const body = src.slice(m.index, blockEnd(src, m.index));
        if (/PurchaseGranted/.test(body)) {
          out.push({ line: lineOf(src, m.index), detail: 'ProcessReceipt returns PurchaseGranted and the file never reads receiptInfo.PurchaseId' });
        }
      }
      return out;
    },
  },
  {
    id: 'remote-parented-before-handler',
    severity: 'error',
    contexts: null,
    title: 'Remote is replicated before its handler is attached',
    // Between `.Parent = ReplicatedStorage` and `:Connect`, the remote is callable by every client
    // and has no listener. A FireServer in that window is silently discarded — the player's first
    // click does nothing, with no error anywhere to find later. On a RemoteFunction it is worse:
    // InvokeServer against an unset OnServerInvoke raises on the client and kills that thread. The
    // window is real whenever anything yields between the two, which is why Knit has a lifecycle.
    why: 'a remote is callable the instant it replicates; parent it AFTER its handler is connected',
    find({ src }) {
      const out = [];
      const decl = /local\s+(\w+)\s*=\s*Instance\.new\s*\(\s*["'](?:Unreliable)?Remote(?:Event|Function)["']/g;
      let m;
      while ((m = decl.exec(src))) {
        const name = m[1];
        const parent = new RegExp(`\\b${name}\\.Parent\\s*=`).exec(src);
        const handler = new RegExp(`\\b${name}\\.(?:OnServerEvent|OnServerInvoke)`).exec(src);
        if (!parent || !handler) continue;
        if (parent.index >= handler.index) continue;
        //[[ Only when something YIELDS in the gap. Parent-then-connect with no yield between is
        //   two statements in one resumption of the same thread: no client can run in between, so
        //   there is no window and no bug. Requiring the yield is what keeps this off correct
        //   code that simply orders its lines the other way. ]]
        const gap = src.slice(parent.index, handler.index);
        if (!YIELDS.test(gap)) continue;
        out.push({
          line: lineOf(src, parent.index),
          detail: `\`${name}\` is parented (replicated) before its handler, and the gap yields — calls in that window are silently dropped`,
        });
      }
      return out;
    },
  },

];

function matches(src, re, detail) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src))) out.push({ line: lineOf(src, m.index), detail: detail(m) });
  return out;
}

function lineMatches(src, pred, detail) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (pred(line)) out.push({ line: i + 1, detail });
  });
  return out;
}

export const RULE_IDS = RULES.map((r) => r.id);
const BY_ID = new Map(RULES.map((r) => [r.id, r]));

/**
 * Run the rules over one Luau source file.
 * @param {string} source
 * @param {{context?: 'server'|'client'|'module'|'unknown', rules?: string[]}} [opts]
 *   context overrides inference; rules restricts the run to the named subset.
 * @returns {{context: string, findings: Array<{rule, severity, title, why, line, detail}>, ruleIds: string[], skipped: string[]}}
 */
export function analyzeLuau(source, opts = {}) {
  const src = stripComments(source);
  const context = opts.context ?? inferContext(src);
  const wanted = opts.rules?.length ? opts.rules : RULE_IDS;
  const unknown = wanted.filter((id) => !BY_ID.has(id));
  if (unknown.length) throw new Error(`unknown anti-pattern rule(s): ${unknown.join(', ')}`);
  const findings = [];
  const skipped = [];
  for (const id of wanted) {
    const rule = BY_ID.get(id);
    // A context-scoped rule on a file of the other kind is SKIPPED, not passed. Reporting it as
    // clean would let a task claim coverage the analyzer never actually attempted.
    if (rule.contexts && !rule.contexts.includes(context)) {
      skipped.push(rule.id);
      continue;
    }
    for (const hit of rule.find({ src, context })) {
      findings.push({ rule: rule.id, severity: rule.severity, title: rule.title, why: rule.why, line: hit.line, detail: hit.detail });
    }
  }
  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return { context, findings, ruleIds: wanted.filter((id) => !skipped.includes(id)), skipped };
}

/** True when `ruleId` fired at least once in an analyzeLuau result. */
export function fired(result, ruleId) {
  return result.findings.some((f) => f.rule === ruleId);
}

/**
 * Grader entry point for the `no_antipattern` check type.
 * Passes when none of the requested rules fire. `rules` defaults to the error-severity set, so a
 * task opts in to the warn-level rules explicitly rather than being surprised by a style deduction.
 */
export function checkNoAntipattern(code, opts = {}) {
  if (!code || !code.trim()) return { passed: false, detail: 'no code to analyze (no fenced code block found)' };
  const rules = opts.rules?.length ? opts.rules : RULES.filter((r) => r.severity === 'error').map((r) => r.id);
  let result;
  try {
    result = analyzeLuau(code, { context: opts.context, rules });
  } catch (e) {
    return { passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
  if (!result.findings.length) {
    const ran = result.ruleIds.length;
    const skipped = result.skipped.length ? `, ${result.skipped.length} skipped as ${result.context}-inapplicable` : '';
    return { passed: true, detail: `no anti-patterns (${ran} rule(s) run as ${result.context}${skipped})` };
  }
  const first = result.findings[0];
  return {
    passed: false,
    detail: `${result.findings.length} finding(s); line ${first.line} ${first.rule}: ${first.why}`,
  };
}
