// Master plan §4.2 (Skills) and §4.3 #16: source-backed procedures, converted verbatim from the official Creator
// Documentation (Roblox/creator-docs, CC BY 4.0). Every numbered list of three or more steps under a heading becomes
// one skill: the heading, the paragraph that introduces the list, and the steps with their code, sub-steps and notes,
// word for word. Only media embeds (images, videos, image grids) are removed, and relative links keep their text.
// Each skill cites its page and heading. A format change, no new content (L1). A section that teaches with prose and
// Luau code instead of a list is a code recipe (its code samples are MIT, Copyright (c) 2023 Roblox Corporation).
//
//   node packages/library/src/ingest-skills.mjs --docs <creator-docs checkout> --out <items.jsonl>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

const BASE = 'https://create.roblox.com/docs/';
const STEP = /^\d+\.\s/;
// A credential-shaped value (even a docs example) is never copied into the library: the skill is refused.
export const CREDENTIAL = /hooks\.slack\.com\/services\/|discord(?:app)?\.com\/api\/webhooks\/\d|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk_(?:live|test)_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const slug = (s) => s.toLowerCase().replace(/[`*_[\]()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ENTITIES = { nbsp: ' ', amp: '&', deg: '°', hellip: '…', rang: '⟩', rarr: '→', times: '×', ctdot: '⋯', vellip: '⋮', lt: '<', gt: '>', quot: '"' };

/**
 * Media embeds out (images, videos, grids of images); the docs site's widgets out (chips, swatches, cards, buttons);
 * wrappers (alerts, grids, tabs, accordions) keep their text and a tab its label; a relative link keeps its text;
 * entities decoded. Pure.
 */
export function clean(md) {
  return md
    .replace(/<video[\s\S]*?<\/video>/gi, '')
    .replace(/<GridContainer[\s\S]*?<\/GridContainer>/g, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<img\b[^>]*\/?>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<(Chip|ColorSwatch|BrowseSampleCard|UseStudioButton)\b[^>]*\/>/g, '')
    .replace(/<TabItem\b[^>]*\blabel="([^"]*)"[^>]*>/g, '$1:')
    .replace(/<\/?(Alert|AlertTitle|Grid|TabItem|Tabs|Typography|BaseAccordion|AccordionSummary|AccordionDetails|Button|UseStudioButton|Card|CardContent|CardActions|KeyboardInput)\b[^>]*>/g, '')
    .replace(/&([a-z]+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, '$1')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
    .trim();
}

/**
 * The procedures of one page: [{ heading, anchor, intro, steps, body }], where body is the cleaned markdown of the
 * list and steps its number of top-level steps. A list counts from three steps. Pure.
 */
export function procedures(md) {
  const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const out = [];
  let heading = '', fence = false, para = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) fence = !fence;
    if (fence) continue;
    const h = l.match(/^#{1,4}\s+(.+?)\s*$/);
    if (h) { heading = h[1]; para = []; continue; }
    if (!STEP.test(l)) { if (l.trim() && !/^\s/.test(l)) para.push(l); else if (!l.trim() && para.length) para.push(''); continue; }
    // A list: step lines, indented continuation (code, sub-steps, notes) and blank lines between them.
    let j = i, inFence = false, steps = 0;
    const body = [];
    for (; j < lines.length; j++) {
      const m = lines[j];
      if (/^\s*```/.test(m)) inFence = !inFence;
      if (inFence || /^\s*```/.test(m)) { body.push(m); continue; }
      if (STEP.test(m)) { steps += 1; body.push(m); continue; }
      if (!m.trim() || /^\s{2,}|^\t/.test(m)) { body.push(m); continue; }
      break;
    }
    const intro = clean(para.join('\n').split(/\n\s*\n/).filter(Boolean).pop() ?? '');
    if (steps >= 3 && heading) out.push({ heading: heading.replace(/[`*]/g, ''), anchor: slug(heading), intro, steps, body: clean(body.join('\n')) });
    para = [];
    i = j - 1;
  }
  return out;
}

