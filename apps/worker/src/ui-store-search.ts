// The Creator Store UI image library (D-UISTORE-1): tens of thousands of free Roblox Creator Store
// decals, each resolved to the Image asset id that ImageLabel.Image / ImageButton.Image actually
// render (a Decal id there shows nothing). Harvested keyless by
// packages/asset-library/ui-store/harvest-creator-store-ui.mjs and compiled into
// packages/asset-library/ui-store/index.json by build.mjs, which this module imports into the
// bundle the way fx-library.ts imports the sound index.
//
// Pure: no env, no network, no Studio. Every id it returns is one Roblox's own details endpoint
// reported as the decal's texture, and whose thumbnail was not moderated at harvest time; nothing
// needs uploading, the id is set directly.
import store from '../../../packages/asset-library/ui-store/index.json' with { type: 'json' };

type Row = [number, number, string, number, number, number, number, number[]];

const ROWS = store.rows as Row[];
const KEYWORDS = store.keywords as string[];
export const UI_STORE_KINDS: readonly string[] = store.kinds;
export const UI_STORE_GENRES: readonly string[] = store.genres;
export const UI_STORE_COUNT: number = ROWS.length;

export interface UiStoreHit {
  imageId: number;
  image: string;
  decalId: number;
  name: string;
  verifiedCreator: boolean;
  upVotes: number;
  kind: string;
  genres: string[];
  page: string;
  licence: string;
  score: number;
}

export interface UiStoreQuery {
  query?: string;
  genre?: string;
  kind?: string;
  limit?: number;
}

// "ui", "icon" and the like say nothing about which image: everything here is a UI image.
const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'with', 'to', 'in', 'on', 'my', 'ui', 'gui', 'image', 'images', 'decal', 'decals', 'picture', 'roblox', 'png', 'asset']);
// Query words that name a kind: a soft boost when no explicit kind was given.
const KIND_WORDS: Record<string, string> = {
  button: 'button', btn: 'button', frame: 'frame', panel: 'frame', window: 'frame', popup: 'frame', dialog: 'frame',
  bar: 'bar', healthbar: 'bar', progress: 'bar', hotbar: 'bar', background: 'background', bg: 'background', wallpaper: 'background',
  gradient: 'background', border: 'border', outline: 'border', badge: 'badge', medal: 'badge', rank: 'badge', emoji: 'emoji',
  emote: 'emoji', font: 'text', letter: 'text', number: 'text', logo: 'text', cursor: 'cursor', crosshair: 'cursor', icon: 'icon',
};

