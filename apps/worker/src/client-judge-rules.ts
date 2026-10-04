/**
 * THE RULES OF THE CLIENT JUDGE (judge_game): seven questions a paying client asks about a finished game, each answered from
 * evidence the judge collected (client-judge.ts) and returned as a named criterion with exact evidence and a concrete fix.
 *
 *   placeholders   Is any text still a default, a "loading...", a "nil", a fake number, a developer note or another language,
 *                  or does a script sell someone else's Robux products?
 *   ui_coherence   Do the screens belong together: nothing on top of anything, one set of menu buttons, one look?
 *   buttons_work   Does every button the player can see do something when pressed?
 *   progression    Can the player earn and spend, or is it a place to walk around?
 *   errors         Did any script fail while the game was played?
 *   construction   Is what was added standing on the ground, clear of walls, near the start, with a floor under the spawn?
 *   fit_uniqueness Is anything in the game that the user did not ask for and the genre does not need, is anything there twice,
 *                  and does a source game's name still show?
 *
 * A criterion that could not be OBSERVED (no play session, no Studio answer) is `measured: false` and never `ok`: a failure to
 * look must not read as a pass.
 */
import { stripLuauComments } from './roadmap';
import { type MenuCluster, type Overlap, type StyleClash, arr, clip, competingMenus, describeStyle, lastName, readable, rec, str } from './client-judge-ui';

export type CriterionId = 'placeholders' | 'ui_coherence' | 'buttons_work' | 'progression' | 'errors' | 'construction' | 'fit_uniqueness';
export interface Criterion {
  id: CriterionId;
  ok: boolean;
  /** False when the evidence needed was not obtained; such a criterion is never ok. */
  measured: boolean;
  score: number;
  evidence: string[];
  fix: string;
  /** One plain sentence for a non-technical creator (no paths, tools or ids). Used to write forUser; not returned. */
  plain: string;
}
export const WEIGHTS: Record<CriterionId, number> = { placeholders: 15, ui_coherence: 20, buttons_work: 15, progression: 20, errors: 10, construction: 10, fit_uniqueness: 10 };
export const MAX_EVIDENCE = 8;

const pct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const cap = <T>(xs: readonly T[], n = MAX_EVIDENCE): T[] => xs.slice(0, n);
const unmeasured = (id: CriterionId, why: string, fix: string): Criterion => ({ id, ok: false, measured: false, score: 0, evidence: [`NOT OBSERVED: ${why}`], fix, plain: 'I could not test this part.' });
export { unmeasured };

/* --------------------------------------------------------------------------------------------- placeholders --- */

export type TextKind = 'default_text' | 'loading' | 'nil_value' | 'dev_note' | 'fake_number' | 'foreign_language' | 'empty_button';
export interface TextItem {
  where: string;
  text: string;
  cls: string;
  /** shown: visible at the start; hidden: inside a window the player opens; runtime: seen on the player's screen in the play session. */
  state: 'shown' | 'hidden' | 'runtime';
  via: 'screen' | 'world' | 'script' | 'player';
  /** Inside a screen that is meant to say "loading" (a splash or loading screen). */
  loadingScreen?: boolean;
  /** "Screen::Name": how the player's screen report names the same label, to tell whether a script replaced this text. */
  key?: string;
}
export interface TextFinding { kinds: TextKind[]; text: string; where: string; state: TextItem['state']; count: number; seenByPlayer?: boolean }

const DEFAULT_TEXT = /^(?:label|textlabel|textbutton|textbox|button|text|frame|imagelabel|imagebutton|placeholder|your text here|text here|sample text|example text|lorem ipsum.*|new text|enter text(?: here)?\.{0,3}|insert text|untitled|todo|tbd|(?:asdf)+|xxx+|\?{2,}|test|testing|test ?text|dummy(?: text)?|title here|name here|description here)$/i;
const LOADING = /\b(?:loading|please wait|fetching|retrieving|connecting|initiali[sz]ing)\b|^\s*(?:\.{3}|…)\s*$/i;
const NIL_WORD = /(?:^|[^a-z])(?:nil|null|undefined|nan)(?:$|[^a-z])|\[object [a-z]+\]/i;
// Case-sensitive on purpose: <PlayerName> is a template left in, <uppercase> and <b> are RichText.
const TEMPLATE = /%[sd]\b|\{\d\}|\$\{[^}]*\}|<[A-Z][A-Za-z_ ]+>|__\w+__/;
// A note to a developer, not a sentence a player answers: "Delete this UI." is one, "Are you sure you want to delete this item?" is not.
const DEV_NOTES: readonly RegExp[] = [
  /\b(?:borrar|borra este|eliminar (?:este|esto)|todo|fixme|read ?me|do not (?:touch|edit)|change (?:this|me)|edit (?:this|me)|replace (?:this|me)|put .{1,24} here|dev(?:eloper)? (?:note|only)|admin only|for testing|test only|debug|work in progress)\b/i,
  /\b(?:delete|remove) (?:this|me)(?: (?:ui|gui|sign|cartel|label|text|part|script|model|frame|button|message|note|screen|window))?\s*[.!\])]*\s*$/i,
  /\b(?:do not|don'?t) (?:delete|remove|touch) (?:this|me|it)\b/i,
  // A bracket that opens with an instruction to a developer: "[borrar este cartel]", "(delete me)", "[TODO]", "(Example does not work)".
  /[[(]\s*(?:(?:borrar|delete|remove|eliminar)\s+(?:this|me|it|esto|este|esta|cartel|sign|label)|borrar\b|todo\b|ejemplo\b|example\b|test\b|dev\b)[^\])]*[\])]/i,
];
const NON_LATIN = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const ACCENTED = /[áéíóúñüçãõâêôàèìòùäößœłşğı¿¡]/i;
// Function words and game words that are not English, chosen so that no English game text contains them.
const FOREIGN_WORDS = new Set((
  'para apretá aprieta presiona presioná correr comprar vender cerrar abrir tienda mascota mascotas monedas dinero bienvenido bienvenidos jugar empezar siguiente atrás volver cartel borrar gracias hola precio nivel aquí cuesta comprado equipar equipado desbloquear bloqueado velocidad saltar recompensa diaria ' +
  'você voce loja fechar jogar ganhar moedas obrigado ' +
  'acheter boutique fermer jouer pièces bienvenue merci niveau vitesse gagner ' +
  'kaufen schließen spielen willkommen danke münzen geschwindigkeit einstellungen verkaufen ' +
  'beli tutup mulai koin selamat kecepatan pengaturan terima kasih ' +
  'comprare negozio chiudi giocare benvenuto grazie monete').split(' '));

function numberValue(text: string): number | null {
  const m = /^\s*(?:[A-Za-z ]{0,14}[:=]\s*)?(?:R\$|\$)?\s*(\d[\d,. ]*)\s*([kmbt])?\s*(?:\/s|per second|\/sec)?\s*$/i.exec(text);
  if (!m) return null;
  const digits = m[1]!.replace(/[ ,]/g, '');
  const base = Number(digits);
  if (!Number.isFinite(base)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1;
  return base * mult;
}
export const FAKE_HUGE = 99_999;
/** 12345, 123456789: the number someone types when they mean "a number". */
const DUMMY_SEQUENCE = /(?:^|\D)(?:1234567890|123456789|12345678|1234567|123456|12345|987654321)(?:\D|$)/;
/** A rate ("$2M/s", "5 per second") is an income display; its size says nothing about a made-up balance. */
const RATE = /\/\s*(?:s|sec|second|min|hr)\b|\bper\s+(?:s|sec|second|minute|hour)\b/i;
/**
 * Where a big number is normal: a price on a buy pad or shop card, a reward, an income, a leaderboard entry. Read from the label's
 * own name and the names of the three things it sits in ("Shop.Card.ItemPrice"). A balance in the corner ("HUD.Bottom.Money") is
 * not in this list: a big number THERE was typed in by someone who never played the game.
 */
const PRICE_CONTEXT = /\b(?:price|cost|buy|purchase|sell|worth|rewards?|prize|unlock|requir\w*|upgrade|pass|shop|store|bundle|pack|offer|deal|product|income|per sec|earn|leader ?board|rank|entry|entries|prompt|pad|tier|chance|odds|damage|lucky|luck)\b/i;

/** Which placeholder-shaped problems one piece of on-screen text has. */
export function textKinds(text: string, opts: { loadingScreen?: boolean; cls?: string; foreignOk?: boolean; numbersOk?: boolean; bigNumberOk?: boolean } = {}): TextKind[] {
  const t = text.trim();
  const kinds: TextKind[] = [];
  if (!t) return opts.cls === 'TextButton' ? ['empty_button'] : kinds;
  if (DEV_NOTES.some((r) => r.test(t))) kinds.push('dev_note');
  if (NIL_WORD.test(t) || TEMPLATE.test(t)) kinds.push('nil_value');
  if (DEFAULT_TEXT.test(t)) kinds.push('default_text');
  if (!opts.loadingScreen && LOADING.test(t)) kinds.push('loading');
  if (!opts.numbersOk && !RATE.test(t)) {
    const value = numberValue(t);
    if ((value !== null && value >= FAKE_HUGE && !opts.bigNumberOk) || /([1-9])\1{4,}/.test(t) || DUMMY_SEQUENCE.test(t.replace(/,/g, ''))) kinds.push('fake_number');
  }
  if (!opts.foreignOk) {
    const words = t.toLowerCase().match(/[a-záéíóúñüçãõâêôàèìòùäößœłşğı]+/g) ?? [];
    if (NON_LATIN.test(t) || words.some((w) => FOREIGN_WORDS.has(w)) || (ACCENTED.test(t) && words.length >= 2)) kinds.push('foreign_language');
  }
  return kinds;
}

/** Text a request says is meant to be in another language. */
export const wantsOtherLanguage = (request: string): boolean =>
  /\b(?:in|to|into)\s+(?:spanish|portuguese|french|german|russian|arabic|hebrew|turkish|indonesian|italian|japanese|chinese|korean)\b/i.test(request);

/**
 * Every problem text, one finding per distinct (problem, text); a "Label" repeated on fifty cards is one finding with a count.
 * A text the player's screen showed that was already found in the screens is the same label seen twice, not another one.
 */
export function textFindings(items: readonly TextItem[], foreignOk: boolean): TextFinding[] {
  const groups = new Map<string, TextFinding>();
  const authored = new Set(items.filter((i) => i.state !== 'runtime').map((i) => i.text.trim()));
  for (const it of items) {
    const numbersOk = PRICE_CONTEXT.test(words(it.where.split('.').slice(-4).join(' ')));
    // A sign in the world shows prices, prizes, leaderboards and income; a made-up balance is a HUD problem.
    const kinds = textKinds(it.text, { loadingScreen: it.loadingScreen, cls: it.cls, foreignOk, numbersOk, bigNumberOk: it.via === 'world' });
    // What is not on screen at the start is filled in by a script before the player sees it (a "Label" on a template card, a
    // "Loading..." in a popup), so only what a script cannot fix is held against it: a note to a developer, another language.
    const real = it.state === 'hidden' ? kinds.filter((k) => k === 'dev_note' || k === 'foreign_language') : kinds;
    if (!real.length) continue;
    const key = `${real.join('+')}|${it.text.trim()}|${it.state === 'hidden' ? 'h' : 's'}`;
    const seen = groups.get(key);
    if (seen) {
      if (it.state === 'runtime') seen.seenByPlayer = true;
      if (it.state !== 'runtime' || !authored.has(it.text.trim())) seen.count += 1;
    } else groups.set(key, { kinds: real, text: it.text.trim(), where: it.where, state: it.state, count: 1, ...(it.state === 'runtime' ? { seenByPlayer: true } : {}) });
  }
  // A runtime sighting of a text the screens also hold is reported once, as the screen's label.
  for (const g of groups.values()) if (g.state === 'runtime' && authored.has(g.text)) g.state = 'shown';
  return [...groups.values()];
}

export interface PurchaseHit { id: number; path: string; line: number; snippet: string }
// GetProductInfo counts only when it asks about a developer product or a pass; with an asset id (or none) it reads a catalog item.
const PURCHASE_CALL = /\b(?:PromptProductPurchase|PromptGamePassPurchase|PromptPurchase|PromptBundlePurchase|PromptSubscriptionPurchase|UserOwnsGamePassAsync|GetProductInfo(?=\s*\([^)]*(?:Product|GamePass)\b))\s*\(([^)]*)\)/g;
const ID_ASSIGN = /\b\w*(?:product|gamepass|game_pass|bundle|subscription)\w*id\w*\s*=\s*(\d{5,})\b/gi;
const lineAt = (src: string, index: number): number => src.slice(0, index).split('\n').length;