/**
 * The code recipes of one page: a section (a level 2-4 heading to the next one) that teaches with prose and Luau code
 * rather than a numbered list: [{ heading, anchor, intro: '', steps: 0, body, codeBlocks }], the body word for word
 * (cleaned). Sections holding a numbered list are procedures() and are left to it. Pure.
 */
export function recipes(md) {
  const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const sections = [];
  let cur = null, fence = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) fence = !fence;
    const h = !fence && l.match(/^#{2,4}\s+(.+?)\s*$/);
    if (h) { cur = { heading: h[1], lines: [] }; sections.push(cur); continue; }
    if (cur) cur.lines.push(l);
  }
  const out = [];
  for (const sec of sections) {
    const body = sec.lines.join('\n');
    const outside = body.replace(/```[\s\S]*?```/g, '');
    const codeBlocks = (body.match(/```lua(u)?\b/g) ?? []).length;
    if (!codeBlocks || /^\d+\.\s/m.test(outside)) continue;
    out.push({ heading: sec.heading.replace(/[`*]/g, ''), anchor: slug(sec.heading), intro: '', steps: 0, body: clean(body), codeBlocks, recipe: true });
  }
  return out;
}

const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.md')) out.push(p); } return out; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const docs = arg('docs'), out = arg('out');
  if (!docs || !out) { console.error('usage: ingest-skills.mjs --docs <creator-docs checkout> --out <items.jsonl>'); process.exit(2); }
  const root = join(docs, 'content', 'en-us');
  const git = (...a) => execFileSync('git', ['-C', docs, ...a], { encoding: 'utf8' }).trim();
  const head = git('log', '-1', '--format=%cI');
  const lic = classifyLicence('CC-BY-4.0');
  const items = [], ids = new Set();
  let rejected = 0;
  for (const file of walk(root).filter((f) => !relative(root, f).startsWith('reference/'))) {
    const md = readFileSync(file, 'utf8');
    const procs = [...procedures(md), ...recipes(md)]; // procedures first, so their ids stay what they were
    if (!procs.length) continue;
    const rel = relative(root, file).replace(/\.md$/, '').replace(/\/index$/, '');
    const page = (md.match(/^title:\s*(.+)$/m) ?? [])[1]?.replace(/^['"]|['"]$/g, '') ?? rel;
    const created = git('log', '--diff-filter=A', '--format=%cs', '--', relative(docs, file)).split('\n').pop() || git('log', '-1', '--format=%cs', '--', relative(docs, file));
    for (const p of procs) {
      let id = `skill:docs:${slug(rel).slice(0, 70)}:${p.anchor.slice(0, 40)}`;
      while (ids.has(id)) id += '-2';
      ids.add(id);
      const url = `${BASE}${rel}#${p.anchor}`;
      const text = `${p.intro ? p.intro + '\n\n' : ''}${p.body}`;
      const title = `${p.heading} (${page})`;
      const tags = [...new Set(`${p.heading} ${page}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2))];
      const item = {
        id, title, kind: 'skill', family: `skill:docs:${rel.split('/').slice(0, 2).join('/')}`,
        source_url: url, author: 'Roblox', licence_words: 'CC-BY-4.0', licence_class: lic.class,
        licence_url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: `"${p.heading}", ${page}, Roblox Creator Documentation (${url}), CC BY 4.0${p.recipe ? '; code samples MIT License, Copyright (c) 2023 Roblox Corporation' : ''}`,
        fetched_at: head, uploader: 'none', file_sha256: createHash('sha256').update(text).digest('hex'),
        tags: p.recipe ? [...tags, 'recipe', 'code'] : tags, checks: { steps: p.steps, chars: text.length, page: rel, ...(p.recipe ? { code_blocks: p.codeBlocks } : {}) }, text,
        ai_check: aiCheck({ title, tags, created, creator: 'roblox' }, new Set(['roblox']), head),
      };
      const errs = validateItem(item);
      if (CREDENTIAL.test(text)) errs.push('its text carries a credential-shaped value');
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${id}: ${errs.join('; ')}`); } else items.push(item);
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} skills from ${new Set(items.map((i) => i.checks.page)).size} pages, ${rejected} rejected -> ${out}`);
}
