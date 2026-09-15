// What a project owes, to whom, and whether it can be published commercially.
//
// `asset-library.ts` answers "where did this asset come from" for one asset. This file answers the
// two questions a *project* has to answer before it ships:
//
//   1. Whose names have to appear in the credits, and what exactly do they have to say
//      (manifest §14, §15, §16).
//   2. Is anything in here incompatible with a commercially published experience (§15) — and
//      which asset, and why, in words the owner can act on.
//
// And underneath both, the line manifest §42 draws: **third-party material is used under someone
// else's licence and is never presented as Apple's own work.** The attribution report separates
// the three cases explicitly rather than emitting one undifferentiated credits list, because a
// credits list that does not distinguish them is exactly how the mistake gets made.
//
// PERSISTENCE CHOICE — D1 (`CORPUS`), not KV and not a Durable Object:
//   - The attribution export is a JOIN of project usage against `asset_library`, which is already
//     in D1. KV cannot join and a DO cannot see another DO's storage, so either alternative would
//     force the join into application code over a full scan of the library.
//   - Compliance questions are asked ACROSS projects — "a source revoked a licence, which places
//     are affected?" — and per-project DO storage structurally cannot answer that. This is the
//     deciding reason: SessionDO is otherwise the natural home for per-project state.
//   - The write path is cold. A usage row is written when an asset is placed, not per token, so
//     D1's single-threaded writer is not on any hot path.
// Row shape follows asset_library's conventions: booleans as integers, lists as JSON text.
import type { Env } from './env';
import type { AssetKind } from './assets';
import type { AssetOriginality, AssetProvenance, AssetSourceSite } from './asset-library';
import { LICENCES, normaliseLicence, originalityOf } from './asset-library';

// ---------------------------------------------------------------------------------------------
// Source-level credits
// ---------------------------------------------------------------------------------------------

export interface SourceCredit {
  /** The credit line, verbatim as the source's terms word it. */
  text: string;
  url: string;
  /**
   * `live_api` credits are owed only when the asset came through the source's API rather than a
   * one-off manual download, which is why `AssetUse.viaLiveApi` is recorded at all.
   */
  when: 'always' | 'live_api';
  why: string;
}

/**
 * Credits a *source* asks for over and above whatever its licence requires. Poly Haven is the
 * reason this concept exists: its assets are CC0, so the licence obliges nothing, but its API
 * terms ask for "Powered by Poly Haven" wherever the live API is used (§14). Treating that as a
 * licence obligation would be wrong, and dropping it because the licence is CC0 would be wrong
 * too.
 *
 * Exhaustive `Record<AssetSourceSite, …>` for the same reason as ASSET_ORIGINALITY: a new source
 * fails the typecheck until someone has read its terms.
 */
export const SOURCE_CREDITS: Readonly<Record<AssetSourceSite, SourceCredit | null>> = {
  kenney: null,
  quaternius: null,
  ambientcg: null,
  poly_haven: {
    text: 'Powered by Poly Haven',
    url: 'https://polyhaven.com',
    when: 'live_api',
    why: 'CC0 requires no attribution, but Poly Haven asks for this credit wherever its live API is used (manifest §14)',
  },
  poly_pizza: null,
  opengameart: null,
  sketchfab: null,
  // Iconify is a distributor, not a rights-holder: it asks for nothing of its own, and the
  // obligation always belongs to the SET the icon came from. Recording a credit here would
  // attribute to the wrong party, which is worse than recording none.
  iconify: null,
  game_icons: {
    text: 'Icons made by the game-icons.net contributors',
    url: 'https://game-icons.net',
    // ALWAYS, not live_api: this one is a licence obligation, not a courtesy. Most of game-icons
    // is CC BY 3.0, and its about page states the wording it wants. Two contributor folders
    // (Viscious Speed, Zeromancer) are CC0 and owe nothing — the per-asset licence decides, and
    // this credit is the fallback for the CC BY majority.
    when: 'always',
    why: 'CC BY 3.0 over most of the set; game-icons.net/about asks for "Icons made by {author}. Available on https://game-icons.net"',
  },
  wikimedia: null,
  cgbookcase: null,
  roblox_official: null,
  creator_store: null,
  generated_roblox: null,
  procedural: null,
};

// ---------------------------------------------------------------------------------------------
// Usage records
// ---------------------------------------------------------------------------------------------

