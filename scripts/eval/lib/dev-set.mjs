// Reads the 60 frozen dev requests from planning/STUDPILOT-TEST-SET-DEV.md, by id. Read-only: this
// module has no write path to that file, and the manifest of every run records the file's sha256 so
// an edited request cannot hide.
//
// A request line looks like `- U01: a shop screen for a pet simulator ...`. The text is everything
// after the first `: `, exactly as written (typos included), with only the line end trimmed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..', '..');
export const DEV_SET_PATH = join(REPO_ROOT, 'planning', 'STUDPILOT-TEST-SET-DEV.md');

/** The four categories, by the letter every id starts with. */
export const CATEGORIES = { U: 'ui', S: 'systems', P: 'props', Z: 'zones' };
export const EXPECTED_PER_CATEGORY = 15;

const LINE = /^- ([USPZ])(\d{2}): (.+?)\s*$/;

/** Parse the markdown into [{ id, category, text }] in file order. Throws if the set is not the frozen 60. */
export function parseDevSet(markdown) {
  const requests = [];
  for (const line of String(markdown).split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    requests.push({ id: `${m[1]}${m[2]}`, category: CATEGORIES[m[1]], text: m[3] });
  }
  const ids = new Set(requests.map((r) => r.id));
  if (ids.size !== requests.length) throw new Error('dev set: a request id appears twice');
  for (const [letter, category] of Object.entries(CATEGORIES)) {
    const own = requests.filter((r) => r.category === category);
    if (own.length !== EXPECTED_PER_CATEGORY) throw new Error(`dev set: expected ${EXPECTED_PER_CATEGORY} ${category} requests, found ${own.length}`);
    for (let n = 1; n <= EXPECTED_PER_CATEGORY; n++) {
      const id = `${letter}${String(n).padStart(2, '0')}`;
      if (!ids.has(id)) throw new Error(`dev set: ${id} is missing`);
    }
  }
  return requests;
}

export function loadDevSet(path = DEV_SET_PATH) {
  const bytes = readFileSync(path);
  return { requests: parseDevSet(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex'), path };
}

/** One request by id (case-insensitive: `u01` finds `U01`). Throws with the valid ids when it is unknown. */
export function getRequest(id, path = DEV_SET_PATH) {
  const { requests, sha256 } = loadDevSet(path);
  const wanted = String(id ?? '').toUpperCase();
  const found = requests.find((r) => r.id === wanted);
  if (!found) throw new Error(`unknown request id "${id}"; the dev set has ${requests.map((r) => r.id).join(' ')}`);
  return { ...found, devSetSha256: sha256 };
}
