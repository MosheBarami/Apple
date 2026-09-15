// "Why did Apple not run that script?"
//
// A tool permission removes a tool from the set the model is offered. Until now nothing said so:
// the agent simply never used it, and a capability that is silently missing reads, from the user's
// side, exactly like a broken product. The person most likely to hit this is the one who set the
// permission — and they still have to be told, because the setting is per project and per account
// and they set it three weeks ago.
//
// The failures covered here:
//
//   1. THE SENTENCE NAMES THE TOOLS IN WORDS. "run_luau was not available" is the tool table
//      leaking into the product. The panel that sets these already speaks in labels, and the
//      explanation has to use the same ones or it describes a control the user has never seen.
//   2. IT SAYS WHY. "Not available" alone reads as a fault. "You have it switched off" is a thing
//      someone can act on.
//   3. IT IS NOT DRAWN WHEN THERE IS NOTHING TO SAY. An empty list must produce no line at all,
//      not an empty one — and "nothing was withheld" must not be rendered as an announcement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'denied-')), 'a.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'tool-permissions.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });
const T = await import(`file://${out}`);

const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const THINKING = readFileSync(join(WEB, 'src', 'components', 'ws', 'thinking.tsx'), 'utf8');
const TURN = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');

/* --------------------------------------------------------------- 1 & 2. the words --- */

test('the line names the tools the way the settings panel does', () => {
  const said = T.deniedNote(['run_luau', 'delete_instances']);
  assert.match(said, /Run code in your place/, 'the tool table leaked into the product');
  assert.match(said, /Delete parts and objects/);
  assert.doesNotMatch(said, /run_luau|delete_instances/, 'a raw tool name reached the user');
});

test('and it says WHY, not just that something is missing', () => {
  // "Not available" reads as a fault in the product. The user is the one who switched it off.
  const said = T.deniedNote(['run_luau']);
  assert.match(said, /settings|turned off|switched off|not allowed/i, `no reason given: "${said}"`);
});

test('a tool with no label still gets named rather than dropped', () => {
  // GOVERNED_TOOLS is the twelve a person can set from the panel. A permission imported from a
  // file, or set by an organisation, can name any tool in the registry — and a line that silently
  // omitted it would under-report what was withheld, which is the one direction that must not
  // happen in a sentence about permissions.
  const said = T.deniedNote(['audit_build']);
  assert.match(said, /audit_build/, 'an ungoverned tool vanished from the explanation');
});

/* ------------------------------------------------------------ 3. and when silent --- */

test('nothing withheld is NO LINE, not an empty one', () => {
  assert.equal(T.deniedNote([]), null);
  assert.equal(T.deniedNote(undefined), null);
  assert.equal(T.deniedNote(['   ', '']), null, 'blank names are not a restriction');
});

/* ---------------------------------------------------------------- it is wired in --- */

test('the socket keeps the message, live and on replay', () => {
  assert.match(SOCKET, /case 'tools_denied'/, 'the wire message falls through the switch');
  assert.match(SOCKET, /deniedTools: run\.deniedTools/, 'a refresh mid-run loses it');
});

test('and the card actually renders it', () => {
  assert.match(TURN, /deniedTools/, 'the turn never passes it to the card');
  assert.match(THINKING, /deniedNote\(/, 'the card never renders the line');
});