/** One asset, used in one project. Counting is per (project, asset), not per placement. */
export interface AssetUse {
  projectId: string;
  /** `asset_library.id`. Not a Roblox id — a Roblox id says nothing about where the bytes came from. */
  assetId: string;
  firstUsedAt: string;
  lastUsedAt: string;
  uses: number;
  /** Whether the asset reached the project through the source's live API. Drives `live_api` credits. */
  viaLiveApi: boolean;
  /** Where it is used — a scene or op name. Free text, null when the caller did not say. */
  context: string | null;
}

/**
 * A usage row joined to its provenance. `provenance: null` means the project is using an asset the
 * library cannot account for, which is the single worst state this module reports: everything else
 * is a known obligation, and that is an unknown one.
 */
export interface ProjectAsset {
  use: AssetUse;
  provenance: AssetProvenance | null;
}

export async function ensureProvenanceTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  // Composite primary key rather than a surrogate id: usage is a set, and re-placing the same
  // asset is an update to the same fact, not a new one.
  await env.CORPUS.exec(
    `create table if not exists project_asset_use(project_id text not null, asset_id text not null, first_used_at text not null, last_used_at text not null, uses integer not null default 1, via_live_api integer not null default 0, context text, primary key(project_id, asset_id))`,
  );
  await env.CORPUS.exec(`create index if not exists idx_project_asset_project on project_asset_use(project_id)`);
  // The cross-project query a DO could never answer: which places use this asset?
  await env.CORPUS.exec(`create index if not exists idx_project_asset_asset on project_asset_use(asset_id)`);
}

export interface RecordUseOptions {
  viaLiveApi?: boolean;
  context?: string | null;
  now?: string;
}

/**
 * Record that a project uses an asset. Idempotent: a repeat use bumps the counter and the
 * last-used stamp, and `via_live_api` is sticky-true because a credit once owed stays owed even if
 * a later placement of the same asset came from cache.
 */
export async function recordAssetUse(env: Pick<Env, 'CORPUS'>, projectId: string, assetId: string, opts: RecordUseOptions = {}): Promise<void> {
  const now = opts.now ?? new Date().toISOString();
  await env.CORPUS.prepare(
    `insert into project_asset_use(project_id, asset_id, first_used_at, last_used_at, uses, via_live_api, context) values(?,?,?,?,1,?,?) on conflict(project_id, asset_id) do update set last_used_at=excluded.last_used_at, uses=project_asset_use.uses+1, via_live_api=max(project_asset_use.via_live_api, excluded.via_live_api), context=coalesce(excluded.context, project_asset_use.context)`,
  )
    .bind(projectId, assetId, now, now, opts.viaLiveApi ? 1 : 0, opts.context ?? null)
    .run();
}

interface JoinRow {
  asset_id: string;
  first_used_at: string;
  last_used_at: string;
  uses: number;
  via_live_api: number;
  context: string | null;
  name: string | null;
  kind: string | null;
  source: string | null;
  source_url: string | null;
  licence: string | null;
  licence_url: string | null;
  commercial_use: number | null;
  attribution_required: number | null;
  author: string | null;
  retrieved_at: string | null;
  imported_at: string | null;
  modifications: string | null;
  roblox_asset_id: number | null;
  tags: string | null;
  sha256: string | null;
}

