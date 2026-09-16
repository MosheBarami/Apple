/**
 * WHAT THE BOT SAYS BACK, CHECKED AGAINST DISCORD'S SCHEMA AND AGAINST THE ACCOUNT RULES.
 *
 * Two different kinds of fact live here and both matter.
 *
 * SHAPE. Discord accepts an interaction response with a callback `type` and, for a message, a
 * `data` object. Type 4 is a message now; type 5 is "I have heard you, I will edit this in a
 * moment" — the only legal answer when the work takes longer than Discord's three-second wall.
 * Getting the number wrong does not fail loudly: the user sees "the application did not respond"
 * and nothing says why.
 *
 * AUTHORITY. A Discord user id is a number in a webhook body. Every command that reads or spends
 * an Apple account must refuse before it touches anything unless that Discord user has redeemed a
 * code minted by a signed-in owner of the account. `/link` and `/unlink` are the only commands
 * that may run without one, because they are how the link is made and broken.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  handleInteraction,
  CALLBACK,
  EPHEMERAL,
  MAX_CONTENT,
  COMMANDS,
  COMMAND_NAMES,
  progressLine,
  rateLimitForCommand,
  RATE_DEFAULT,
} from '../src/discord.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The screen the bot sends unlinked people to, read as text so the bot cannot name a button that is not there. */
const SETTINGS_TSX = readFileSync(join(HERE, '..', '..', 'web', 'src', 'routes', 'settings.tsx'), 'utf8');

// ------------------------------------------------------------------ fixtures

const LINK = {
  discordUserId: '4242',
  appleUserId: 'apple-user-1',
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'Lava Obby',
  linkedAt: 1,
};

const QUOTA = {
  creditsRemaining: 140,
  creditsDaily: 200,
  creditsMonthly: 4000,
  creditsUsedToday: 60,
  creditsUsedThisMonth: 900,
  resetsAtIso: new Date(Date.now() + 5 * 3600_000).toISOString(),
  plan: 'builder',
  allowanceRemaining: 140,
  credits: 0,
};

const RUN = {
  msgId: 'm1',
  mode: 'stone',
  phase: 'writing_luau',
  step: 4,
  totalSteps: 12,
  text: '',
  tools: [{ toolId: 't1', tool: 'create_instance', ok: true, summary: 'made a part', durationMs: 10 }],
  startedAt: 1,
};

function ports(over = {}) {
  const calls = [];
  const base = {
    calls,
    rateLimit: async (...a) => {
      calls.push(['rateLimit', ...a]);
      return { ok: true };
    },
    redeemLinkCode: async (...a) => {
      calls.push(['redeemLinkCode', ...a]);
      return { ok: true, link: LINK, replaced: null };
    },
    removeLink: async (...a) => {
      calls.push(['removeLink', ...a]);
      return true;
    },
    findLink: async (...a) => {
      calls.push(['findLink', ...a]);
      return LINK;
    },
    quota: async (...a) => {
      calls.push(['quota', ...a]);
      return QUOTA;
    },
    projectHealth: async (...a) => {
      calls.push(['projectHealth', ...a]);
      return { agentStatus: 'idle', pluginConnected: true };
    },
    run: async (...a) => {
      calls.push(['run', ...a]);
      return RUN;
    },
    startBuild: async (...a) => {
      calls.push(['startBuild', ...a]);
      return { ok: true };
    },
    watchRun: async (...a) => {
      calls.push(['watchRun', ...a]);
    },
    projectUrl: (id) => `https://apple.test/app/projects/${id}`,
  };
  return Object.assign(base, over);
}

const cmd = (name, options = []) => ({
  id: '1',
  application_id: '900',
  token: 'interaction-token',
  type: 2,
  member: { user: { id: '4242' } },
  data: { name, options },
});

/** Every message we ever send must be shaped the way Discord documents, and be ephemeral. */
function assertMessage(body) {
  assert.equal(body.type, CALLBACK.MESSAGE, 'a message response is callback type 4');
  assert.equal(typeof body.data.content, 'string');
  assert.ok(body.data.content.length > 0, 'a message with no content renders as a blank reply');
  assert.ok(body.data.content.length <= MAX_CONTENT, `discord refuses content over ${MAX_CONTENT} characters`);
  assert.equal(body.data.flags & EPHEMERAL, EPHEMERAL, 'balances and build progress are account facts, not channel content');
}

// -------------------------------------------------------------- the commands

