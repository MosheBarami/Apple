#!/usr/bin/env node
// Rewrite Golem -> Apple inside STRING LITERALS ONLY, leaving every exempt identifier alone.
//
// This exists because the rebrand is not a search-and-replace. `golem.jwt.` is a storage key prefix
// and renaming it signs every live session out; `golem_original` is an attribute already written
// into user places; `@golem/` is the workspace scope. A blanket replace across the tree would
// break all three and the damage would only show up in production.
//
// So it uses exactly the extraction and the exemption list that `check-rebrand.mjs` uses. If the
// two ever disagree, the checker is the one that is right — this is a convenience for applying what
// the checker has already found, never an authority on what should change.
//
//   node scripts/rebrand-literals.mjs --dry-run    list what would change
//   node scripts/rebrand-literals.mjs              apply it
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
for (const a of process.argv.slice(2)) {
  if (a !== '--dry-run') { console.error(`rebrand-literals: unrecognised flag ${a}`); process.exit(2); }
}

/** The CLOSED §12.5 list, plus one addition that carries its proof. */
const EXEMPT = [
  /golem\.moshe-barami111\.workers\.dev/gi,
  /golem-corpus/gi,
  /golem-docs/gi,
  /golem\.v1/gi,
  /golem\.jwt\./gi,
  /X-Golem-/gi,
  /golem_session/gi,
  /golem-ui/gi,
  /golem_original/gi,
  /golem-authored/gi,
  /@golem\//g,
  /golem-theme/gi,
  /golem\.rail\.collapsed/gi,
  /\bgolem\b(?=\{|,|\.[a-z-]+\{)/gi,
  // `golem-plugin` was removed from both lists: the built artifact's filename is the most
  // user-visible string in the product, and nothing resolves it by name. See check-rebrand.mjs.
  /MosheBarami\/golem/gi,
  // PROOF FOR THIS ADDITION: `GolemPalette` is the NAME of a ServerStorage folder inside places
  // that have already been built. Build.luau resolves it by name at runtime
  // (`PALETTE_ROOT_NAME = "GolemPalette"`), so renaming it orphans the palette in every existing
  // place and the meshes silently stop being found. That is a persisted value, which is exactly
  // the bar §12.5 sets for an exemption.
  /GolemPalette/g,
  // PROOF: an attribute sound-design.ts writes onto Sounds in the user's place and reads back to
  // recover the pre-trim volume; renaming it compounds the trim on a second pass. Full reasoning in
  // check-rebrand.mjs, which is the authority if these two ever drift.
  /GolemBaseVolume/g,
  // PROOF: the format stamp inside memory exports users already hold on disk. New exports stamp
  // `apple.memory.v1`; this survives only in the legacy list `parseImport` still accepts.
  /golem\.memory\.v1/gi,
];

const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\[\[[\s\S]*?\]\]/g;

const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.astro', '*.luau'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}).split('\n').filter(Boolean).filter((f) => f !== 'scripts/check-rebrand.mjs' && f !== 'scripts/rebrand-literals.mjs');

/**
 * Rewrite one literal, with every exempt span protected.
 *
 * The spans are blanked, the replacement runs over what is left, and the original bytes are written
 * back at their offsets. Replacement never changes length here — Golem and Apple are both five
 * characters — which is what makes restoring by offset safe. A future rename of a different length
 * would need this rewritten, and the assertion below is what would catch it.
 */
function rewrite(text) {
  const holes = [];
  let masked = text;
  for (const re of EXEMPT) masked = masked.replace(re, (m, off) => { holes.push([off, m]); return ' '.repeat(m.length); });

  const out = masked.replace(/Golem/g, 'Apple').replace(/golem/g, 'apple').replace(/GOLEM/g, 'APPLE');
  if (out.length !== masked.length) throw new Error('replacement changed the length; restoring by offset is unsafe');

  const chars = out.split('');
  for (const [off, original] of holes) for (let i = 0; i < original.length; i += 1) chars[off + i] = original[i];
  return chars.join('');
}

let occurrences = 0;
const touched = [];

for (const rel of files) {
  const path = join(ROOT, rel);
  const src = readFileSync(path, 'utf8');
  if (!/golem/i.test(src)) continue;

  const next = rel.endsWith('.astro')
    ? rewrite(src)
    : src.replace(LITERAL, (m, off) => {
        // `--[[ ... ]]` is a Luau comment, not a literal.
        if (m.startsWith('[[') && /--\s*$/.test(src.slice(Math.max(0, off - 4), off))) return m;
        return rewrite(m);
      });

  if (next === src) continue;
  let diff = 0;
  for (let i = 0; i < src.length; i += 1) if (src[i] !== next[i]) diff += 1;
  occurrences += diff;
  touched.push(rel);
  if (!DRY) writeFileSync(path, next);
}

console.log(`${DRY ? 'WOULD REWRITE' : 'REWROTE'} ${occurrences} character(s) across ${touched.length} file(s)`);
for (const t of touched) console.log(`  ${t}`);