/** Robux product / game pass ids written into scripts as numbers: someone else's products, unless they are the owner's. */
export function purchaseHits(scripts: readonly { path: string; source: string }[], own: readonly number[]): PurchaseHit[] {
  const hits: PurchaseHit[] = [];
  const seen = new Set<string>();
  for (const s of scripts) {
    const src = stripLuauComments(s.source);
    const add = (id: number, index: number, snippet: string): void => {
      if (!Number.isFinite(id) || id < 10_000 || own.includes(id)) return;
      const key = `${s.path}|${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ id, path: s.path, line: lineAt(src, index), snippet: clip(snippet.replace(/\s+/g, ' ').trim(), 100) });
    };
    for (const m of src.matchAll(PURCHASE_CALL)) for (const n of (m[1] ?? '').matchAll(/(?<![\w.])(\d{5,})(?![\w.])/g)) add(Number(n[1]), m.index ?? 0, m[0]);
    for (const m of src.matchAll(ID_ASSIGN)) add(Number(m[1]), m.index ?? 0, m[0]);
  }
  return hits;
}

const TEXT_ASSIGN = /(?:\.|\b)(?:Text|Title|PlaceholderText|ActionText|ObjectText)\s*=\s*(["'])((?:\\.|(?!\1).){2,120})\1/g;
/** Words a script puts on screen: `label.Text = "..."`, `{Title = "...", Text = "..."}`. Whether they are shown depends on the script. */
export function scriptTexts(scripts: readonly { path: string; source: string }[], max = 300): TextItem[] {
  const out: TextItem[] = [];
  for (const s of scripts) {
    for (const m of stripLuauComments(s.source).matchAll(TEXT_ASSIGN)) {
      const text = (m[2] ?? '').replace(/\\(["'\\])/g, '$1').replace(/\\n/g, ' ');
      if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(text) || /^[\w.]+$/.test(text) && text.includes('.')) continue;
      out.push({ where: s.path, text, cls: 'Script', state: 'hidden', via: 'script' });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export interface PlaceholderInput {
  items: TextItem[];
  purchases: PurchaseHit[];
  foreignOk: boolean;
  scanned: { screens: number; texts: number; worldGuis: number; worldGuisTotal: number; scripts: number; scriptsCut: boolean };
}
const KIND_WORDS: Record<TextKind, string> = {
  default_text: 'default text', loading: 'stuck "loading"', nil_value: 'empty value ("nil")', dev_note: 'developer note', fake_number: 'made-up number',
  foreign_language: 'other language', empty_button: 'blank button',
};
export function judgePlaceholders(i: PlaceholderInput): Criterion {
  const findings = textFindings(i.items, i.foreignOk);
  const shownNow = findings.filter((f) => f.state !== 'hidden');
  const evidence: string[] = [];
  for (const f of [...shownNow, ...findings.filter((x) => x.state === 'hidden')].slice(0, 5)) {
    evidence.push(`${f.kinds.map((k) => KIND_WORDS[k]).join(' + ')}: "${clip(f.text || '(empty)', 80)}" in ${f.where}${f.count > 1 ? ` (and ${f.count - 1} more like it)` : ''}${f.state === 'runtime' ? ' [seen on the player\'s screen]' : f.state === 'hidden' ? ' [inside a window the player opens]' : f.seenByPlayer ? ' [on screen at the start, and seen by the test player]' : ' [on screen at the start]'}`);
  }
  if (findings.length > 5) evidence.push(`${findings.length - 5} more placeholder texts`);
  if (i.purchases.length) {
    const ids = [...new Set(i.purchases.map((p) => p.id))];
    evidence.push(`Robux products that are not yours (${ids.length}): ${cap(i.purchases, 3).map((p) => `${p.id} in ${p.path}:${p.line} \`${p.snippet}\``).join('; ')}`);
  }
  const s = i.scanned;
  evidence.push(`Scanned ${s.texts} texts in ${s.screens} screens, ${s.worldGuis}${s.worldGuisTotal > s.worldGuis ? ` of ${s.worldGuisTotal}` : ''} signs and name tags, ${s.scripts} scripts${s.scriptsCut ? ' (script list was cut short)' : ''}.`);
  const score = pct(100 - 12 * shownNow.length - 6 * (findings.length - shownNow.length) - 15 * Math.min(3, new Set(i.purchases.map((p) => p.id)).size));
  const ok = findings.length === 0 && i.purchases.length === 0;
  const quotes = cap(shownNow.length ? shownNow : findings, 2).map((f) => `"${clip(f.text, 40)}"`);
  return {
    id: 'placeholders', ok, measured: true, score: ok ? 100 : score, evidence,
    fix: 'For each listed text: if its window belongs to a system this game does not use, delete that window (delete_instances); otherwise set_properties Text to real words for THIS game, in English, with no notes to developers. ' +
      'A stuck "loading" or "nil" means the script that fills it fails: fix that script (edit_script) or delete the label. For Robux products that are not the owner\'s: remove the purchase button and its script call, or read the id from a config module that is 0 until the owner creates the product (0 = hidden).',
    plain: ok ? 'No unfinished or copied text is on screen.' : `Some text on screen is unfinished or copied from other games${quotes.length ? `, such as ${quotes.join(' and ')}` : ''}${i.purchases.length ? ', and some Robux buttons would charge for someone else\'s products' : ''}.`,
  };
}

/* ------------------------------------------------------------------------------------------- ui coherence --- */

export interface LayoutIssue { screen: string; device: string; kind: string; path: string; detail: string }
export interface CoherenceInput {
  overlaps: Overlap[];
  menus: MenuCluster[];
  clashes: StyleClash[];
  /** Enabled screens that show something at the start, and the buttons among what is shown. */
  shownScreens: string[];
  shownButtons: number;
  layout: LayoutIssue[] | null;
  /** Screen name -> the source game it came from, when it was imported from the library. */
  sources: ReadonlyMap<string, string>;
  cutScreens: number;
  /** Screens the player's screen showed that no ScreenGui in StarterGui explains: a script builds them, so nothing here could place them. */
  scriptDrawn: string[];
  /** Nothing at all is on the player's screen at the start: no StarterGui screen shows anything and the test player saw none either. */
  empty?: boolean;
  /** A play session reached the player's screen (so `empty` is what the player saw, not only what StarterGui holds). */
  played?: boolean;
}
const HARD_LAYOUT = new Set(['overlap', 'text_overflow', 'under_top_bar']);
export const CROWDED_SCREENS = 8;
export const CROWDED_BUTTONS = 20;
export function judgeCoherence(i: CoherenceInput): Criterion {
  const evidence: string[] = [];
  const from = (screen: string): string => (i.sources.get(screen) ? ` (from "${i.sources.get(screen)}")` : '');
  const nice = (p: string): string => readable(p, 'StarterGui');
  let score = 100;
  const worst = cap(i.overlaps, 4);
  for (const o of worst) evidence.push(`${o.what === 'widgets' ? 'Screens on top of each other' : 'Buttons on top of each other'}: ${nice(o.a)} and ${nice(o.b)} cover ${Math.round(o.ratio * 100)}% of the smaller one on a ${o.viewport}`);
  score -= 20 * Math.min(2, i.overlaps.length);
  const rival = competingMenus(i.menus);
  for (const [a, b] of cap(rival, 2)) evidence.push(`Two sets of ${a.side}-edge menu buttons: ${a.screen}${from(a.screen)} [${a.buttons.slice(0, 4).join(', ')}] and ${b.screen}${from(b.screen)} [${b.buttons.slice(0, 4).join(', ')}]`);
  if (rival.length) score -= 15;
  for (const c of cap(i.clashes, 2)) evidence.push(`Looks like two different games: ${c.base.screen} is ${describeStyle(c.base)}; ${c.other.screen}${from(c.other.screen)} is ${describeStyle(c.other)} (differs in ${c.differs.join(', ')})`);
  score -= 15 * Math.min(2, i.clashes.length);
  // Measured on 267 finished games from the owner library: 95% show at most 6 screens and 20 buttons outside windows; more than
  // 8 screens or 20 buttons is what a game stitched together from several looks like.
  const crowded = i.shownScreens.length > CROWDED_SCREENS || i.shownButtons > CROWDED_BUTTONS;
  if (crowded) { evidence.push(`Crowded start: ${i.shownScreens.length} screens and ${i.shownButtons} buttons outside windows are on at the start (${cap(i.shownScreens, 6).join(', ')})`); score -= 8; }
  let hard = 0;
  if (i.layout) {
    const byKind = new Map<string, LayoutIssue[]>();
    for (const l of i.layout) byKind.set(l.kind, [...(byKind.get(l.kind) ?? []), l]);
    hard = i.layout.filter((l) => HARD_LAYOUT.has(l.kind) && l.kind !== 'overlap').length;
    for (const [kind, list] of [...byKind].filter(([k]) => HARD_LAYOUT.has(k) && k !== 'overlap').slice(0, 3)) {
      evidence.push(`Layout ${kind.replace(/_/g, ' ')} (${list.length}): ${cap(list, 2).map((l) => `${nice(l.path)} ${l.detail}`).join('; ')}`);
    }
    score -= Math.min(20, 4 * hard);
  } else evidence.push('Layout at phone and desktop size was not measured.');
  if (i.cutScreens) evidence.push(`${i.cutScreens} screen(s) were too big to read completely, so what lies past the limit was not checked.`);
  const inStarterGui = i.shownScreens.filter((s) => !i.scriptDrawn.includes(s));
  if (i.scriptDrawn.length) evidence.push(`Not checked: ${cap(i.scriptDrawn, 4).join(', ')} ${i.scriptDrawn.length === 1 ? 'is' : 'are'} built by a script while the game runs, so where ${i.scriptDrawn.length === 1 ? 'it sits' : 'they sit'} and how ${i.scriptDrawn.length === 1 ? 'it looks' : 'they look'} could not be measured.`);
  // Nothing in StarterGui to lay out but the player's screen does show something: this question was not answered, it was not asked of anything.
  if (!inStarterGui.length && i.scriptDrawn.length) return unmeasured('ui_coherence', `the player's screen shows ${cap(i.scriptDrawn, 4).join(', ')}, but every one is built by a script, so there is no position or look to measure.`, 'Put the game\'s screens in StarterGui (from the UI library) so their positions and looks can be checked, then run judge_game again.');
  // A game the player meets with a bare screen (no counter, no menu, no button) is a 3D room, not a game a client would accept.
  if (i.empty) { evidence.unshift(`The player sees no screen at all at the start: no HUD, no counter, no menu, nothing that says what to do${i.played ? '' : ' (no play session ran, so a screen a script draws while the game runs was not seen)'}.`); score -= 30; }
  const ok = i.overlaps.length === 0 && rival.length === 0 && i.clashes.length === 0 && !crowded && hard === 0 && !i.empty;
  if (ok) evidence.unshift(`No overlaps, one menu set and one look across ${inStarterGui.length} screen${inStarterGui.length === 1 ? '' : 's'} on at the start (geometry from authored positions; layout-driven pieces were not placed).`);
  return {
    id: 'ui_coherence', ok, measured: true, score: ok ? 100 : pct(score), evidence: cap(evidence),
    fix: 'UI is never restyled by hand (D-UIONLY-1); make the screens agree by CHOOSING them. Keep the screens from the game whose look the HUD has and delete the rest (delete_instances); ' +
      'where a window is still needed, take it from that same game or kit (browse_owner_library kind ui, game = the HUD\'s game, then import_owner_library). Keep ONE menu set per edge and move the other with set_properties Position/Size. ' +
      'Shorten labels that overflow and move buttons out from under the top bar with Position/Size. A bare screen needs the HUD of the game\'s kit: the currency counter, the menu buttons and the windows they open.',
    plain: ok ? 'The screens look like they belong together.' : i.empty ? 'The player sees a bare screen: no counter, no menu, nothing that says what to do.' : 'The screens do not look like one game: some pieces sit on top of each other, or two menus and two different looks are mixed.',
  };
}

/* -------------------------------------------------------------------------------------------- play sessions --- */

export interface Stat { name: string; value: number | string }
export interface LogItem { message: string; source?: string }
/** A money counter on the player's screen (its path under PlayerGui and the words it shows): the plugin reads them just after the character spawned, after the wait and touches, and after the presses. */
export interface Counter { name: string; text: string }
/** A top-level piece of a screen and whether it showed on the player's screen once the game had settled (before any press). */
export interface Widget { gui: string; name: string; visible: boolean }
export interface Counters { first: Counter[] | null; afterWait: Counter[] | null; afterPresses: Counter[] | null; widgets: Widget[] | null }
export interface PressResult { path: string; found: boolean; visible?: boolean; pressed: boolean; activated: boolean; error?: string; changes?: string[]; buttonsOnScreen: string[] }
export interface TouchResult { path: string; found: boolean; moved?: boolean; stillInPlace?: boolean; after?: Stat[] | null }
export interface PlayLabel { name: string; cls: string; text: string; visible: boolean }
export interface PlayScreen { name: string; enabled: boolean; labels: PlayLabel[]; truncated: boolean }
export interface Play {
  index: number;
  seconds: number;
  joined: boolean;
  spawned: boolean;
  clientReported: boolean;
  stage: string;
  screens: PlayScreen[];
  clientErrors: LogItem[];
  serverErrors: LogItem[];
  clientWarnings: LogItem[];
  serverWarnings: LogItem[];
  before: Stat[] | null;
  after: Stat[] | null;
  afterPresses: Stat[] | null;
  touches: TouchResult[];
  presses: PressResult[];
  hud: Counters | null;
  /** Where the character stood (x, y, z): at the spawn, after the wait, after the touches. */
  character: { start: number[] | null; afterWait: number[] | null; finish: number[] | null } | null;
}
const widgetsOf = (v: unknown): Widget[] | null => (Array.isArray(v) ? v.map(rec).filter((w) => typeof w.name === 'string').map((w) => ({ gui: str(w.gui, 60), name: str(w.name, 60), visible: w.visible === true })) : null);
const point = (v: unknown): number[] | null => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as number[]) : null);
const counters = (v: unknown): Counter[] | null => (Array.isArray(v) ? v.map(rec).filter((c) => typeof c.name === 'string').map((c) => ({ name: str(c.name, 120), text: str(c.text, 40) })) : null);
const stats = (v: unknown): Stat[] | null => (v == null ? null : arr(v).map(rec).filter((s) => typeof s.name === 'string').map((s) => ({ name: str(s.name, 60), value: typeof s.value === 'number' ? s.value : str(s.value, 60) })));
const logs = (v: unknown): LogItem[] => arr(v).map(rec).filter((l) => typeof l.message === 'string').map((l) => ({ message: str(l.message, 300), ...(typeof l.source === 'string' ? { source: str(l.source, 160) } : {}) }));

