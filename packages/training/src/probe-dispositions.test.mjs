// A fall-through must not render as a finding.
//
// WHY THIS EXISTS. The disposition ladder in `probe-github-leads.mjs` read:
//
//   permissive && !archived ? 'admit_candidate'
//     : none_declared ? 'reject_no_licence_grant'
//       : copyleft ? 'hold_copyleft_review'
//         : 'hold_licence_unmapped'
//
// An ARCHIVED repository with an ordinary MIT licence fails the first clause, is not none_declared
// and is not copyleft, so it falls off the end onto "the licence could not be mapped". Sixty
// repositories sat under that sentence in a committed artifact: 53 MIT, 5 Apache-2.0, 1 CC0-1.0,
// 1 Unlicense. Every one of those ids is in the permit policy. None was unmapped. They are archived.
//
// A wrong reason is worse than no reason, because a reason gets believed and never re-opened. This
// is the same shape as "NO licence file found at the repository root" written over eleven roots that
// had one, and as 5.45 GB of repository standing in for Luau volume.
//
// WHAT THIS PROVES, STATED NARROWLY: that every repository in the artifact carries the disposition
// the ladder derives from its own fields; that archived-and-permissive is recorded as archived; that
// `hold_licence_unmapped` is reserved for licences that genuinely are not mapped; and that
// hold_archived stays a HOLD rather than becoming a rejection or an admission.
//
// It proves nothing about whether archived source should enter a corpus. That is a judgement, and
// leaving it open is the point of a hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dispositionFor } from './probe-github-leads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = join(ROOT, 'discovery/v2/github-probed.jsonl');

test('an archived MIT repository is recorded as archived, not as licence-unmapped', () => {
  for (const spdx of ['MIT', 'Apache-2.0', 'CC0-1.0', 'Unlicense']) {
    const row = { license_class: 'permissive_osi', api_license_guess: spdx, archived: true };
    assert.equal(dispositionFor(row), 'hold_archived',
      `an archived ${spdx} repository was filed under a reason that is not the reason`);
    assert.equal(dispositionFor({ ...row, archived: false }), 'admit_candidate');
  }

  // The bucket the fall-through stole from: a licence that genuinely is not in the policy.
  assert.equal(dispositionFor({ license_class: 'custom_needs_read', api_license_guess: 'CC-BY-4.0', archived: false }),
    'hold_licence_unmapped');
  // …and an archived one of those is still unmapped. Archiving is not the more interesting fact
  // about a repository whose licence nobody has classified.
  assert.equal(dispositionFor({ license_class: 'custom_needs_read', api_license_guess: 'CC-BY-SA-4.0', archived: true }),
    'hold_licence_unmapped');

  assert.equal(dispositionFor({ license_class: 'none_declared', api_license_guess: null, archived: false }),
    'reject_no_licence_grant');
  assert.equal(dispositionFor({ license_class: 'copyleft_strong', api_license_guess: 'GPL-3.0', archived: false }),
    'hold_copyleft_review');

  // No licence at all is a rejection whether or not the repository is archived. An archived hold
  // would read as "come back to this", and there is nothing to come back to.
  assert.equal(dispositionFor({ license_class: 'none_declared', api_license_guess: null, archived: true }),
    'reject_no_licence_grant');

  // Derived from the SPDX id when license_class is absent, so a caller cannot get a different
  // answer by omitting the field.
  assert.equal(dispositionFor({ api_license_guess: 'MIT', archived: false }), 'admit_candidate');
  assert.equal(dispositionFor({ api_license_guess: 'GPL-3.0', archived: false }), 'hold_copyleft_review');
  assert.equal(dispositionFor({ api_license_guess: null, archived: false }), 'reject_no_licence_grant');
});

test('every row in the artifact carries the disposition its own fields derive',
  { skip: !existsSync(ARTIFACT) && 'the probe has not been run' }, () => {
    const rows = readFileSync(ARTIFACT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(rows.length > 1000, `the artifact holds ${rows.length} rows — this would check almost nothing`);

    const probed = rows.filter((r) => r.probe_status === 'ok');
    assert.ok(probed.length > 1000);
    for (const r of probed) {
      assert.equal(r.disposition, dispositionFor(r),
        `${r.source_id}: filed as ${r.disposition} while its own fields derive ${dispositionFor(r)}`);
    }

    // The bucket that was wrong must now be non-empty and must hold only archived repositories,
    // or this test is asserting against a state nobody is in.
    const archived = probed.filter((r) => r.disposition === 'hold_archived');
    assert.ok(archived.length > 0, 'no repository is held for being archived, so this check proves nothing');
    for (const r of archived) {
      assert.equal(r.archived, true, `${r.source_id} is held for being archived and is not archived`);
      assert.equal(r.license_class, 'permissive_osi',
        `${r.source_id} is held for being archived when its licence is the more interesting fact`);
      assert.match(String(r.disposition_reason), /does not withdraw the licence/,
        `${r.source_id} is held for being archived without saying that archiving is not a rights event`);
    }

    // A hold is not a rejection and not an admission.
    for (const r of probed) {
      if (String(r.disposition).startsWith('hold_')) {
        assert.notEqual(r.admitted_to_training, true, `${r.source_id}: a held repository was admitted`);
      }
    }

    // And nothing that is genuinely unmapped may hide in the new bucket.
    for (const r of probed.filter((x) => x.disposition === 'hold_licence_unmapped')) {
      assert.notEqual(r.license_class, 'permissive_osi',
        `${r.source_id}: a mapped permissive licence is still filed as unmapped`);
    }
  });
