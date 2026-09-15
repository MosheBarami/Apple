/**
 * WHICH PLACE IS THIS PROJECT'S PLACE?
 *
 * THE DEFECT THIS EXISTS FOR. The plugin's session is a plugin-wide Studio setting
 * (`plugin:GetSetting('golem_session')`), not a per-place one. Open a different place in the same
 * Studio and the session comes with it: the plugin keeps polling, the worker keeps serving, and
 * this project's ops are applied to a place that has nothing to do with it. `placeId` and `gameId`
 * had been arriving on every state event since the plugin was written and were compared to
 * nothing.
 *
 * THE RULE THAT SHAPES THE WHOLE FILE, and the reason it is worth its own module:
 *
 *     A FAILURE TO IDENTIFY THE PLACE IS NOT AN OBSERVATION THAT IT IS THE WRONG ONE.
 *
 * `game.PlaceId` is 0 for a place that has never been saved to Roblox, and Studio can report 0
 * transiently while a place is still loading. Both read identically at this layer. So a report we
 * cannot identify produces `unverified` — the ops are served, and the fact that nothing was
 * confirmed is carried out to the caller so the UI can say so — and NEVER `mismatch`. Refusing on
 * a 0 would break a legitimate user working on an unsaved place, and would do it intermittently,
 * which is the worst way to break anything.
 *
 * What DOES produce a refusal is a report that identifies itself as a different place: two
 * non-zero place ids that differ. That is evidence, not absence of it, and it is the case that
 * actually costs somebody their afternoon.
 *
 * Nothing here touches storage, the DO, or the network: the binding decision is a function of what
 * is stored and what was reported, so it can be exercised directly. do/session.ts does the
 * persisting and the refusing; this file decides.
 */
import type { StudioPlace } from '@golem/shared';

/** What the plugin said about the place it has open. Numbers are untrusted wire values. */
export interface PlaceReport {
  placeId: number;
  gameId: number;
  placeName: string;
}

export type PlaceAdmission =
  /** Nothing usable was reported. Serve ops; confirm nothing. */
  | { verdict: 'unverified'; reason: 'no-report' | 'unsaved-place'; place: StudioPlace | null }
  /** First identifiable sighting. The caller persists `place` and serves ops. */
  | { verdict: 'bind'; place: StudioPlace }
  /** Same place. `place` carries any refreshed name; `changed` says whether it is worth a write. */
  | { verdict: 'match'; place: StudioPlace; changed: boolean }
  /** A different place, provably. Serve NO ops. */
  | { verdict: 'mismatch'; expected: StudioPlace; open: PlaceReport; message: string };

/** The longest place name we will store or echo. Studio allows far more; a UI pill does not. */
const MAX_PLACE_NAME = 96;

/**
 * Place names are author-controlled text that ends up in the web UI, in the plugin dock, and in
 * the model's system prompt. Control characters are removed rather than escaped — there is no
 * legitimate place name containing them, and a name is not worth a rendering bug.
 */
export function cleanPlaceName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, MAX_PLACE_NAME);
}

/**
 * Coerce one wire id. Anything that is not a non-negative safe integer becomes 0 — which this
 * file already treats as "cannot tell", so a hostile or broken value degrades into the branch
 * that refuses nothing and confirms nothing, rather than into a comparison against garbage.
 */
function cleanId(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return 0;
  return n;
}

/** Normalise whatever arrived on the wire into a report, or null when there was nothing at all. */
export function readPlaceReport(raw: unknown): PlaceReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // A state event with neither id nor name is not a report about a place.
  if (o.placeId === undefined && o.gameId === undefined && o.placeName === undefined) return null;
  return { placeId: cleanId(o.placeId), gameId: cleanId(o.gameId), placeName: cleanPlaceName(o.placeName) };
}

/** A place we can actually name to a user and compare against later. */
export function identifiable(r: PlaceReport | null): boolean {
  return !!r && r.placeId > 0;
}

/**
 * The refusal, written for the person who has to fix it — which is always the user, in Studio,
 * in a different window. It names both places so they can tell which one they are looking at.
 */
export function mismatchMessage(expected: StudioPlace, open: PlaceReport): string {
  const openName = open.placeName || (open.placeId > 0 ? `place ${open.placeId}` : 'an unsaved place');
  const wanted = expected.placeName || `place ${expected.placeId}`;
  return (
    `This project is paired to "${wanted}", but Studio has "${openName}" open. ` +
    `Apple will not build in a place the project is not paired to. ` +
    `Reopen "${wanted}", or re-pair this Studio from the Apple web app to bind the project to "${openName}".`
  );
}

/**
 * The whole decision.
 *
 * `bound` is what storage holds (null before the first identifiable sighting), `report` is what
 * the plugin just said. Order of the branches is the order of the argument: no evidence first,
 * then no binding, then agreement, then — last, and only on positive evidence — refusal.
 */
export function placeAdmission(bound: StudioPlace | null, report: PlaceReport | null, now: number): PlaceAdmission {
  if (!report) return { verdict: 'unverified', reason: 'no-report', place: bound };
  if (!identifiable(report)) return { verdict: 'unverified', reason: 'unsaved-place', place: bound };
  if (!bound || bound.placeId <= 0) {
    return {
      verdict: 'bind',
      place: { placeId: report.placeId, gameId: report.gameId, placeName: report.placeName, boundAt: now },
    };
  }
  if (bound.placeId === report.placeId) {
    // A renamed place is the same place. The gameId is refreshed alongside it because publishing
    // an unpublished place fills it in without changing the placeId.
    const changed = bound.placeName !== report.placeName || bound.gameId !== report.gameId;
    return {
      verdict: 'match',
      changed,
      place: changed ? { ...bound, placeName: report.placeName, gameId: report.gameId } : bound,
    };
  }
  return { verdict: 'mismatch', expected: bound, open: report, message: mismatchMessage(bound, report) };
}

/** Does this admission mean the plugin may be handed work? Refusal is the only no. */
export function servesOps(a: PlaceAdmission): boolean {
  return a.verdict !== 'mismatch';
}