function parseList(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * A left join, deliberately: a usage row whose library row was deleted or was never written must
 * still appear in the report. Dropping it would turn an unaccounted asset into an invisible one.
 */
const JOINED =
  `select u.asset_id, u.first_used_at, u.last_used_at, u.uses, u.via_live_api, u.context, l.name, l.kind, l.source, l.source_url, l.licence, l.licence_url, l.commercial_use, l.attribution_required, l.author, l.retrieved_at, l.imported_at, l.modifications, l.roblox_asset_id, l.tags, l.sha256 from project_asset_use u left join asset_library l on l.id = u.asset_id where u.project_id = ? order by u.asset_id`;

/**
 * The same rows with every library column forced to null.
 *
 * Used when `asset_library` does not exist. That is not a hypothetical: nothing in the
 * repository calls `ensureAssetTables`, so the table has never been created in
 * production (BLOCKERS §4b), and the LEFT JOIN above therefore raised
 * `no such table: asset_library` on every read — which meant the whole credits surface
 * answered 500 and rendered a connection error. The honest answer for a project whose
 * library does not exist is that NOTHING can be accounted for, which is exactly what a
 * join that matches nothing produces. So produce it, rather than failing.
 */
const UNJOINED =
  `select u.asset_id, u.first_used_at, u.last_used_at, u.uses, u.via_live_api, u.context, null as name, null as kind, null as source, null as source_url, null as licence, null as licence_url, null as commercial_use, null as attribution_required, null as author, null as retrieved_at, null as imported_at, null as modifications, null as roblox_asset_id, null as tags, null as sha256 from project_asset_use u where u.project_id = ? order by u.asset_id`;

export async function projectAssets(env: Pick<Env, 'CORPUS'>, projectId: string): Promise<ProjectAsset[]> {
  let rows;
  try {
    rows = await env.CORPUS.prepare(JOINED).bind(projectId).all<JoinRow>();
  } catch (e) {
    // ONLY the missing-table case. Anything else — a timeout, a corrupt index — must
    // still fail loudly: reporting it as "nothing is accounted for" would turn a fault
    // into a confident answer, which is the failure this whole module exists to avoid.
    if (!String(e instanceof Error ? e.message : e).includes('no such table')) throw e;
    rows = await env.CORPUS.prepare(UNJOINED).bind(projectId).all<JoinRow>();
  }

  return rows.results.map((r) => {
    const use: AssetUse = {
      projectId,
      assetId: r.asset_id,
      firstUsedAt: r.first_used_at,
      lastUsedAt: r.last_used_at,
      uses: r.uses,
      viaLiveApi: r.via_live_api === 1,
      context: r.context,
    };
    if (r.name === null || r.source === null || r.licence === null) return { use, provenance: null };
    const provenance: AssetProvenance = {
      id: r.asset_id,
      name: r.name,
      kind: (r.kind ?? 'prop') as AssetKind,
      source: r.source as AssetSourceSite,
      sourceUrl: r.source_url ?? '',
      licence: r.licence,
      licenceUrl: r.licence_url ?? '',
      commercialUse: r.commercial_use === 1,
      attributionRequired: r.attribution_required === 1,
      author: r.author ?? '',
      retrievedAt: r.retrieved_at ?? '',
      importedAt: r.imported_at,
      modifications: parseList(r.modifications),
      robloxAssetId: r.roblox_asset_id,
      triangles: null,
      textureResolution: null,
      boundsStuds: null,
      tags: parseList(r.tags),
      sha256: r.sha256,
    };
    return { use, provenance };
  });
}

// ---------------------------------------------------------------------------------------------
// Commercial-use compatibility
// ---------------------------------------------------------------------------------------------

/**
 * Why an asset is a problem. Codes are stable strings so a caller can branch on them without
 * matching on prose.
 */
export const COMPLIANCE_CODES = [
  'missing_provenance',
  'non_commercial',
  'share_alike',
  'unrecognised_licence',
  'licence_excluded',
  'attribution_required',
  'import_date_missing',
] as const;
export type ComplianceCode = (typeof COMPLIANCE_CODES)[number];

export interface ComplianceFinding {
  assetId: string;
  /** Display name, or the id again when there is no provenance row to read a name from. */
  name: string;
  code: ComplianceCode;
  /** `blocker` = do not publish commercially. `warning` = publishable, with an obligation attached. */
  severity: 'blocker' | 'warning';
  why: string;
  remediation: string;
}

export interface CommercialUseReport {
  projectId: string;
  /** True when there are no blockers. Warnings do not clear — they are obligations, not defects. */
  ok: boolean;
  checked: number;
  /** How the project's assets divide by ownership. `unknown` is the unaccounted-for count. */
  counts: Record<AssetOriginality | 'unknown', number>;
  /** Blockers first, then warnings; stable order within each by asset id. */
  findings: ComplianceFinding[];
}

/**
 * The §15 gate: given a project's assets, say which of them cannot ship in a commercially
 * published experience, and why.
 *
 * Pure — no I/O — so the same function gates an export endpoint, a CI check and a test.
 *
 * A Roblox experience with any monetisation, or one merely eligible for the engagement payout, is
 * a commercial use. There is no "hobby project" carve-out in this check, because the customer can
 * turn monetisation on at any time without touching the assets.
 */
export function commercialUseReport(projectId: string, assets: ProjectAsset[]): CommercialUseReport {
  const findings: ComplianceFinding[] = [];
  const counts: Record<AssetOriginality | 'unknown', number> = { golem_original: 0, user_generated: 0, third_party: 0, unknown: 0 };

  for (const { use, provenance } of assets) {
    if (!provenance) {
      counts.unknown += 1;
      findings.push({
        assetId: use.assetId,
        name: use.assetId,
        code: 'missing_provenance',
        severity: 'blocker',
        why: 'this asset is used by the project but has no row in asset_library, so nothing is known about its licence or its origin',
        remediation: 'write a provenance record for it, or remove it from the project — an asset that cannot be accounted for cannot be shipped',
      });
      continue;
    }

    counts[originalityOf(provenance.source)] += 1;
    const licenceId = normaliseLicence(provenance.licence);
    const rule = licenceId ? LICENCES[licenceId] : undefined;
    const named = provenance.name || use.assetId;

    if (!rule) {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'unrecognised_licence',
        severity: 'blocker',
        why: `the recorded licence "${provenance.licence}" does not resolve to a known licence, so its commercial terms are unknown`,
        remediation: 'read the licence off the source page again and add it to LICENCES deliberately, or drop the asset',
      });
      continue;
    }

    // The record's own boolean is checked as well as the licence rule. They are cross-checked at
    // ingest, but a row can predate that check or be written by hand, and disagreement here means
    // the safer of the two answers wins.
    if (!rule.commercialUse || !provenance.commercialUse) {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'non_commercial',
        severity: 'blocker',
        why: `${licenceId} does not permit commercial use, and a monetised or payout-eligible Roblox experience is a commercial use`,
        remediation: `replace "${named}" with a CC0 or otherwise commercially-licensed asset before publishing`,
      });
      continue;
    }

    if (rule.shareAlike) {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'share_alike',
        severity: 'blocker',
        why: `${licenceId} is share-alike: ${rule.why}`,
        remediation: `replace "${named}" — the obligation would pass to the customer, who never agreed to it`,
      });
      continue;
    }

    if (!rule.allowedInLibrary) {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'licence_excluded',
        severity: 'blocker',
        why: `${licenceId} is excluded from the library: ${rule.why}`,
        remediation: `replace "${named}"`,
      });
      continue;
    }

    if (rule.attributionRequired || provenance.attributionRequired) {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'attribution_required',
        severity: 'warning',
        why: `${licenceId} requires attribution — the asset is usable commercially only while the credit line ships with the place`,
        remediation: 'include the attribution export in the published experience (a credits GUI, a description block, or both)',
      });
    }

    // §16 completeness, reported here because the export is where an incomplete record actually
    // costs something: without an import date we cannot say which version of the source's terms
    // we accepted.
    if (!provenance.importedAt && provenance.robloxAssetId !== null && originalityOf(provenance.source) === 'third_party') {
      findings.push({
        assetId: use.assetId,
        name: named,
        code: 'import_date_missing',
        severity: 'warning',
        why: 'no import date is recorded for a third-party asset that is already live in Roblox (manifest §16)',
        remediation: 'backfill importedAt from the ingest log',
      });
    }
  }

  const rank = (f: ComplianceFinding) => (f.severity === 'blocker' ? 0 : 1);
  findings.sort((a, b) => rank(a) - rank(b) || a.assetId.localeCompare(b.assetId) || a.code.localeCompare(b.code));

  return { projectId, ok: !findings.some((f) => f.severity === 'blocker'), checked: assets.length, counts, findings };
}