/** A plugin play_check / play_check_ui report, read defensively; anything absent stays absent. */
export function readPlay(raw: unknown, index: number, seconds: number): Play {
  const d = rec(raw);
  return {
    index, seconds,
    joined: d.playerJoined === true,
    spawned: d.characterSpawned === true,
    clientReported: d.clientReported === true,
    stage: str(d.stage, 24) || 'unknown',
    screens: arr(d.screenGuis).map(rec).map((g) => ({
      name: str(g.name, 60), enabled: g.enabled !== false, truncated: g.truncated === true,
      labels: arr(g.labels).map(rec).map((l) => ({ name: str(l.name, 60), cls: str(l.class, 40), text: str(l.text, 120), visible: l.visible === true })),
    })),
    clientErrors: logs(d.clientErrors), serverErrors: logs(d.serverErrors), clientWarnings: logs(d.clientWarnings), serverWarnings: logs(d.serverWarnings),
    before: stats(d.leaderstatsBefore), after: stats(d.leaderstatsAfter), afterPresses: stats(d.leaderstatsAfterPresses),
    touches: arr(d.touches).map(rec).map((t) => ({ path: str(t.path, 320), found: t.found === true, moved: typeof t.moved === 'boolean' ? t.moved : undefined, stillInPlace: typeof t.stillInPlace === 'boolean' ? t.stillInPlace : undefined, after: stats(t.leaderstatsAfter) })),
    presses: arr(d.presses).map(rec).map((p) => ({
      path: str(p.path, 320), found: p.found === true, visible: typeof p.visible === 'boolean' ? p.visible : undefined, pressed: p.pressed === true, activated: p.activated === true,
      ...(typeof p.error === 'string' ? { error: str(p.error, 200) } : {}),
      ...(Array.isArray(p.changes) ? { changes: arr(p.changes).filter((c): c is string => typeof c === 'string').map((c) => clip(c, 200)) } : {}),
      buttonsOnScreen: arr(p.buttonsOnScreen).filter((c): c is string => typeof c === 'string'),
    })),
    character: d.characterAt && typeof d.characterAt === 'object' ? { start: point(rec(d.characterAt).start), afterWait: point(rec(d.characterAt).afterWait), finish: point(rec(d.characterAt).finish) } : null,
    hud: d.hud && typeof d.hud === 'object' ? { first: counters(rec(d.hud).first), afterWait: counters(rec(d.hud).afterWait), afterPresses: counters(rec(d.hud).afterPresses), widgets: widgetsOf(rec(d.hud).widgets) } : null,
  };
}
/** The player's screen was seen (the harness ran and the client answered). */
export const observed = (p: Play): boolean => p.joined && p.spawned && p.clientReported;