test('the registered command list is what the router actually handles', async () => {
  // A command Discord offers but the worker cannot answer is a dead branch the user finds first.
  for (const c of COMMANDS) {
    assert.equal(c.type, 1, `${c.name} must be CHAT_INPUT`);
    assert.ok(c.description.length > 0 && c.description.length <= 100, `${c.name} needs a description Discord will accept`);
    const out = await handleInteraction(cmd(c.name, (c.options ?? []).map((o) => ({ name: o.name, value: 'AAAABBBB' }))), ports());
    assert.doesNotMatch(JSON.stringify(out.body), /has no ..\//, `${c.name} is registered but unhandled`);
  }
  assert.deepEqual([...COMMAND_NAMES].sort(), ['build', 'credits', 'link', 'status', 'unlink']);
});

test('/credits reports the balance, ephemerally', async () => {
  const out = await handleInteraction(cmd('credits'), ports());
  assert.equal(out.status, 200);
  assertMessage(out.body);
  assert.match(out.body.data.content, /140 Credits/);
});

test('/status reports the live run using the same words the web app uses', async () => {
  const out = await handleInteraction(cmd('status'), ports());
  assertMessage(out.body);
  assert.match(out.body.data.content, /Lava Obby/);
  assert.match(out.body.data.content, /step 4 of 12/);
  assert.equal(progressLine(null), 'Nothing is building right now.');
});

test('/status says so when Studio is not attached, rather than implying all is well', async () => {
  const p = ports({ projectHealth: async () => ({ agentStatus: 'idle', pluginConnected: false }) });
  const out = await handleInteraction(cmd('status'), p);
  assert.match(out.body.data.content, /Studio is not connected/);
});

test('/build answers with a DEFERRED response, because a build outlives the three-second wall', async () => {
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby with 6 stages' }]), ports());
  assert.equal(out.status, 200);
  assert.equal(out.body.type, CALLBACK.DEFERRED_MESSAGE, 'type 5 — the loading state');
  assert.equal(out.body.data.flags & EPHEMERAL, EPHEMERAL);
  assert.equal(out.body.data.content, undefined, 'a deferred ack carries no content; the edit carries it');
  assert.deepEqual(out.reply, { applicationId: '900', token: 'interaction-token' });
  assert.equal(typeof out.deferred, 'function');
});

test('/build starts the run and hands the loading message to the progress pusher', async () => {
  const p = ports();
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  const names = p.calls.map((c) => c[0]);
  assert.ok(names.includes('startBuild'), 'the build must actually start');
  assert.ok(names.includes('watchRun'), 'nothing would ever edit the loading message otherwise');
  assert.deepEqual(
    p.calls.find((c) => c[0] === 'startBuild').slice(1),
    [LINK.projectId, 'a lava obby'],
  );
  assert.equal(edits.length, 1);
  assert.ok(edits[0].length <= MAX_CONTENT);
});

test('/build refuses before spending anything when Studio is not connected', async () => {
  const p = ports({ projectHealth: async () => ({ agentStatus: 'idle', pluginConnected: false }) });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  assert.equal(
    p.calls.some((c) => c[0] === 'startBuild'),
    false,
    'a build with nowhere to land must not burn the allowance',
  );
  assert.match(edits[0], /Studio is not connected/);
});

test('/build does not start a second run on top of a live one', async () => {
  const p = ports({ projectHealth: async () => ({ agentStatus: 'running', pluginConnected: true }) });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'again' }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  assert.equal(
    p.calls.some((c) => c[0] === 'startBuild'),
    false,
  );
  assert.match(edits[0], /already building/);
});

test('a refused start is reported in the loading message, not left spinning forever', async () => {
  const p = ports({ startBuild: async () => ({ ok: false, error: 'out of Credits for today' }) });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  assert.match(edits[0], /out of Credits for today/);
  assert.equal(
    p.calls.some((c) => c[0] === 'watchRun'),
    false,
    'there is no run to watch',
  );
});

test('/build refuses a project Apple could not look at, instead of building into the dark', async () => {
  // A null health is a FAILURE TO LOOK, never a clean bill of health. Both guards above the start
  // are written `health && ...`, so an unreachable project skips BOTH of them and the run begins:
  // the "Studio is not connected" refusal that exists to protect the allowance, and the "already
  // building" refusal that stops a second run landing on a live one. /status already separates
  // "could not reach" from "idle" for exactly this reason; the spending path must separate them
  // too, because here being wrong costs Credits rather than a confusing sentence.
  const p = ports({ projectHealth: async () => null });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  assert.equal(
    p.calls.some((c) => c[0] === 'startBuild'),
    false,
    'a project we could not read may not be charged for a build we cannot see land',
  );
  assert.equal(
    p.calls.some((c) => c[0] === 'watchRun'),
    false,
    'there is no run to watch',
  );
  assert.match(edits[0], /could not reach/i);
  assert.doesNotMatch(edits[0], /starting/i, 'nothing started, so nothing may say it did');
});

