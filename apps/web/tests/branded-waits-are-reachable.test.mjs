// A LOADING SEQUENCE NOBODY CAN REACH IS NOT A LOADING SEQUENCE.
//
// `src/lib/tool-meta.ts` declares OPERATION_STEPS: six named waits — building, verifying,
// rendering, restoring, connecting, recalling — carrying twenty-one authored step labels between
// them. `src/components/loading.tsx` is the only thing that reads it, and it draws the step list
// only when `compact` is false.
//
// MEASURED 2026-09-21. There are exactly two `<Forge>` call sites in the whole app,
// `src/lib/auth.tsx` and `src/components/pairing-dialog.tsx`, and BOTH pass `compact`. So all
// twenty-one step labels render nowhere, and four of the six kinds — building, verifying,
// rendering, restoring — have no call site at all. A reader of tool-meta.ts would reasonably
// conclude the product has six branded waits. It has two headlines.
//
// This is the same shape, exactly, as the scar `src/../..` already carries in
// apps/site/src/components/Cursor.astro: `data-cursor="link"` and `data-cursor="drag"` sat on
// three elements for weeks with nothing reading them, and every reader of those files reasonably
// concluded a cursor system existed. The remedy there was stated as a choice — build the renderer
// or delete the attributes — and the reason it was a choice at all is that nothing made the
// orphan visible. This file makes it visible.
//
// ================================ WHY THE FOUR ARE EXEMPT RATHER THAN DELETED OR WIRED
//
// They are listed below with a reason each, not quietly tolerated, and the list can only shrink:
// a kind that gains a call site must come OFF it, and a kind that stops existing must come off it
// too. A seventh orphan cannot be added without this going red.
//
// They are not deleted here because the owner's instruction is explicitly that loading be a
// branded experience with a different sequence per operation, and deleting the sequences is a
// reversal of that instruction, which is not a lane's call to make silently. They are not wired
// here because the surfaces that would carry them are behind a sign-in this lane cannot complete
// — the confirmation e-mail has never reached the owner's inbox — so the pixels could not be
// looked at, and a wait animation shipped without anyone seeing it is how the product got a
// composer that was a photograph of a text field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Kinds with no call site, each with the reason it has none. Dated, because an exemption with no
 * date is an exemption nobody re-reads.
 */
const NO_CALL_SITE = {
  // 2026-09-21. `components/ws/thinking.tsx` is the build wait, and it is event-backed by
  // construction: "no fallback copy, no default stage list and no way to invent a row… no
  // percentage anywhere, because a progress figure here would be a guess presented as a
  // measurement." A four-step timer rhythm beside it would be the guess that file refuses.
  building: 'components/ws/thinking.tsx draws this wait from real tool events',
  // 2026-09-21. Same surface: the Validation stage of that timeline.
  verifying: 'components/ws/thinking.tsx draws this wait from real tool events',
  // 2026-09-21. No render operation is exposed in the product yet.
  rendering: 'no surface in the product performs this operation',
  // 2026-09-21. Checkpoint restore runs from components/ws/revisions-dialog.tsx, which has never
  // been given a branded wait.
  restoring: 'revisions-dialog.tsx restores without a branded wait — open',
};

/**
 * Pinned claim: no shipping call site renders the step list. Flip this the day one does, and when
 * you flip it, screenshot the sequence — the owner's row on branded loading asks for pixels, and
 * "the component supports it" is what that row has had instead for three weeks.
 */
const NO_STEP_LIST_SHIPS = true;

function tsxUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxUnder(full));
    else if (/\.tsx?$/.test(entry.name)) out.push({ file: relative(SRC, full), src: readFileSync(full, 'utf8') });
  }
  return out;
}

const FILES = tsxUnder(SRC);

/** Every kind OPERATION_STEPS declares, read out of the source rather than restated here. */
function declaredKinds() {
  const meta = readFileSync(join(SRC, 'lib', 'tool-meta.ts'), 'utf8');
  const block = /export const OPERATION_STEPS[^{]*\{([\s\S]*?)\n\};/.exec(meta);
  assert.ok(block, 'OPERATION_STEPS is no longer a literal object in lib/tool-meta.ts — re-aim this file');
  return [...block[1].matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]);
}