/* ---------------------------------------------------------------------------------------------- the buttons --- */

export type PressState = 'works' | 'silent' | 'dead' | 'blocked' | 'missing' | 'hidden' | 'unpressable';
export interface PressOutcome { path: string; state: PressState; changes: string[]; session: number }

/** What each press did. A press that failed after an earlier press opened a window may only have hit that window: `blocked`, retried. */
export function classifyPresses(play: Play): PressOutcome[] {
  let opened = false;
  return play.presses.map((p): PressOutcome => {
    const changes = p.changes ?? [];
    let state: PressState;
    if (!p.found) state = 'missing';
    else if (p.visible === false) state = 'hidden';
    else if (!p.pressed) state = 'unpressable';
    // A game may listen for the click another way (MouseButton1Click, InputBegan): a window that appeared is the press working, whatever fired.
    else if (!p.activated && !changes.some((c) => /became visible|appeared/.test(c))) state = opened ? 'blocked' : 'dead';
    else state = changes.length ? 'works' : 'silent';
    if (changes.some((c) => /became visible|appeared/.test(c))) opened = true;
    return { path: p.path, state, changes, session: play.index };
  });
}
const OUTCOME_RANK: Record<PressState, number> = { works: 0, silent: 1, dead: 2, blocked: 3, hidden: 4, missing: 4, unpressable: 4 };
/** The best outcome per button over all sessions: a button that worked once works; a retry replaces a `blocked`. */
export function latestOutcomes(list: readonly PressOutcome[]): Map<string, PressOutcome> {
  const out = new Map<string, PressOutcome>();
  for (const o of list) {
    const before = out.get(o.path);
    if (!before || OUTCOME_RANK[o.state] < OUTCOME_RANK[before.state]) out.set(o.path, o);
  }
  return out;
}
export interface ButtonsInput {
  outcomes: PressOutcome[]; labels: ReadonlyMap<string, string>; total: number; skipped: { label: string; why: string }[]; virtualInputMissing: boolean;
  /** Pieces that were on the player's screen and take the clicks meant for what is under them (a tutorial, a loading cover). */
  covers?: string[];
}
export function judgeButtons(i: ButtonsInput): Criterion {
  if (i.virtualInputMissing) return unmeasured('buttons_work', 'this Studio does not provide VirtualInput, so no button could be pressed.', 'Press the buttons by hand, or update Studio, then run judge_game again.');
  const final = [...latestOutcomes(i.outcomes).values()];
  const label = (p: string): string => i.labels.get(p) ?? lastName(p);
  const count = (s: PressState): PressOutcome[] => final.filter((o) => o.state === s);
  const works = count('works'), silent = count('silent'), dead = count('dead'), blocked = count('blocked');
  const judged = works.length + silent.length + dead.length;
  const evidence: string[] = [];
  if (i.total === 0) {
    return { id: 'buttons_work', ok: true, measured: true, score: 100, evidence: ['The screen the player sees at the start has no buttons to press.'], fix: '', plain: 'There are no buttons on the first screen.' };
  }
  if (!final.length) return unmeasured('buttons_work', `${i.total} buttons are on the first screen but none was pressed (no play session ran).`, 'Run judge_game with Studio ready for a play session.');
  // Every button dead at once is one thing on top of them, not a row of broken scripts.
  if (dead.length >= 3 && !works.length && !silent.length) evidence.push(`All ${dead.length} buttons that were pressed are dead together, which points to one thing covering them or taking the clicks${i.covers?.length ? ` (on the player's screen: ${cap(i.covers, 3).join(', ')})` : ''}, not to ${dead.length} broken scripts`);
  else if (dead.length && i.covers?.length) evidence.push(`Something on the player's screen can take clicks meant for a button under it: ${cap(i.covers, 3).join(', ')}`);
  for (const d of cap(dead, 4)) evidence.push(`Does nothing: "${label(d.path)}" (${readable(d.path, 'StarterGui')}) was pressed with a real click and the button never fired`);
  for (const s of cap(silent, 3)) evidence.push(`Fires but nothing changes within a second: "${label(s.path)}"`);
  for (const b of cap(blocked, 2)) evidence.push(`Not verified: "${label(b.path)}" could not be reached after another window opened over it`);
  for (const m of cap([...count('missing'), ...count('hidden')], 2)) evidence.push(`Not on the player's screen at play time: "${label(m.path)}"`);
  if (works.length) evidence.push(`Work: ${cap(works, 6).map((w) => `"${label(w.path)}" -> ${clip(w.changes[0] ?? '', 60)}`).join('; ')}`);
  if (i.skipped.length) evidence.push(`Not pressed (a Studio test cannot try them): ${cap(i.skipped, 4).map((s) => `"${s.label}"`).join(', ')}`);
  evidence.push(`${i.total} buttons on the first screen; ${final.length} pressed, ${judged} judged (${works.length} work, ${silent.length} silent, ${dead.length} dead).`);
  const score = judged ? pct(100 * (works.length + 0.5 * silent.length) / judged) : 0;
  const ok = judged > 0 && dead.length === 0 && silent.length * 3 <= judged && works.length > 0;
  return {
    id: 'buttons_work', ok, measured: judged > 0, score: ok ? Math.max(score, 90) : score, evidence: cap(evidence),
    fix: 'If every button is dead, look first for what covers them: a full-screen frame, tutorial or loading cover that is still on (set_properties Visible false on it, or delete it if this game has no such thing). For each dead button: find the LocalScript that should handle it (search_scripts for its name or its screen) and connect Activated / MouseButton1Click to real work, or delete the button (and its window) if this game has no such feature. ' +
      'For a silent one: make the press visibly do something (open its window, change a number or a label) or remove it. Then press it again with play_check_ui.',
    plain: ok ? 'Every button on the first screen responds.' : `Some buttons do nothing when pressed${dead.length ? `, such as "${label(dead[0]!.path)}"` : ''}.`,
  };
}

/* ------------------------------------------------------------------------------------------- progression --- */

export interface Move { session: number; step: string; name: string; from: number | null; to: number | null; kind: 'currency' | 'ui' | 'body' }
const BODY = new Set(['WalkSpeed', 'JumpPower', 'JumpHeight', 'MaxHealth']);
/** Numbers a game keeps that are not something the player earns: how long they have played, their ping. */
const NOT_EARNED = /\b(?:time|playtime|seconds?|minutes?|age|ping|fps|restock|cooldown|timer|countdown|next)\b/i;
/** "NextSeedRestock" is read word by word. */
const notEarned = (name: string): boolean => NOT_EARNED.test(name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' '));
function toNumber(s: string): number | null {
  const t = s.trim().replace(/^R?\$/, '').replace(/,/g, '');
  const m = /^(-?\d+(?:\.\d+)?)\s*([kmbt])?$/i.exec(t);
  if (!m) return null;
  return Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1);
}
/** The first number a counter shows: "$1,250", "Cash: 5", "1.2K coins". */
function counterNumber(text: string): number | null {
  const m = /(-?\d[\d,]*(?:\.\d+)?)\s*([kmbt])?(?![a-z])/i.exec(text.replace(/<[^>]*>/g, ''));
  return m ? Number(m[1]!.replace(/,/g, '')) * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1) : null;
}
const diffCounters = (a: Counter[] | null, b: Counter[] | null, session: number, step: string): Move[] => {
  if (!a || !b) return [];
  const out: Move[] = [];
  for (const now of b) {
    const was = a.find((x) => x.name === now.name);
    const from = was ? counterNumber(was.text) : null, to = counterNumber(now.text);
    if (was && from !== null && to !== null && from !== to) out.push({ session, step, name: now.name, from, to, kind: 'currency' });
  }
  return out;
};
const diffStats = (a: Stat[] | null, b: Stat[] | null, session: number, step: string): Move[] => {
  if (!a || !b) return [];
  const out: Move[] = [];
  for (const s of b) {
    const was = a.find((x) => x.name === s.name);
    if (typeof s.value === 'number' && (was === undefined || typeof was.value === 'number') && (was ? was.value : 0) !== s.value) out.push({ session, step, name: s.name, from: was ? (was.value as number) : null, to: s.value, kind: 'currency' });
  }
  return out;
};
/** Everything that moved in one play session, with what caused it: waiting, walking onto a part, or pressing a button. */
export function movesOf(play: Play, labels: ReadonlyMap<string, string>): Move[] {
  const moves: Move[] = [];
  if (play.touches.length) {
    // The touches come after the wait; the report holds the stats after each one.
    let prev = play.before;
    for (const t of play.touches) {
      if (!t.found || !t.after) continue;
      moves.push(...diffStats(prev, t.after, play.index, `walking onto ${readable(t.path, 'Workspace')}`));
      prev = t.after;
    }
  } else moves.push(...diffStats(play.before, play.after, play.index, `standing in the game for ${play.seconds} s`));
  // A game that keeps its money outside leaderstats shows it on a counter: the plugin read the counters before and after.
  if (play.hud) {
    const touched = play.touches.filter((t) => t.found);
    const first = touched[0] ? readable(touched[0].path, 'Workspace') : undefined;
    moves.push(...diffCounters(play.hud.first, play.hud.afterWait, play.index, touched.length ? `walking onto ${first}${touched.length > 1 ? ` and ${touched.length - 1} more` : ''}` : `standing in the game for ${play.seconds} s`));
    const pressed = play.presses.filter((p) => p.pressed);
    const which = pressed.length === 1 ? `"${labels.get(pressed[0]!.path) ?? lastName(pressed[0]!.path)}"` : `${pressed.length} buttons`;
    moves.push(...diffCounters(play.hud.afterWait, play.hud.afterPresses, play.index, `pressing ${which}`));
  }
  for (const p of play.presses) {
    for (const c of p.changes ?? []) {
      const step = `pressing "${labels.get(p.path) ?? lastName(p.path)}"`;
      let m = /^(?:leaderstats|attribute) (.+?) (\S+) → (\S+)$/.exec(c);
      if (m) { moves.push({ session: play.index, step, name: m[1]!, from: m[2] === 'none' ? null : toNumber(m[2]!), to: m[3] === 'none' ? null : toNumber(m[3]!), kind: 'currency' }); continue; }
      m = /^(WalkSpeed|JumpPower|JumpHeight|MaxHealth) (\S+) → (\S+)$/.exec(c);
      if (m && BODY.has(m[1]!)) { moves.push({ session: play.index, step, name: m[1]!, from: toNumber(m[2]!), to: toNumber(m[3]!), kind: 'body' }); continue; }
      m = /^(.+?) text "(.*)" → "(.*)"$/.exec(c);
      if (m && toNumber(m[2]!) !== null && toNumber(m[3]!) !== null) moves.push({ session: play.index, step, name: m[1]!, from: toNumber(m[2]!), to: toNumber(m[3]!), kind: 'ui' });
    }
  }
  return moves.filter((m) => m.from !== m.to && m.to !== null && !notEarned(m.name));
}
const up = (m: Move): boolean => (m.to ?? 0) > (m.from ?? 0);
const down = (m: Move): boolean => (m.to ?? 0) < (m.from ?? 0);