// ------------------------------------------------------------------ the link

test('the unlinked message sends people to a control that actually exists', async () => {
  // The bot is the only instruction an unlinked user gets, and it is written in a different file
  // from the screen it describes. Bolded words in that message are things the reader will hunt for
  // by name, so every one of them is checked against the settings screen's real source. A message
  // naming a button nobody can find is indistinguishable, from the user's side, from a broken bot.
  const out = await handleInteraction(cmd('status'), ports({ findLink: async () => null }));
  const content = out.body.data.content;
  const labels = [...content.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
  assert.ok(labels.length > 0, 'the message must name the control, not gesture at it');
  for (const label of labels) {
    assert.ok(
      SETTINGS_TSX.includes(label),
      `the bot tells people to look for "${label}", which appears nowhere in the settings screen`,
    );
  }
});

test('an unlinked Discord user cannot read or spend anything', async () => {
  for (const name of ['build', 'status', 'credits']) {
    const p = ports({ findLink: async () => null });
    const out = await handleInteraction(cmd(name, [{ name: 'prompt', value: 'x' }]), p);
    assertMessage(out.body);
    assert.match(out.body.data.content, /not connected to Apple/);
    // `rateLimit` is not "touching the account" — it is keyed on the Discord user id and reads
    // nothing of anybody's. It has to run for an unlinked caller precisely BECAUSE the refusal is
    // free: a stranger who is only ever told "not connected" must still be stoppable.
    const touched = p.calls.map((c) => c[0]).filter((n) => n !== 'findLink' && n !== 'rateLimit');
    assert.deepEqual(touched, [], `/${name} must refuse before touching the account`);
    assert.equal(p.calls[0][0], 'rateLimit', `/${name} is limited before anything is looked up`);
  }
});

test('/link redeems the code and names the project it connected', async () => {
  const p = ports();
  const out = await handleInteraction(cmd('link', [{ name: 'code', value: ' abcd-efgh ' }]), p);
  assertMessage(out.body);
  assert.match(out.body.data.content, /Lava Obby/);
  assert.deepEqual(p.calls[0], ['rateLimit', '4242', 'link'], '/link is limited too, or it is the way in past the limiter');
  assert.deepEqual(p.calls[1], ['redeemLinkCode', '4242', 'abcd-efgh'], 'the code is trimmed, never the id');
});

test('a wrong code and a throttled caller are told different things', async () => {
  const bad = await handleInteraction(cmd('link', [{ name: 'code', value: 'NOPE' }]), ports({ redeemLinkCode: async () => ({ ok: false, reason: 'invalid' }) }));
  assert.match(bad.body.data.content, /not valid|expired/);
  const stop = await handleInteraction(cmd('link', [{ name: 'code', value: 'NOPE' }]), ports({ redeemLinkCode: async () => ({ ok: false, reason: 'throttled' }) }));
  assert.match(stop.body.data.content, /Too many wrong codes/);
});

test('re-linking to a different project says what it replaced', async () => {
  const p = ports({
    redeemLinkCode: async () => ({ ok: true, link: LINK, replaced: { ...LINK, projectId: 'other', projectName: 'Old Tycoon' } }),
  });
  const out = await handleInteraction(cmd('link', [{ name: 'code', value: 'AAAA' }]), p);
  assert.match(out.body.data.content, /Old Tycoon/);
});

test('/unlink works without a link and does not pretend it removed one', async () => {
  const out = await handleInteraction(cmd('unlink'), ports({ removeLink: async () => false }));
  assertMessage(out.body);
  assert.match(out.body.data.content, /was not connected/);
});

// ------------------------------------------------- text the user controls

test('nothing the user types can mention anyone', async () => {
  // The prompt is echoed back. Without an explicit allowed_mentions, Discord parses mentions out
  // of whatever we send — so `@everyone` in a prompt becomes a ping issued by the bot.
  const p = ports();
  const link = await handleInteraction(cmd('link', [{ name: 'code', value: 'AAAA' }]), p);
  const credits = await handleInteraction(cmd('credits'), p);
  for (const out of [link, credits]) {
    assert.deepEqual(out.body.data.allowed_mentions, { parse: [] }, 'echoed user text must never be able to ping a server');
  }
});

test('an enormous prompt cannot produce a message Discord will reject', async () => {
  const p = ports();
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'x'.repeat(50_000) }]), p);
  const edits = [];
  await out.deferred(async (content) => void edits.push(content));
  assert.ok(edits[0].length <= MAX_CONTENT);
});

