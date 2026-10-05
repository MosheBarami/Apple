// Reading a piece folder (planning/proof/<milestone>/<request-id>/) back: the screenshots in a fixed order, the text
// files, the manifest. Shared by prepare-critics.mjs and write-verdicts.mjs so both mean the same thing by "the shots".
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const WORLD_ORDER = ['overview', 'three-quarter', 'close-up', 'spawn-eye'];

/** Rank a screenshot file name: the four world cameras, then the UI shot(s), then the play frames, then anything else. */
function shotRank(name) {
  const stem = name.replace(/\.(png|jpg|jpeg)$/i, '');
  const w = WORLD_ORDER.indexOf(stem);
  if (w >= 0) return [0, w, stem];
  if (stem.startsWith('ui-')) return [1, 0, stem];
  const p = /^play-(\d+)$/.exec(stem);
  if (p) return [2, Number(p[1]), stem];
  return [3, 0, stem];
}

/** The screenshots of a piece, in the order critics are shown them: [{ name, path }] with absolute paths. */
export function listShots(dir) {
  const shotsDir = join(resolve(dir), 'shots');
  if (!existsSync(shotsDir)) return [];
  return readdirSync(shotsDir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort((a, b) => {
      const [ra, ia, sa] = shotRank(a);
      const [rb, ib, sb] = shotRank(b);
      return ra - rb || ia - ib || sa.localeCompare(sb);
    })
    .map((name) => ({ name, path: join(shotsDir, name) }));
}

const text = (dir, name, dflt = '') => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : dflt);
const json = (dir, name) => {
  try {
    return JSON.parse(text(dir, name, 'null'));
  } catch {
    return null;
  }
};

/** Everything the critics and the verdict need from one folder. Nothing here is computed from a model's output. */
export function readPiece(dirArg) {
  const dir = resolve(dirArg);
  const manifest = json(dir, 'manifest.json');
  const stepsJson = json(dir, 'steps.json');
  return {
    dir,
    id: manifest?.request?.id ?? basename(dir),
    category: manifest?.request?.category ?? null,
    request: text(dir, 'request.txt').replace(/\n$/, ''),
    reply: text(dir, 'reply.md').replace(/\n$/, ''),
    consoleText: text(dir, 'console.txt'),
    steps: stepsJson,
    credits: json(dir, 'credits.json'),
    timing: json(dir, 'timing.json'),
    manifest,
    shots: listShots(dir),
  };
}

/**
 * What the harness itself measured, in the few lines the claim auditor can check a reply against: what the run added to the
 * place (counts from Studio, not from the reply), and what the play test did and read. Null parts are absent records.
 */
export function measuredSummary(manifest) {
  const b = manifest?.build ?? null;
  const p = manifest?.playTest ?? null;
  const frames = Array.isArray(p?.frames) ? p.frames : [];
  return {
    build: b
      ? {
          kind: b.kind ?? null,
          addedInstances: b.addedInstances ?? null,
          addedParts: b.addedParts ?? null,
          addedScripts: b.addedScripts ?? null,
          addedByService: b.addedByService && !Array.isArray(b.addedByService) ? b.addedByService : {},
          bounds: b.bounds ?? null,
          terrain: b.terrain ?? null,
          screenGuis: (b.screenGuis ?? []).map((g) => ({ name: g.name, enabled: g.enabled, guiObjects: g.guiObjects, texts: g.texts })),
        }
      : null,
    playTest: p
      ? {
          started: p.started === true,
          serverAnswered: p.serverAnswered === true,
          errors: Number.isFinite(p.errors) ? p.errors : null,
          warnings: Number.isFinite(p.warnings) ? p.warnings : null,
          notEstablished: p.unestablished ?? null,
          sourcesRead: { console: Boolean(p.console), serverLog: Boolean(p.logServer), clientLog: Boolean(p.logClient) },
          framesCaptured: frames.filter((f) => f.file).length,
          firstErrorLines: [...(p.logServer?.first ?? []), ...(p.logClient?.first ?? [])].slice(0, 10),
        }
      : null,
    ui: manifest?.ui ? { note: manifest.ui.note ?? null } : null,
  };
}

/** The step list as plain text, one line per tool call, for the claim auditor. */
export function stepsText(steps) {
  if (!steps) return '(no step record)';
  const lines = [`${steps.count ?? 0} tool calls, ${steps.failed ?? 0} failed; run ended: ${steps.stopReason ?? 'unknown'}`];
  for (const [i, s] of (steps.steps ?? []).entries()) {
    lines.push(`${i + 1}. ${s.tool} [${s.ok === false ? 'FAILED' : 'ok'}] ${s.summary ?? ''}${s.error ? ` (error: ${s.error})` : ''}`);
  }
  return lines.join('\n');
}