export interface ProgressionInput {
  plays: Play[]; moves: Move[]; goals: string[]; currencies: string[]; noStats: boolean;
  /** Money counters the player's screen showed (paths under PlayerGui). */
  counters?: string[];
  /** What a Studio test cannot press but a player can: the action words of the world's proximity prompts ("Sell", "Harvest"). */
  prompts?: string[];
  /** How many buy/upgrade buttons were pressed and answered. */
  spendTried?: number;
  /** The game was built from a library game whose loop runs as saved: the first steps a player takes to earn (the quick test cannot take them). */
  knownLoop?: string[];
  /** No error was seen while playing: a known loop only counts in a game that runs clean. */
  cleanRun?: boolean;
}
export function judgeProgression(i: ProgressionInput): Criterion {
  if (!i.plays.some(observed)) return unmeasured('progression', 'no play session reached the player\'s screen, so nothing could be earned or spent.', 'Make sure Studio can start a Test session (edit mode, edit consent), then run judge_game again.');
  const earned = i.moves.filter((m) => up(m) && m.kind !== 'body');
  const spentMoves = i.moves.filter((m) => down(m) && m.kind !== 'body' && /pressing/.test(m.step));
  const upgrades = i.moves.filter((m) => m.kind === 'body' && up(m));
  const spent = spentMoves.length > 0 || upgrades.length > 0;
  const evidence: string[] = [];
  const byStep = new Map<string, Move[]>();
  for (const m of [...earned, ...spentMoves, ...upgrades]) byStep.set(m.step, [...(byStep.get(m.step) ?? []), m]);
  for (const [step, list] of cap([...byStep], 5)) evidence.push(`Moved by ${step}: ${cap([...new Map(list.map((m) => [m.name, m])).values()], 3).map((m) => `${m.name} ${m.from ?? 'none'} -> ${m.to}`).join(', ')}`);
  const counted = i.counters ?? [];
  if (!earned.length && i.knownLoop?.length && i.cleanRun && counted.length && i.goals.length) {
    // Earning here takes steps the quick test does not take (plant, aim, wait for a wave). The loop is the working game's own, kept whole: rewriting it would break it.
    return {
      id: 'progression', ok: true, measured: true, score: 70,
      evidence: cap([`Earning was not seen in the quick test: in this game it takes steps the test does not take (${cap(i.knownLoop, 3).map((s) => s.replace(/\.$/, '')).join('; ')}).`,
        `The loop is the working game's own and was kept whole: the money counter is on screen (${cap(counted, 2).join(', ')}) and the game ran without errors.`,
        `Long-term goals on screen: ${cap(i.goals, 5).join(', ')}.`]),
      fix: 'Do not rewrite the money loop: it is the working game\'s own. Play it through once (the steps above) to see money come in and a purchase go through.',
      plain: 'Its money loop is the one from a working game; my quick test could not play it all the way through.',
    };
  }
  if (!earned.length) {
    evidence.push(i.noStats && !counted.length ? 'The player has no leaderstats folder and no money counter the judge could recognise on screen (a label or window named cash, money, coins, gold, gems...): there is no currency at all, or it is shown some other way.'
      : i.noStats ? `The game keeps its money outside leaderstats (counters: ${cap(counted, 3).join(', ')}); none of them moved in ~25 s of play, by standing, by walking onto parts or by pressing buttons.`
        : `Nothing the player earned moved in ~25 s of play (stats: ${i.currencies.join(', ') || 'none'}${counted.length ? `; counters: ${cap(counted, 2).join(', ')}` : ''}), by standing, by walking onto parts or by pressing buttons.`);
    // A Studio test cannot press E. What it did not see is not what is not there.
    if (i.prompts?.length) evidence.push(`Not exercised: the world has ${i.prompts.length} proximity prompt(s) (${cap(i.prompts, 4).join(', ')}) that a player triggers by walking up and pressing a key, which a Studio test cannot do; earning through them was not tried.`);
  }
  else if (!spent) evidence.push(i.spendTried
    ? `Earning works, but pressing ${i.spendTried} buy/upgrade button${i.spendTried === 1 ? '' : 's'} after earning took no money and gave nothing: no purchase was seen within the first minute.`
    : 'Earning works, but no buy or upgrade button was pressed (none was found on the first screen or in the shop window), so spending was not tried.');
  evidence.push(i.goals.length ? `Long-term goals on screen: ${cap(i.goals, 5).join(', ')}.` : 'No long-term goal (upgrade, rebirth, unlock, level, quest) is visible anywhere.');
  const score = (earned.length ? 40 : 0) + (spent ? 35 : 0) + (i.goals.length ? 25 : 0);
  const ok = earned.length > 0 && spent;
  return {
    id: 'progression', ok, measured: true, score: pct(score), evidence: cap(evidence),
    fix: !earned.length
      ? 'Give the game a loop: a currency the player earns (a leaderstats value the server raises when they collect, sell or harvest, or income over time), shown on screen. Add it with a script under ServerScriptService and check it with play_check.'
      : 'Give the earned currency something to buy in the first minute: a shop or upgrade button that takes the currency (server-checked) and gives something back (an item, speed, a plot, an unlock), and one longer goal (rebirth, next area, collection). Check it with play_check_ui: touch the earner, then press the buy button.',
    plain: ok ? 'Players can earn and spend, so there is something to work toward.'
      : !earned.length ? (i.prompts?.length ? 'I could not confirm that players can earn: the game earns through prompts a test cannot press, and nothing else moved.' : 'In the test nothing could be earned, so the game looks like a place to walk around.')
        : 'Players can earn, but I could not see anything they can spend it on yet.',
  };
}

/* ---------------------------------------------------------------------------------------------- errors --- */