// ---------------------------------------------------------------------------------------------
// Attribution export
// ---------------------------------------------------------------------------------------------

export interface CreditEntry {
  assetId: string;
  name: string;
  author: string;
  /** Verbatim, as recorded. Never rewritten into a prettier form for display. */
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  /** Empty when the asset was used exactly as published. */
  modifications: string[];
}

export interface AttributionReport {
  projectId: string;
  generatedAt: string;
  /** Golem's own work. Separated so §42's line is visible in the output, not just in policy. */
  original: CreditEntry[];
  /** Made by GenerationService in the customer's own Studio session — theirs, not ours. */
  userGenerated: CreditEntry[];
  /** The licence obliges a credit. These must ship. */
  required: CreditEntry[];
  /** No obligation. CC0 asks for nothing; crediting anyway costs a line and is the decent thing. */
  courtesy: CreditEntry[];
  /** Credits owed to a source rather than to a licence — see SOURCE_CREDITS. */
  sourceCredits: SourceCredit[];
  /** Asset ids the library cannot account for. Non-empty means the export is incomplete, and says so. */
  unaccounted: string[];
}

function toEntry(p: AssetProvenance): CreditEntry {
  return {
    assetId: p.id,
    name: p.name,
    author: p.author,
    licence: p.licence,
    licenceUrl: p.licenceUrl,
    sourceUrl: p.sourceUrl,
    modifications: p.modifications ?? [],
  };
}

