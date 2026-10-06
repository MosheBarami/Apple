// A library item and its provenance (master plan §4.1 L3, L5, L6, L7). validateItem lists what is missing. Pure.
import { classifyLicence, ALLOWED } from './licence.mjs';
import { AI_WORDS } from './aicheck.mjs';

export const KINDS = ['prop', 'building', 'map', 'character', 'vehicle', 'material', 'sky', 'lighting', 'icon', 'frame', 'font', 'vfx', 'sfx', 'music', 'animation', 'code', 'knowledge', 'skill', 'template'];
export const UPLOADERS = ['creator_store', 'studpilot_group', 'user_account', 'none'];
export const GRADES = ['A', 'B', 'C'];

export function validateItem(it) {
  const errs = [];
  const need = (k, ok = (v) => typeof v === 'string' && v.trim().length > 0) => { if (!ok(it?.[k])) errs.push(`${k} missing or invalid`); };
  need('id', (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9:_\-.]{2,120}$/.test(v));
  need('title');
  need('kind', (v) => KINDS.includes(v));
  need('source_url', (v) => typeof v === 'string' && /^https?:\/\//.test(v));
  need('author');
  need('licence_words');
  need('licence_class', (v) => v in ALLOWED);
  need('licence_url', (v) => typeof v === 'string' && /^https?:\/\//.test(v));
  need('fetched_at', (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  need('uploader', (v) => UPLOADERS.includes(v));
  if (!it?.roblox_asset_id && !it?.file_sha256) errs.push('roblox_asset_id or file_sha256 required');
  if (it?.licence_words) {
    const c = classifyLicence(it.licence_words);
    if (!c.ok) errs.push(`licence refused: ${c.reason}`);
    else if (c.class !== it.licence_class) errs.push(`licence_class ${it.licence_class} does not match the words (${c.class})`);
  }
  if (ALLOWED[it?.licence_class]?.attribution && !(typeof it.attribution === 'string' && it.attribution.length > 3)) errs.push('attribution text required by the licence');
  if (!it?.ai_check || typeof it.ai_check.pass !== 'boolean') errs.push('ai_check missing');
  else if (!it.ai_check.pass) errs.push(`ai_check failed: ${it.ai_check.reasons.join('; ')}`);
  const words = [it?.title, it?.description, ...(it?.tags ?? [])].filter(Boolean).join(' ').match(AI_WORDS);
  if (words) errs.push(`its own words mention "${words[0]}" (L1)`);
  if (it?.grade !== undefined && !GRADES.includes(it.grade)) errs.push('grade must be A, B or C');
  return errs;
}

/** Only A and B reach the build model (L5); C stays out. */
export const reachesModel = (it) => it.grade === 'A' || it.grade === 'B';