/** "Coin_Pickup-02" -> coin, pickup, 02, with a plural s dropped so "coins" finds "Coin". */
export function uiStoreTokens(s: string): string[] {
  return String(s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

// Built on first use: token -> row indexes, separately for names and for the words that found a row.
let nameIndex: Map<string, number[]> | null = null;
let keywordIndex: Map<string, number[]> | null = null;
let byImage: Map<number, number> | null = null;

function indexes(): { names: Map<string, number[]>; keywords: Map<string, number[]> } {
  if (nameIndex && keywordIndex) return { names: nameIndex, keywords: keywordIndex };
  const names = new Map<string, number[]>();
  const keywords = new Map<string, number[]>();
  const put = (m: Map<string, number[]>, t: string, i: number) => {
    const list = m.get(t);
    if (!list) m.set(t, [i]);
    else if (list[list.length - 1] !== i) list.push(i);
  };
  const kwTokens = KEYWORDS.map((k) => uiStoreTokens(k));
  ROWS.forEach((row, i) => {
    for (const t of uiStoreTokens(row[2])) put(names, t, i);
    for (const k of row[7]) for (const t of kwTokens[k] ?? []) put(keywords, t, i);
  });
  nameIndex = names;
  keywordIndex = keywords;
  return { names, keywords };
}

function genresOf(mask: number): string[] {
  return UI_STORE_GENRES.filter((_, i) => mask & (1 << i));
}

function hit(i: number, score: number): UiStoreHit {
  const r = ROWS[i]!;
  const decalId = r[0] + r[1];
  return {
    imageId: r[0],
    image: `rbxassetid://${r[0]}`,
    decalId,
    name: r[2],
    verifiedCreator: r[3] === 1,
    upVotes: r[4],
    kind: UI_STORE_KINDS[r[5]] ?? 'icon',
    genres: genresOf(r[6]),
    page: `https://create.roblox.com/store/asset/${decalId}`,
    licence: 'Roblox Creator Store free asset (usable in any experience by id)',
    score: Math.round(score * 100) / 100,
  };
}

/** Quality alone: a verified creator and votes lift a row among equals. */
function quality(r: Row): number {
  return (r[3] === 1 ? 1 : 0) + Math.min(1.5, Math.log10(1 + r[4]) * 0.5);
}

/**
 * Ranked UI images for plain words. `kind` filters (one of UI_STORE_KINDS); `genre` lifts rows found
 * by that genre's searches without hiding general-purpose ones. Rows are ranked first by how many of
 * the query's words they carry, then by where (name over search keyword), kind, genre and quality.
 */
export function findUiStoreImages(q: UiStoreQuery = {}): UiStoreHit[] {
  const limit = Math.max(1, Math.min(60, Math.floor(Number(q.limit) || 12)));
  const kind = q.kind && UI_STORE_KINDS.includes(q.kind) ? UI_STORE_KINDS.indexOf(q.kind) : -1;
  if (q.kind && kind < 0) return [];
  const genreBit = q.genre ? 1 << UI_STORE_GENRES.indexOf(q.genre) : 0;
  if (q.genre && !UI_STORE_GENRES.includes(q.genre)) return [];
  const tokens = [...new Set(uiStoreTokens(q.query ?? '').filter((t) => !STOP.has(t)))];
  const impliedKind = kind < 0 ? tokens.map((t) => KIND_WORDS[t]).find(Boolean) : undefined;
  const implied = impliedKind ? UI_STORE_KINDS.indexOf(impliedKind) : -1;

  const cover = new Map<number, number>(); // row -> query words matched
  const score = new Map<number, number>();
  if (tokens.length) {
    const { names, keywords } = indexes();
    tokens.forEach((t) => {
      const best = new Map<number, number>(); // this word's best hit per row
      const mark = (list: number[] | undefined, w: number) => { for (const i of list ?? []) if ((best.get(i) ?? 0) < w) best.set(i, w); };
      mark(names.get(t), 4);
      // A prefix ("sett" -> "settings") counts for less, and only from three letters on.
      if (t.length >= 3) for (const [word, list] of names) if (word !== t && word.startsWith(t)) mark(list, 2);
      mark(keywords.get(t), 1.5);
      for (const [i, w] of best) { cover.set(i, (cover.get(i) ?? 0) + 1); score.set(i, (score.get(i) ?? 0) + w); }
    });
  }
  const ranked: Array<[number, number, number]> = []; // [row, coverage, score]
  const consider = (i: number, c: number, s: number) => {
    const r = ROWS[i]!;
    if (kind >= 0 && r[5] !== kind) return;
    let v = s + quality(r);
    if (implied >= 0 && r[5] === implied) v += 2;
    if (genreBit && r[6] & genreBit) v += 2;
    // A long name that happens to hold the word is a worse answer than one that is about it.
    v -= Math.max(0, uiStoreTokens(r[2]).length - tokens.length) * 0.15;
    ranked.push([i, c, v]);
  };
  if (tokens.length) for (const [i, c] of cover) consider(i, c, score.get(i) ?? 0);
  else if (kind >= 0 || genreBit) ROWS.forEach((_, i) => consider(i, 0, 0));
  ranked.sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0] - b[0]);
  return ranked.slice(0, limit).map(([i, , v]) => hit(i, v));
}

/** The library row for an Image id (a number or rbxassetid://...), or null when it is not one. */
export function uiStoreImage(id: number | string): UiStoreHit | null {
  const m = /^(?:rbxassetid:\/\/)?(\d{1,20})$/.exec(String(id).trim());
  if (!m) return null;
  if (!byImage) { byImage = new Map(); ROWS.forEach((r, i) => byImage!.set(r[0], i)); }
  const i = byImage.get(Number(m[1]));
  return i === undefined ? null : hit(i, 0);
}