/**
 * Build the credits for one project. Pure, and deterministic in ordering, so two exports of an
 * unchanged project are byte-identical apart from `generatedAt`.
 */
export function attributionReport(projectId: string, assets: ProjectAsset[], now: Date = new Date()): AttributionReport {
  const report: AttributionReport = {
    projectId,
    generatedAt: now.toISOString(),
    original: [],
    userGenerated: [],
    required: [],
    courtesy: [],
    sourceCredits: [],
    unaccounted: [],
  };
  const credits = new Map<string, SourceCredit>();

  for (const { use, provenance } of assets) {
    if (!provenance) {
      report.unaccounted.push(use.assetId);
      continue;
    }
    const entry = toEntry(provenance);
    const originality = originalityOf(provenance.source);
    const licenceId = normaliseLicence(provenance.licence);
    const rule = licenceId ? LICENCES[licenceId] : undefined;

    if (originality === 'golem_original') report.original.push(entry);
    else if (originality === 'user_generated') report.userGenerated.push(entry);
    else if (rule?.attributionRequired || provenance.attributionRequired) report.required.push(entry);
    else report.courtesy.push(entry);

    const credit = SOURCE_CREDITS[provenance.source];
    if (credit && (credit.when === 'always' || use.viaLiveApi)) credits.set(credit.text, credit);
  }

  const byName = (a: CreditEntry, b: CreditEntry) => a.author.localeCompare(b.author) || a.name.localeCompare(b.name);
  report.original.sort(byName);
  report.userGenerated.sort(byName);
  report.required.sort(byName);
  report.courtesy.sort(byName);
  report.sourceCredits = [...credits.values()].sort((a, b) => a.text.localeCompare(b.text));
  report.unaccounted.sort();
  return report;
}

function line(e: CreditEntry): string {
  const mods = e.modifications.length ? ` (modified: ${e.modifications.join('; ')})` : '';
  return `  - "${e.name}" by ${e.author} — ${e.licence}${mods} — ${e.sourceUrl}`;
}

/**
 * Render the report as the credits text a human can paste into a place description or a credits
 * GUI. Plain text on purpose: it has to survive being pasted into a Roblox TextLabel.
 *
 * The section headings do the §42 work. "Original work" and "Third-party assets" are separate
 * headings so the finished credits cannot read as though Golem made everything in the list.
 */
export function renderAttribution(report: AttributionReport): string {
  const out: string[] = ['Credits', '======='];

  if (report.original.length) {
    out.push('', 'Original work, built for this experience by Apple');
    for (const e of report.original) out.push(`  - ${e.name}`);
  }
  if (report.userGenerated.length) {
    out.push('', 'Generated in your own Studio session (yours, not ours)');
    for (const e of report.userGenerated) out.push(`  - ${e.name}`);
  }
  if (report.required.length) {
    out.push('', 'Third-party assets — attribution required by their licence');
    for (const e of report.required) out.push(line(e));
  }
  if (report.sourceCredits.length) {
    out.push('', 'Credits required by the sources themselves');
    for (const c of report.sourceCredits) out.push(`  - ${c.text} — ${c.url}`);
  }
  if (report.courtesy.length) {
    out.push('', 'Third-party assets — no attribution required, credited anyway with thanks');
    for (const e of report.courtesy) out.push(line(e));
  }
  if (report.unaccounted.length) {
    // Loud, and in the credits themselves. An export that quietly omitted these would be a worse
    // artefact than one that admits it is incomplete.
    out.push('', 'INCOMPLETE — these assets have no provenance record and could not be credited:');
    for (const id of report.unaccounted) out.push(`  - ${id}`);
  }
  if (out.length === 2) out.push('', 'This experience uses no recorded assets.');
  return out.join('\n');
}

/** The whole export in one call: the credits, the rendered text, and the §15 verdict. */
export async function exportProjectAttribution(
  env: Pick<Env, 'CORPUS'>,
  projectId: string,
  now: Date = new Date(),
): Promise<{ attribution: AttributionReport; text: string; commercial: CommercialUseReport }> {
  const assets = await projectAssets(env, projectId);
  const attribution = attributionReport(projectId, assets, now);
  return { attribution, text: renderAttribution(attribution), commercial: commercialUseReport(projectId, assets) };
}