/** Every `<Forge kind="…">` in the app, with the file it is in and whether it passes `compact`. */
function forgeCallSites() {
  const out = [];
  for (const { file, src } of FILES) {
    if (file === 'components/loading.tsx') continue; // the definition, not a call site
    for (const m of src.matchAll(/<Forge\b([^>]*)>/g)) {
      const kind = /\bkind=["']([\w]+)["']/.exec(m[1]);
      out.push({ file, kind: kind ? kind[1] : null, compact: /\bcompact\b/.test(m[1]), attrs: m[1].trim() });
    }
  }
  return out;
}

test('THE INSTRUMENT: the kinds and the call sites are both actually found', () => {
  // Without this, every case below passes on an empty set — which is the failure mode that put
  // this file here in the first place.
  const kinds = declaredKinds();
  assert.ok(kinds.length >= 2, `only ${kinds.length} kind(s) parsed out of OPERATION_STEPS — the parser is broken`);
  const sites = forgeCallSites();
  assert.ok(sites.length > 0, 'no <Forge> call site found anywhere in src — the scan is broken, not the app');
  for (const s of sites) assert.ok(s.kind, `a <Forge> in ${s.file} has no kind= this scan can read: ${s.attrs}`);
});

test('every branded wait is reachable, or is named in the exemption list with a reason', () => {
  const used = new Set(forgeCallSites().map((s) => s.kind));
  const orphans = declaredKinds().filter((k) => !used.has(k) && !(k in NO_CALL_SITE));
  assert.deepEqual(
    orphans,
    [],
    `these operation kinds have step labels and no <Forge> that asks for them: ${orphans.join(', ')}. ` +
      'Give each one a call site, or add it to NO_CALL_SITE with the reason and the date.',
  );
});

test('the exemption list can only shrink: nothing exempt is also wired', () => {
  const used = new Set(forgeCallSites().map((s) => s.kind));
  const stale = Object.keys(NO_CALL_SITE).filter((k) => used.has(k));
  assert.deepEqual(stale, [], `now wired and must come off NO_CALL_SITE: ${stale.join(', ')}`);
});

test('the exemption list names no kind that has stopped existing', () => {
  const kinds = new Set(declaredKinds());
  const ghosts = Object.keys(NO_CALL_SITE).filter((k) => !kinds.has(k));
  assert.deepEqual(ghosts, [], `exempted but no longer declared in OPERATION_STEPS: ${ghosts.join(', ')}`);
});

test('every kind has a headline, and every headline has a kind', () => {
  // HEADLINE is a Record<OperationKind, string>, so TypeScript already catches a missing one — but
  // only while the two lists are in the same build, and only for someone who runs typecheck. The
  // failure this guards is the opposite one anyway: a headline left behind by a deleted kind.
  const loading = readFileSync(join(SRC, 'components', 'loading.tsx'), 'utf8');
  const block = /const HEADLINE[^{]*\{([\s\S]*?)\n\};/.exec(loading);
  assert.ok(block, 'HEADLINE is no longer a literal object in components/loading.tsx — re-aim this file');
  const headlines = [...block[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(headlines.slice().sort(), declaredKinds().slice().sort());
});

test('the claim that no shipping wait draws its step list is true, or the constant is wrong', () => {
  const sites = forgeCallSites();
  const drawsSteps = sites.filter((s) => !s.compact);
  if (NO_STEP_LIST_SHIPS) {
    assert.deepEqual(
      drawsSteps.map((s) => `${s.file} (${s.kind})`),
      [],
      'a <Forge> now renders its step list. Set NO_STEP_LIST_SHIPS to false — and screenshot the ' +
        'sequence, because that is what the owner asked for and what this has never had.',
    );
    // And the reason it draws nothing must still be the `compact` branch, not something else.
    const loading = readFileSync(join(SRC, 'components', 'loading.tsx'), 'utf8');
    assert.match(
      loading,
      /\{!compact && \(\s*<ol className="forge-steps">/,
      'the step list is no longer gated on `compact`; NO_STEP_LIST_SHIPS is measuring the wrong thing',
    );
  } else {
    assert.ok(drawsSteps.length > 0, 'NO_STEP_LIST_SHIPS is false but every call site is still compact');
  }
});