test('an interaction Apple cannot attribute to a Discord user is refused', async () => {
  const anonymous = { ...cmd('credits'), member: undefined, user: undefined };
  const p = ports();
  const out = await handleInteraction(anonymous, p);
  assertMessage(out.body);
  assert.deepEqual(p.calls, []);
});

test('a command that is not ours is answered, not ignored', async () => {
  const out = await handleInteraction(cmd('deploy-to-prod'), ports());
  assertMessage(out.body);
  assert.match(out.body.data.content, /no .*command/);
});

/* ------------------------------------------- failing to look is not a finding --- */

/**
 * `okJson` in index.ts returns null when the Durable Object cannot be reached — the SAME null it
 * returns when the project is genuinely idle. Collapsing those two is the house's oldest bug:
 * "Nothing is building right now" is a statement about the project, and Apple is not entitled to
 * make it when it never managed to ask. The user acts on that sentence — they run `/build` on top
 * of a run they were told did not exist.
 */
test('/status does not report an unreachable project as idle', async () => {
  const p = ports({ projectHealth: async () => null, run: async () => null });
  const out = await handleInteraction(cmd('status'), p);
  assertMessage(out.body);
  assert.doesNotMatch(
    out.body.data.content,
    /Nothing is building right now/,
    'a project Apple could not reach must not be reported as idle',
  );
  assert.match(out.body.data.content, /could not reach/i, 'it must say that it failed to look');
});

test('/status still reports a genuinely idle project as idle', async () => {
  // The other half: the fix must not turn every quiet project into an error.
  const p = ports({ projectHealth: async () => ({ agentStatus: 'idle', pluginConnected: true }), run: async () => null });
  const out = await handleInteraction(cmd('status'), p);
  assert.match(out.body.data.content, /Nothing is building right now/);
});

// ------------------------------------------------- credits, before the spend

/**
 * THE REFUSAL HAS TO HAPPEN WHERE THE USER IS.
 *
 * `/build` goes through `/agent-run`, which is the same door a chat message and the eval harness
 * go through, so the run charges itself from measured usage against QuotaDO — ONE ledger, and
 * these tests do not add a second one. What they pin is that the balance is CHECKED before that
 * door is opened, because the session's own check refuses by broadcasting onto a WebSocket, and a
 * Discord interaction has no WebSocket. Without this gate the admission Credit is spent, the run
 * dies at step one, `/agent-run` still answers `started: true`, and the only thing the user ever
 * sees is a loading message that eventually says Apple could not see the build start.
 */
test('/build with no Credits is refused before anything is started or spent', async () => {
  const p = ports({ quota: async () => ({ ...QUOTA, creditsRemaining: 0, allowanceRemaining: 0, credits: 0 }) });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  assert.equal(out.body.type, CALLBACK.DEFERRED_MESSAGE, 'the balance is read after the three-second wall is met');

  const edits = [];
  await out.deferred(async (c) => void edits.push(c));
  assert.equal(edits.length, 1, 'the loading message must be resolved, not left spinning');
  assert.match(edits[0], /no Credits left/i, 'the user has to be told why nothing happened');
  assert.match(edits[0], /no Credit was spent/i, 'and that this refusal itself cost them nothing');

  const names = p.calls.map((c) => c[0]);
  assert.equal(names.includes('startBuild'), false, 'a run must not be started for an account that cannot pay for it');
  assert.equal(names.includes('watchRun'), false, 'and nothing may be watched, because nothing was started');
});

test('/build reads the balance before it reads anything else about the project', async () => {
  // Order is the property. Checking Studio first would mean an account with no Credits is told to
  // go and open Studio — sent away to fix the thing that is not the problem.
  const p = ports();
  p.quota = async (...a) => {
    p.calls.push(['quota', ...a]);
    return { ...QUOTA, creditsRemaining: 0 };
  };
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'x' }]), p);
  await out.deferred(async () => {});
  const account = p.calls.map((c) => c[0]).filter((n) => n === 'quota' || n === 'projectHealth');
  assert.equal(account[0], 'quota', 'the cheapest and most final refusal comes first');
});