const PRIVATE_ASSET = /failed to load (?:sound|animation|image|mesh|texture|content|asset)|not authorized|unauthorized|HTTP 40[13]|is not trusted|403 \(forbidden\)|failed to download|animation .*could not be loaded|can'?t load animation|error loading (?:sound|animation)|asset .* (?:is not|isn'?t) (?:approved|available)/i;
const STUDIO_NOISE = /ApplePlayCheck|StudioTestService|Freecam|^\s*$/;
const YIELD = /infinite yield possible on\s+(.{1,160})/i;
export interface ErrorSummary { errors: { message: string; source?: string; side: 'client' | 'server' }[]; yields: string[]; privateAssets: number; warnings: number }
export function summariseErrors(plays: readonly Play[]): ErrorSummary {
  const errors: ErrorSummary['errors'] = [];
  const seen = new Set<string>();
  const yields = new Set<string>();
  let privateAssets = 0;
  const priv = new Set<string>();
  let warnings = 0;
  const take = (list: LogItem[], side: 'client' | 'server'): void => {
    for (const e of list) {
      if (STUDIO_NOISE.test(e.message) || (e.source !== undefined && STUDIO_NOISE.test(e.source))) continue;
      if (PRIVATE_ASSET.test(e.message)) { priv.add(e.message.replace(/\d+/g, '#')); continue; }
      const key = `${side}|${e.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push({ ...e, side });
    }
  };
  for (const p of plays) {
    take(p.clientErrors, 'client');
    take(p.serverErrors, 'server');
    for (const w of [...p.clientWarnings, ...p.serverWarnings]) {
      warnings += 1;
      const y = YIELD.exec(w.message);
      if (y) yields.add(clip(y[1]!.trim().replace(/^['"]|['"]$/g, ''), 120));
      else if (PRIVATE_ASSET.test(w.message)) priv.add(w.message.replace(/\d+/g, '#'));
    }
  }
  privateAssets = priv.size;
  return { errors, yields: [...yields], privateAssets, warnings };
}
/** Code a script loads from a Roblox asset id, `require(123456789)`: it may be private or gone, and it runs code nobody in this project wrote. */
export interface RemoteRequire { path: string; line: number; id: number }
const REMOTE_REQUIRE = /\brequire\s*\(\s*(?:game\.)?(\d{6,})\s*\)/g;
export function remoteRequires(scripts: readonly { path: string; source: string }[]): RemoteRequire[] {
  const out: RemoteRequire[] = [];
  for (const sc of scripts) {
    const src = stripLuauComments(sc.source);
    for (const m of src.matchAll(REMOTE_REQUIRE)) out.push({ path: sc.path, line: lineAt(src, m.index ?? 0), id: Number(m[1]) });
  }
  return out;
}
export function judgeErrors(plays: readonly Play[], remote: readonly RemoteRequire[] = []): Criterion {
  const seen = plays.filter((p) => p.joined && p.spawned);
  if (!seen.length) return unmeasured('errors', 'no play session got a player into the game, so no script ran.', 'Make sure Studio can start a Test session, then run judge_game again.');
  const s = summariseErrors(seen);
  const evidence: string[] = [];
  for (const e of cap(s.errors, 4)) evidence.push(`${e.side} error: ${clip(e.message, 160)}${e.source ? ` (${e.source})` : ''}`);
  if (s.errors.length > 4) evidence.push(`${s.errors.length - 4} more errors`);
  for (const y of cap(s.yields, 3)) evidence.push(`A script waits forever for something that is not there: ${y}`);
  if (s.privateAssets) evidence.push(`Note: ${s.privateAssets} sound/animation/image assets failed to load because they are private (not authorized for this place); they are counted, not treated as script errors.`);
  const clientMissing = seen.some((p) => !p.clientReported);
  if (clientMissing) evidence.push('The player\'s client did not answer in at least one session, so its errors were not observed there.');
  if (remote.length) evidence.push(`${remote.length} place${remote.length === 1 ? '' : 's'} in the code load${remote.length === 1 ? 's' : ''} a module from a Roblox asset id, which may be private or gone and runs code nobody here wrote: ${cap(remote, 2).map((r) => `require(${r.id}) in ${readable(r.path)}:${r.line}`).join('; ')}`);
  if (!evidence.length) evidence.push(`No script errors in ${seen.length} play session(s).`);
  const ok = s.errors.length === 0 && s.yields.length === 0 && remote.length === 0;
  return {
    id: 'errors', ok, measured: true, score: pct(100 - 20 * Math.min(5, s.errors.length) - 10 * Math.min(3, s.yields.length) - 15 * Math.min(3, remote.length)), evidence,
    fix: 'Open each script named in the errors (read_script) and fix the line that fails: usually it looks for a folder, remote or module of the source game that this place does not have. Create what it needs, change the script to use what exists, or delete the whole imported system if the game does not use it. ' +
      'A script that waits forever (WaitForChild on a missing name) never starts its feature: same fix. A require(number) loads code from outside the project: replace it with a ModuleScript in the project or delete the feature. Run play_check again until the errors are gone.',
    plain: ok ? 'No errors appeared while playing.' : s.errors.length || s.yields.length ? 'Errors appear while the game runs, which means some parts of it do not work.' : 'Part of the game loads code from outside the project, which may not work for you.',
  };
}

/* ------------------------------------------------------------------------------------------- construction --- */

export interface PlacementFact {
  path: string; name: string; tagged: boolean;
  center?: number[]; size?: number[]; bottomY?: number; topY?: number;
  overlapCount?: number; overlapping?: string[]; floating?: boolean; gapBelow?: number | null; groundHit?: boolean;
}
export interface SpawnFact { path: string; center?: number[]; canCollide?: boolean; overlapCount?: number; groundHit?: boolean | null }
export interface Stood { when: string; pos: number[] }
export interface WorldFacts {
  items: PlacementFact[]; spawns: SpawnFact[]; originGround: boolean | null; groundY: number; notChecked: number; itemsSeen: number; asked: boolean;
  /** Where the test player stood during play, when the plugin said. */
  stood?: Stood[];
}
/** A drop this far below where a player started, or below the ground they were put on, is a fall out of the world (Roblox removes them at -500). */
export const FALL_STUDS = 80;
const ELEVATED_OK = /platform|bridge|island|cloud|sky|float|hover|roof|ceiling|light|lamp|sign|banner|balloon|bird|fly|air|stair|ramp|tower|floor|deck|walkway|ledge|shelf|beam|arch|window|chandelier|hang|door|gate|frame|board|billboard|bed|table|desk|chair|counter/i;
const DEFAULT_NAME = /^(?:part|model|meshpart|union|unionoperation|wedgepart|cornerwedgepart|trusspart|folder)$/i;
export function constructionFindings(f: WorldFacts): string[] {
  const out: string[] = [];
  const spawn = f.spawns[0];
  if (!f.spawns.length) {
    if (f.originGround === false) out.push('No spawn point, and nothing under the world origin where players start: they fall out of the world.');
    else out.push('There is no spawn point, so players start at the world origin instead of a place you chose.');
  }
  for (const s of f.spawns.slice(0, 3)) {
    // A spawn that nothing collides with (a script's invisible marker) is not "inside" anything: the player is put on top of what is there.
    if ((s.overlapCount ?? 0) > 0 && s.canCollide !== false) out.push(`Spawn ${readable(s.path, 'Workspace')} is inside something (${s.overlapCount} parts overlap it).`);
    if (s.canCollide === false && s.groundHit === false) out.push(`Spawn ${readable(s.path, 'Workspace')} cannot be stood on and nothing is under it: the player falls out of the world.`);
  }
  const start = Math.min(f.groundY, f.stood?.[0]?.pos[1] ?? f.groundY);
  const low = (f.stood ?? []).filter((x) => (x.pos[1] ?? 0) < start - FALL_STUDS).sort((a, b) => (a.pos[1] ?? 0) - (b.pos[1] ?? 0))[0];
  if (low) out.push(`The test player fell out of the world: ${low.when} it stood ${Math.round(start - (low.pos[1] ?? 0))} studs below the ground it started on (height ${Math.round(low.pos[1] ?? 0)}).`);
  const at = spawn?.center ?? [0, f.groundY, 0];
  for (const it of f.items) {
    const short = readable(it.path, 'Workspace');
    if (it.center && it.size && it.bottomY !== undefined && it.topY !== undefined) {
      const far = Math.hypot((it.center[0] ?? 0) - (at[0] ?? 0), (it.center[2] ?? 0) - (at[2] ?? 0));
      if (far > 500) out.push(`${short} stands ${Math.round(far)} studs from the spawn: players never find it.`);
      else if (it.topY < f.groundY - 8 && (far < 300 || it.topY < f.groundY - 40)) out.push(`${short} is buried under the map (its top is ${Math.round(f.groundY - it.topY)} studs below the ground players start on).`);
      else if (it.bottomY > f.groundY + 400) out.push(`${short} is ${Math.round(it.bottomY - f.groundY)} studs up in the sky.`);
    }
    if (it.tagged) continue;
    if (DEFAULT_NAME.test(it.name)) out.push(`${short} still has a default name ("${it.name}"): it is an unnamed leftover.`);
    if ((it.overlapCount ?? 0) > 0) out.push(`${short} overlaps ${it.overlapCount} other part(s)${it.overlapping?.length ? ` (${cap(it.overlapping, 2).map((p) => readable(p, 'Workspace')).join(', ')})` : ''}.`);
    if (it.groundHit === false && !ELEVATED_OK.test(it.name)) out.push(`${short} hangs over empty space with nothing under it.`);
    else if (it.floating === true && it.groundHit !== false && !ELEVATED_OK.test(it.name)) out.push(`${short} floats ${it.gapBelow !== null && it.gapBelow !== undefined ? Math.round(it.gapBelow * 10) / 10 : 'some'} studs above the ground.`);
  }
  return out;
}
export function judgeConstruction(f: WorldFacts): Criterion {
  if (!f.asked) return unmeasured('construction', 'Studio did not answer the placement questions.', 'Run judge_game again once Studio responds.');
  const findings = constructionFindings(f);
  const evidence = cap(findings);
  if (findings.length > MAX_EVIDENCE) evidence[MAX_EVIDENCE - 1] = `${findings.length - MAX_EVIDENCE + 1} more construction problems`;
  const untagged = f.items.filter((x) => !x.tagged).length;
  evidence.push(`Checked ${f.items.length} objects (${untagged} added by StudPilot, ${f.items.length - untagged} imported) of ${f.itemsSeen} in the world, and ${f.spawns.length} spawn point(s)${f.notChecked ? `; ${f.notChecked} more were not checked` : ''}. ${f.stood?.length ? `The test player's height was read ${f.stood.length} time${f.stood.length === 1 ? '' : 's'} during play (at the spawn, after the wait, after the touches).` : 'Whether the player stays above the map during play is inferred from the ground under the spawn, not observed.'}`);
  const spawnBad = findings.filter((x) => /spawn|world origin/i.test(x)).length;
  const ok = findings.length === 0;
  return {
    id: 'construction', ok, measured: true, score: ok ? 100 : pct(100 - 15 * Math.min(3, spawnBad) - 8 * Math.min(5, findings.length - spawnBad)), evidence,
    fix: 'Spawn: put a SpawnLocation on solid ground, clear of walls. Floating or overlapping parts: spatial_query find_ground for the spot, then transform_instances to rest it on the ground (or delete it). ' +
      'Far, buried or sky-high imports: move them next to the play area with transform_instances or delete them. Rename leftover default-named parts. Check again with spatial_query check_placement.',
    plain: ok ? 'Everything is standing where it should, and players start on solid ground.' : 'Some things are floating, buried, far away or in the way, or the starting spot is not safe.',
  };
}

/* --------------------------------------------------------------------------------------- fit and uniqueness --- */

export interface NameItem {
  where: string;
  text: string;
  /** The AppleLibraryGame tag of the imported thing this name belongs to. */
  tag?: string;
  /** The name of that library game. */
  source?: string;
}
interface GenreDef { id: string; label: string; asked: RegExp; fits: readonly string[] }
interface FeatureDef { id: string; plain: string; seen: RegExp; asked: RegExp; always?: boolean }
const GENRES: readonly GenreDef[] = [
  { id: 'garden', label: 'a garden or farming game', asked: /\b(?:garden|farm(?:ing)?|plants?|crops?|harvest|seeds?)\b|grow(?:ing)? a/i, fits: ['garden'] },
  { id: 'brainrot', label: 'a brainrot game', asked: /\bbrain ?rot|skibidi|steal a\b/i, fits: ['garden', 'tycoon'] },
  { id: 'tycoon', label: 'a tycoon', asked: /\btycoon|factory|dropper|idle\b/i, fits: ['tycoon'] },
  { id: 'obby', label: 'an obstacle course', asked: /\bobby|obstacle|parkour|platformer|escape\b/i, fits: ['obby'] },
  { id: 'pet', label: 'a pet or collecting simulator', asked: /\bpets?|eggs?|hatch|simulator\b/i, fits: ['pets', 'trading'] },
  { id: 'horror', label: 'a horror game', asked: /\bhorror|scary|haunted|zombie|backrooms\b/i, fits: ['horror', 'combat', 'event'] },
  { id: 'combat', label: 'a fighting game', asked: /\bfight|battle|pvp|shooter|sword|war\b|arena|combat|duel/i, fits: ['combat'] },
  { id: 'racing', label: 'a racing game', asked: /\brac(?:e|ing)|drift|cars?\b/i, fits: ['racing'] },
  { id: 'defense', label: 'a defense game', asked: /\b(?:vs|versus|tower defen[cs]e|defend\w*|pvz|waves?)\b/i, fits: ['combat', 'garden'] },
];
const FEATURES: readonly FeatureDef[] = [
  { id: 'pets', plain: 'a pet and egg system', seen: /\b(?:pets?|eggs?|hatch(?:ing|ery)?|companions?)\b/i, asked: /\b(?:pets?|eggs?|hatch\w*|companions?|creatures?|animals?|zoo)\b/i },
  { id: 'trading', plain: 'player trading', seen: /\btrad(?:e|es|ing)\b/i, asked: /\b(?:trad(?:e|es|ing)|market|auction)\b/i },
  { id: 'admin', plain: 'an admin or commands panel', seen: /\b(?:admin|moderator|commands?|cmds?|cmdr|ban ?list|god ?mode)\b/i, asked: /\b(?:admin|moderat\w*|commands?|staff)\b/i, always: true },
  { id: 'event', plain: 'a seasonal event (Halloween, Christmas...)', seen: /\b(?:halloween|christmas|xmas|easter|valentines?|thanksgiving|new ?year|santa|snowman|spooky|black ?friday|anniversary|limited ?time)\b/i, asked: /\b(?:halloween|christmas|xmas|easter|valentines?|thanksgiving|new ?year|santa|snow|spooky|seasonal|event)\b/i, always: true },
  { id: 'duels', plain: 'a duels or battle arena', seen: /\b(?:duels?|1v1|pvp|arena)\b/i, asked: /\b(?:duel|1v1|pvp|arena|fight|battle|combat|shooter|war)\w*/i, always: true },
  { id: 'codes', plain: 'a redeem-codes box', seen: /\b(?:redeem|promo ?codes?|enter (?:a )?code|codes? here|new codes?)\b/i, asked: /\b(?:codes?|redeem|promo)\b/i, always: true },
  { id: 'robux', plain: 'a Robux or game pass store', seen: /\b(?:game ?passes?|robux|vip|premium|donat\w*)\b|R\$/i, asked: /\b(?:game ?pass\w*|robux|vip|premium|monetiz\w*|donat\w*|pay\w*)\b/i, always: true },
  { id: 'clans', plain: 'clans or guilds', seen: /\b(?:clans?|guilds?)\b/i, asked: /\b(?:clans?|guilds?)\b/i, always: true },
  { id: 'battlepass', plain: 'a battle pass', seen: /\b(?:battle ?pass|season pass|season \d+)\b/i, asked: /\b(?:battle ?pass|season)\b/i, always: true },
  { id: 'garden', plain: 'farming (seeds, harvest, watering)', seen: /\b(?:seeds?|harvest\w*|watering|sprinklers?|fertili[sz]er|crops?|planting)\b/i, asked: /\b(?:garden|farm\w*|plants?|crops?|harvest\w*|seeds?|grow\w*)\b/i },
  { id: 'tycoon', plain: 'tycoon droppers and conveyors', seen: /\b(?:droppers?|conveyor|tycoon|upgrader|collector pad)\b/i, asked: /\b(?:tycoon|factory|dropper|conveyor|idle)\b/i },
  { id: 'obby', plain: 'obstacle-course stages', seen: /\b(?:checkpoints?|stage \d+|skip stage|kill ?bricks?|obby)\b/i, asked: /\b(?:obby|obstacle|checkpoint|stage|parkour)\b/i },
  { id: 'combat', plain: 'weapons and fighting', seen: /\b(?:swords?|weapons?|ammo|damage|guns?|rifles?)\b/i, asked: /\b(?:fight\w*|battle|pvp|shoot\w*|sword|weapon|war|arena|combat|kill|gun)\b/i },
  { id: 'racing', plain: 'a race track', seen: /\b(?:laps?|race track|finish line|drift|nitro)\b/i, asked: /\b(?:rac(?:e|ing)|drift|cars?|laps?)\b/i },
  { id: 'horror', plain: 'horror scares', seen: /\b(?:jumpscare|flashlight|haunted|ghosts?)\b/i, asked: /\b(?:horror|scary|ghost|haunted|monster|zombie)\b/i },
];
/** "PetsFrame", "Egg1", "buy_seed" -> "Pets Frame", "Egg 1", "buy seed": word boundaries a name never has. */
const words = (s: string): string => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/[_\-.]+/g, ' ');

export interface FitInput {
  request: string;
  names: NameItem[];
  texts: TextItem[];
  currencies: string[];
  currencyScreens: { screen: string; text: string }[];
  shopWindows: { screen: string; name: string; path: string; source?: string }[];
  duplicateScreens: string[];
  menus: MenuCluster[];
  sourceNames: string[];
  sourceCount: number;
  /** The names of the scripts: a feature can live only in code (a PetService with no window yet), and it is still in the game. */
  scriptNames?: string[];
}
export interface FitFinding { kind: 'unrequested' | 'leftover' | 'missing' | 'duplicate' | 'branding' | 'sources'; text: string; weight: number }

/**
 * The other half of "does it have the features I asked for": the nouns a request is built on, and the words a game that has them
 * cannot help containing. Deliberately narrow (a screen, a folder, a model or a label with one of these words); a game with
 * none of them has none of the feature, whatever else it has.
 */
interface CoreDef { plain: string; asked: RegExp; has: RegExp }
const CORE: readonly CoreDef[] = [
  { plain: 'brainrot characters', asked: /\bbrain ?rots?\b/i, has: /brain ?rot|skibidi|tralal|tung ?tung|sahur|bombardiro|cappuccino|assassino|lirili|larila|bananini|chimpanzini|glorbo|noobini|lucky ?block/i },
  { plain: 'seeds, plots or crops', asked: /\b(?:garden|farm\w*|crops?|harvest\w*|seeds?|plants?)\b|grow(?:ing)? a/i, has: /\b(?:seeds?|plots?|plants?|crops?|harvest\w*|garden|farm\w*|soil|watering|sprinklers?)\b/i },
  { plain: 'pets or eggs', asked: /\b(?:pets?|eggs?|hatch\w*)\b/i, has: /\b(?:pets?|eggs?|hatch\w*)\b/i },
  { plain: 'player trading', asked: /\btrad(?:e|es|ing)\b/i, has: /\btrad(?:e|es|ing)\b/i },
  { plain: 'a codes box', asked: /\b(?:redeem|promo codes?|codes? box)\b/i, has: /\b(?:redeem|codes?)\b/i },
  { plain: 'a tycoon (droppers, a collector, buy pads)', asked: /\btycoon\b|\bdroppers?\b/i, has: /\b(?:droppers?|collector|conveyor|tycoon|upgrader|buy pads?|pads?)\b/i },
  { plain: 'an obstacle course (stages, checkpoints)', asked: /\bobby\b|\bobstacle course\b|\bparkour\b/i, has: /\b(?:checkpoints?|stages?|obby|lava|kill ?bricks?)\b/i },
  { plain: 'a race (laps, a finish line)', asked: /\brac(?:e|ing)\b/i, has: /\b(?:laps?|finish|race|racing|track|checkpoints?|cars?)\b/i },
  { plain: 'weapons or fighting', asked: /\b(?:swords?|weapons?|guns?|shooter|pvp|fighting game)\b/i, has: /\b(?:swords?|weapons?|guns?|ammo|damage|health|blasters?|pvp|tools?)\b/i },
];

const CURRENCY_NAME = /cash|money|coins?|gold|bucks|dollars|silver|credits?|tokens?|sheckles?|shekels?|dough/i;
const BRAND = /discord\.gg|youtube\.com|youtu\.be|subscribe|follow (?:us|me|the)|like (?:the )?game|made by|created by|script(?:ed)? by|free ?model|thanks for playing|roblox\.com\/groups|join (?:our|my|the) group|twitter|tiktok|https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|gg|net|org|io|tv)\b/i;
const cleanName = (n: string): string => n.replace(/[_]+/g, ' ').replace(/\s*\(\d+\)\s*$/, '').replace(/\[[^\]]*\]/g, ' ').replace(/\b(?:fully working|new code|free|copy|file|op|v\d+(?:\.\d+)*)\b/gi, ' ').replace(/\s+/g, ' ').trim();
const shopQualifier = (name: string): string => words(name).toLowerCase().replace(/\b(?:shop|store|market|gui|frame|window|menu|main|ui|panel|screen|the|new|old|copy)\b/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

export function fitFindings(i: FitInput): FitFinding[] {
  const out: FitFinding[] = [];
  const genres = GENRES.filter((g) => g.asked.test(i.request));
  const fits = (id: string): boolean => genres.some((g) => g.fits.includes(id));
  // What comes from a game the user named ("like Plants vs Brainrots") is what the user asked for, eggs and all.
  const asked = i.request.toLowerCase();
  const requestedSource = (src?: string): boolean => { const c = src ? cleanName(src).toLowerCase() : ''; return c.length >= 6 && asked.includes(c); };
  const corpus = i.names.filter((n) => !requestedSource(n.source)).map((n) => ({ where: n.where, text: words(n.text) }));
  for (const f of FEATURES) {
    if (f.asked.test(i.request) || fits(f.id)) continue;
    if (!f.always && genres.length === 0) continue;
    const hits = [...new Map(corpus.filter((c) => f.seen.test(c.text)).map((c) => [c.text.toLowerCase(), c])).values()];
    if (!hits.length) continue;
    out.push({
      kind: f.always ? 'leftover' : 'unrequested', weight: 20,
      text: `${f.plain} is in the game (${cap(hits, 3).map((h) => `${clip(h.text, 40)} in ${h.where}`).join('; ')}) but the request${genres.length ? ` for ${genres.map((g) => g.label).join(' / ')}` : ''} does not call for it`,
    });
  }
  const said = [...i.names.map((n) => words(n.text)), ...(i.scriptNames ?? []).map(words), ...i.texts.filter((t) => t.state !== 'runtime' || t.via === 'player').map((t) => words(t.text))];
  const absent = CORE.filter((c) => c.asked.test(i.request) && !said.some((t) => c.has.test(t)));
  if (absent.length) out.push({ kind: 'missing', weight: 25, text: `the request asks for ${absent.map((c) => c.plain).join(' and ')}, but no screen, folder, model or label in the game mentions ${absent.length === 1 ? 'it' : 'them'}` });
  const cash = i.currencies.filter((c) => CURRENCY_NAME.test(c));
  if (cash.length >= 2) out.push({ kind: 'duplicate', weight: 15, text: `two currencies doing the same job: ${cash.join(' and ')}` });
  const screens = [...new Set(i.currencyScreens.map((c) => c.screen))];
  if (screens.length >= 2) out.push({ kind: 'duplicate', weight: 15, text: `the player's money is shown by ${screens.length} different screens at the start: ${screens.slice(0, 3).join(', ')}` });
  const groups = new Map<string, typeof i.shopWindows>();
  for (const s of i.shopWindows) groups.set(shopQualifier(s.name), [...(groups.get(shopQualifier(s.name)) ?? []), s]);
  // Two windows named alike are two shops only when they come from different places: one imported game's seed shop and gear shop are its own design.
  for (const [q, list] of groups) if (list.length >= 2 && new Set(list.map((l) => l.source ?? `built:${l.screen}`)).size >= 2) out.push({ kind: 'duplicate', weight: 15, text: `two ${q ? q + ' ' : ''}shops: ${cap(list, 3).map((l) => l.path.replace(/^game\.StarterGui\./, '')).join(' and ')}` });
  for (const [a, b] of competingMenus(i.menus).slice(0, 1)) out.push({ kind: 'duplicate', weight: 15, text: `two sets of side menu buttons on the ${a.side}: ${a.screen} [${a.buttons.slice(0, 3).join(', ')}] and ${b.screen} [${b.buttons.slice(0, 3).join(', ')}]` });
  if (i.duplicateScreens.length) out.push({ kind: 'duplicate', weight: 10, text: `two screens with the same name: ${i.duplicateScreens.slice(0, 3).join(', ')}` });
  const brands: string[] = [];
  for (const t of i.texts) {
    if (t.via === 'script' && t.state === 'hidden') continue;
    for (const n of i.sourceNames) {
      const c = cleanName(n);
      if (c.length >= 8 && t.text.toLowerCase().includes(c.toLowerCase()) && !asked.includes(c.toLowerCase())) brands.push(`"${clip(t.text.trim(), 50)}" names the source game "${c}" (${t.where})`);
    }
    if (BRAND.test(t.text)) brands.push(`"${clip(t.text.trim(), 50)}" advertises someone else (${t.where})`);
  }
  if (brands.length) out.push({ kind: 'branding', weight: 15, text: `source-game branding is still on screen: ${cap([...new Set(brands)], 2).join('; ')}` });
  if (i.sourceCount >= 9) out.push({ kind: 'sources', weight: 10, text: `the game is stitched together from ${i.sourceCount} different source games; players feel the seams` });
  return out;
}
export function judgeFit(i: FitInput): Criterion {
  const findings = fitFindings(i);
  const evidence = cap(findings.map((f) => f.text), 10);
  if (!findings.length) evidence.push(`Nothing unrequested, duplicated or left over from a source game was found (${i.names.length} names and ${i.texts.length} texts read; the game mixes ${i.sourceCount} source game(s)).`);
  const score = pct(100 - findings.reduce((a, f) => a + f.weight, 0));
  const unrequested = findings.filter((f) => f.kind === 'unrequested' || f.kind === 'leftover');
  const lacking = findings.find((f) => f.kind === 'missing');
  return {
    id: 'fit_uniqueness', ok: findings.length === 0, measured: true, score: findings.length ? score : 100, evidence,
    fix: 'Delete what the request did not ask for, WITH its scripts (delete_instances on the screen, the folder in ServerScriptService / ReplicatedStorage and the models); a half-removed system leaves errors and dead buttons. ' +
      'Where two systems do the same job, keep the one whose look matches the HUD and delete the other. Replace source-game titles and credits with the new game\'s own name. Do this FIRST: it removes many of the other problems too. ' +
      'If the request asks for something no name or label in the game mentions, build or import that feature (browse_owner_library, then only the pieces you need); renaming something else does not count.',
    plain: findings.length === 0 ? 'The game contains what you asked for and nothing borrowed that does not belong.'
      : lacking && !unrequested.length ? `The game is missing something you asked for: ${lacking.text.replace(/^the request asks for /, '').split(', but ')[0]}.`
      : `The game carries things you did not ask for${unrequested.length ? `, like ${unrequested.slice(0, 2).map((f) => f.text.split(' is in the game')[0]).join(' and ')}` : ''}${lacking ? ' and is missing something you did ask for' : ''}, or has the same feature twice.`,
  };
}

/* ----------------------------------------------------------------------------------------------- the verdict --- */

export interface Verdict { verdict: 'ready' | 'not ready'; score: number; forUser: string; fixes: string[]; notVerified: string[] }
const FIX_ORDER: CriterionId[] = ['fit_uniqueness', 'errors', 'construction', 'progression', 'buttons_work', 'ui_coherence', 'placeholders'];
const PLAIN_ORDER: CriterionId[] = ['progression', 'fit_uniqueness', 'buttons_work', 'errors', 'ui_coherence', 'placeholders', 'construction'];

export function compose(criteria: readonly Criterion[], notVerified: string[]): Verdict {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const ready = criteria.length === 7 && criteria.every((c) => c.ok && c.measured);
  const raw = criteria.reduce((a, c) => a + (c.measured ? WEIGHTS[c.id] * c.score / 100 : 0), 0);
  const score = pct(ready ? Math.max(80, raw) : Math.min(79, raw));
  const failing = (order: CriterionId[]): Criterion[] => order.map((id) => byId.get(id)).filter((c): c is Criterion => !!c && !(c.ok && c.measured));
  const fixes = failing(FIX_ORDER).map((c) => (c.measured ? `${c.id}: ${c.fix}` : `${c.id}: ${c.evidence[0] ?? 'not measured'} ${c.fix}`));
  const problems = failing(PLAIN_ORDER);
  const heard = problems.filter((c) => c.measured);
  const unheard = problems.filter((c) => !c.measured);
  const sentences: string[] = [];
  const untried = byId.get('progression')?.score === 70 && /^Earning was not seen/.test(byId.get('progression')?.evidence[0] ?? '');
  if (ready && untried) {
    sentences.push('Your game passed every check a player would notice: working buttons, clean matching screens and no leftover text or errors.');
    sentences.push('Its money loop is the one from a working game, but my quick test could not play it all the way through, so play one round yourself.');
  } else if (ready) {
    sentences.push('Your game passed every check a player would notice: it has real progression, working buttons, clean matching screens and no leftover text or errors.');
    sentences.push('I have not checked how it looks in a screenshot, so give it one look yourself.');
  } else {
    sentences.push(heard.length ? 'This game is not ready to hand over yet.' : 'I could not finish testing this game, so I cannot say it is ready.');
    for (const c of heard.slice(0, 2)) sentences.push(c.plain);
    sentences.push(unheard.length ? `I could not test ${unheard.length === 1 ? 'one part' : 'some parts'} because the game would not start for a test player.` : 'I will fix these and check again.');
  }
  return { verdict: ready ? 'ready' : 'not ready', score, forUser: sentences.join(' '), fixes, notVerified };
}