test('/build refuses a balance it could not READ, instead of spending on the assumption it is fine', async () => {
  // The observation failure, in the one place where being wrong costs money. A null from `quota`
  // is "the Durable Object did not answer", not "this account has Credits".
  const p = ports({ quota: async () => null });
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'x' }]), p);
  const edits = [];
  await out.deferred(async (c) => void edits.push(c));
  assert.match(edits[0], /could not read/i, 'a failure to look must not render as an observation');
  assert.equal(p.calls.map((c) => c[0]).includes('startBuild'), false, 'nothing is started on an unknown balance');
});

test('/build with Credits still starts, so the gate is a gate and not a wall', async () => {
  const p = ports();
  const out = await handleInteraction(cmd('build', [{ name: 'prompt', value: 'a lava obby' }]), p);
  await out.deferred(async () => {});
  assert.ok(p.calls.some((c) => c[0] === 'startBuild'), 'a funded account must still be able to build');
});

test('/status reports the balance as well as the run', async () => {
  // "How is it going" and "can it keep going" are the same question mid-build: a run about to stop
  // for want of Credits reads, in a progress line alone, exactly like one about to finish.
  const p = ports();
  const out = await handleInteraction(cmd('status'), p);
  assertMessage(out.body);
  assert.match(out.body.data.content, /140 Credits/, '/status must say what is left');
  assert.ok(p.calls.some((c) => c[0] === 'quota' && c[1] === LINK.appleUserId), 'and read it for the LINKED account');
});

test('/status reports a balance it could not read as unread, never as zero', async () => {
  const p = ports({ quota: async () => null });
  const out = await handleInteraction(cmd('status'), p);
  assert.doesNotMatch(out.body.data.content, /\b0 Credits\b/, 'an unreachable QuotaDO is not an empty balance');
  assert.match(out.body.data.content, /could not read your balance/i);
});

// ------------------------------------------------------------- the limiter

test('a rate-limited Discord user reaches nothing at all', async () => {
  // Every command, including the ones that refuse for free. A limiter that only covers the
  // expensive command leaves the cheap ones as an unmetered way to drive our Durable Objects.
  for (const name of [...COMMAND_NAMES]) {
    const p = ports();
    p.rateLimit = async (...a) => {
      p.calls.push(['rateLimit', ...a]);
      return { ok: false, retryAfterS: 30 };
    };
    const out = await handleInteraction(cmd(name, [{ name: 'code', value: 'AAAABBBB' }, { name: 'prompt', value: 'x' }]), p);
    assertMessage(out.body);
    assert.match(out.body.data.content, /30 seconds/, `/${name} must say how long to wait`);
    assert.deepEqual(
      p.calls.map((c) => c[0]),
      ['rateLimit'],
      `/${name} must touch nothing once the limiter has refused`,
    );
    assert.equal(out.deferred, undefined, `/${name} must not schedule background work it was refused`);
  }
});

test('the limiter is told WHICH command, so /build can be held to a lower ceiling than /status', async () => {
  for (const name of [...COMMAND_NAMES]) {
    const p = ports();
    await handleInteraction(cmd(name, [{ name: 'code', value: 'AAAABBBB' }, { name: 'prompt', value: 'x' }]), p);
    assert.deepEqual(p.calls[0], ['rateLimit', '4242', name], 'the command name must reach the limiter');
  }
  assert.ok(rateLimitForCommand('build') < rateLimitForCommand('status'), 'the command that spends money is limited harder');
  assert.equal(rateLimitForCommand('something-else'), RATE_DEFAULT, 'an unknown command is limited, not waved through');
});

test('a PING is never rate-limited, because Discord health-checks the endpoint', async () => {
  // Discord pings the interactions URL to validate it and again afterwards. Counting those against
  // a user budget would let ordinary use knock the endpoint out of Discord's own checks — and
  // there is no user to limit: a PING carries no member and no user.
  const p = ports();
  // Recorded, not just stubbed: an override that silently forgets to push would make the
  // assertion below pass for a PING that DID consult the limiter and was let through anyway.
  p.rateLimit = async (...a) => {
    p.calls.push(['rateLimit', ...a]);
    return { ok: false, retryAfterS: 30 };
  };
  const out = await handleInteraction({ type: 1 }, p);
  assert.deepEqual(out.body, { type: CALLBACK.PONG });
  assert.deepEqual(p.calls, [], 'a PING must not consult the limiter at all');
});
