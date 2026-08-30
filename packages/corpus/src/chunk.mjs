#!/usr/bin/env node
// chunk.mjs — turn raw/ sources into data/chunks.jsonl
// One JSON line per chunk: { vecId, docSlug, title, url, kind, text, embed }
//   kind 'api'   — creator-docs YAML engine reference (classes/enums/datatypes/libraries/globals)
//   kind 'guide' — creator-docs markdown guides + luau.org markdown docs
// embed=true is capped at EMBED_CAP total chunks; priority: all api chunks, then
// luau docs, then scripting/ui/mechanics/tutorials guides. The rest are FTS-only.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const CREATOR = path.join(RAW, 'creator-docs', 'content', 'en-us');
const LUAU_SITE = path.join(RAW, 'luau-site');

const EMBED_CAP = 12000;
const API_CHUNK_MAX = 3500; // chars per api chunk before splitting by member group
const GUIDE_MIN = 600;
const GUIDE_TARGET = 1200;
const GUIDE_HARD_MAX = 2600; // single oversized block (e.g. long code fence) tolerance

// ---------------------------------------------------------------- helpers

function sha8(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 8);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// creator-docs cross-reference syntax: `Class.Humanoid.WalkSpeed|WalkSpeed`
function cleanRefs(s) {
  if (!s) return '';
  return s
    .replace(/`(?:Class|Datatype|Enum|Library|Global)\.[^`|]*\|([^`]+)`/g, '$1')
    .replace(/`(?:Class|Datatype|Library|Global)\.([^`|]+)`/g, '`$1`')
    .replace(/`Enum\.([^`|]+)`/g, '`Enum.$1`');
}

function oneLine(s, max = 170) {
  const line = cleanRefs(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return (stop > 60 ? cut.slice(0, stop + 1) : cut.trimEnd() + '…');
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// ---------------------------------------------------------------- API reference (YAML)

function typeStr(t) {
  if (t == null) return 'unknown';
  if (typeof t === 'string') return t;
  if (typeof t === 'object') return t.name ?? String(t);
  return String(t);
}

function paramSig(p) {
  const opt = p.default !== undefined && p.default !== null && p.default !== '' ? '?' : '';
  return `${p.name}: ${typeStr(p.type)}${opt}`;
}

function returnSig(returns) {
  if (!Array.isArray(returns) || returns.length === 0) return '';
  const types = returns.map((r) => typeStr(r.type)).filter((t) => t && t !== 'void' && t !== 'null');
  return types.length > 0 ? ` -> ${types.join(', ')}` : '';
}

function memberLine(kindLabel, m) {
  const dep = m.deprecation_message || (Array.isArray(m.tags) && m.tags.includes('Deprecated')) ? ' [Deprecated]' : '';
  let sig;
  if (kindLabel === 'Property') {
    sig = `Property ${m.name}: ${typeStr(m.type)}`;
  } else {
    const params = Array.isArray(m.parameters) ? m.parameters.map(paramSig).join(', ') : '';
    const ret = kindLabel === 'Method' || kindLabel === 'Function' || kindLabel === 'Callback' || kindLabel === 'Constructor' ? returnSig(m.returns) : '';
    sig = `${kindLabel} ${m.name}(${params})${ret}`;
  }
  const desc = oneLine(m.summary, 150);
  return `${sig}${dep}${desc ? ` — ${desc}` : ''}`;
}

// Split a class/datatype/library doc into chunks: header + member-group sections,
// packed greedily to API_CHUNK_MAX; a huge group is split by member.
function packApiSections(headerText, sections, contextLine) {
  const chunks = [];
  let cur = headerText;
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trimEnd());
    cur = '';
  };
  for (const section of sections) {
    const lines = [section.heading, ...section.lines];
    let block = lines.join('\n');
    if (cur && cur.length + block.length + 2 > API_CHUNK_MAX) flush();
    if (!cur && block.length > API_CHUNK_MAX) {
      // split this group by member lines
      let piece = `${contextLine}\n${section.heading}`;
      for (const line of section.lines) {
        if (piece.length + line.length + 1 > API_CHUNK_MAX) {
          chunks.push(piece);
          piece = `${contextLine}\n${section.heading} (continued)`;
        }
        piece += `\n${line}`;
      }
      chunks.push(piece);
      continue;
    }
    if (!cur) cur = chunks.length === 0 ? headerText : contextLine;
    cur += (cur ? '\n' : '') + block;
  }
  flush();
  return chunks;
}

function chunkClassLike(doc, { idPrefix, urlBase, label }) {
  const name = doc.name;
  const inherits = Array.isArray(doc.inherits) && doc.inherits.length > 0 ? ` (inherits ${doc.inherits.join(' < ')})` : '';
  const tags = Array.isArray(doc.tags) && doc.tags.length > 0 ? ` [${doc.tags.join(', ')}]` : '';
  const summary = oneLine(doc.summary || doc.description, 400);
  const headerText = `${label} ${name}${inherits}${tags}\n${summary}`;
  const contextLine = `${label} ${name}${inherits} (continued)`;

  const groups = [
    ['Constructors', doc.constructors, 'Constructor'],
    ['Constants', doc.constants, 'Constant'],
    ['Properties', doc.properties, 'Property'],
    ['Methods', doc.methods, 'Method'],
    ['Functions', doc.functions, 'Function'],
    ['Events', doc.events, 'Event'],
    ['Callbacks', doc.callbacks, 'Callback'],
  ];
  const sections = [];
  for (const [heading, members, kindLabel] of groups) {
    if (!Array.isArray(members) || members.length === 0) continue;
    const lines = members.map((m) =>
      kindLabel === 'Constant'
        ? `Constant ${m.name}: ${typeStr(m.type)}${oneLine(m.summary, 120) ? ` — ${oneLine(m.summary, 120)}` : ''}`
        : memberLine(kindLabel, m)
    );
    sections.push({ heading: `${heading}:`, lines });
  }
  if (Array.isArray(doc.math_operations) && doc.math_operations.length > 0) {
    sections.push({
      heading: 'Math operations:',
      lines: doc.math_operations.map((op) => `${typeStr(op.type_a)} ${op.operation} ${typeStr(op.type_b)} = ${typeStr(op.return_type)}`),
    });
  }

  const texts = sections.length > 0 ? packApiSections(headerText, sections, contextLine) : [headerText];
  const slug = slugify(name);
  return texts.map((text, i) => ({
    vecId: `${idPrefix}-${slug}-${i + 1}`,
    docSlug: `${idPrefix}-${slug}`,
    title: texts.length > 1 ? `${name} (${label}) ${i + 1}/${texts.length}` : `${name} (${label})`,
    url: `${urlBase}/${name}`,
    kind: 'api',
    text,
    embed: true,
  }));
}

function chunkEnum(doc) {
  const name = doc.name;
  const summary = oneLine(doc.summary || doc.description, 300);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const header = `Enum ${name}\n${summary}\nItems:`;
  const lines = items.map((it) => {
    const desc = oneLine(it.summary, 110);
    return `Enum.${name}.${it.name} (${it.value})${desc ? ` — ${desc}` : ''}`;
  });
  const texts = packApiSections(header, [{ heading: '', lines }], `Enum ${name} (continued)`).map((t) =>
    t.replace(/\n\n/g, '\n')
  );
  const slug = slugify(name);
  return texts.map((text, i) => ({
    vecId: `api-enum-${slug}-${i + 1}`,
    docSlug: `api-enum-${slug}`,
    title: texts.length > 1 ? `Enum.${name} ${i + 1}/${texts.length}` : `Enum.${name}`,
    url: `https://create.roblox.com/docs/reference/engine/enums/${name}`,
    kind: 'api',
    text,
    embed: true,
  }));
}

async function buildApiChunks() {
  const refDir = path.join(CREATOR, 'reference', 'engine');
  const out = [];
  const counts = { classes: 0, enums: 0, datatypes: 0, libraries: 0, globals: 0, parseErrors: 0 };
  if (!existsSync(refDir)) {
    console.warn('[chunk] reference/engine missing — did fetch.mjs run?');
    return { chunks: out, counts };
  }
  const kindsByDir = {
    classes: { idPrefix: 'api', urlBase: 'https://create.roblox.com/docs/reference/engine/classes', label: 'Class', key: 'classes' },
    datatypes: { idPrefix: 'api-data', urlBase: 'https://create.roblox.com/docs/reference/engine/datatypes', label: 'Datatype', key: 'datatypes' },
    libraries: { idPrefix: 'api-lib', urlBase: 'https://create.roblox.com/docs/reference/engine/libraries', label: 'Library', key: 'libraries' },
    globals: { idPrefix: 'api-global', urlBase: 'https://create.roblox.com/docs/reference/engine/globals', label: 'Globals', key: 'globals' },
  };
  for await (const file of walk(refDir)) {
    if (!file.endsWith('.yaml')) continue;
    const rel = path.relative(refDir, file);
    const topDir = rel.split(path.sep)[0];
    let doc;
    try {
      doc = YAML.parse(readFileSync(file, 'utf8'), { maxAliasCount: -1 });
    } catch (err) {
      counts.parseErrors++;
      console.warn(`[chunk] YAML parse failed: ${rel}: ${err.message.split('\n')[0]}`);
      continue;
    }
    if (!doc || !doc.name) continue;
    if (topDir === 'enums') {
      out.push(...chunkEnum(doc));
      counts.enums++;
    } else if (kindsByDir[topDir]) {
      const cfg = kindsByDir[topDir];
      out.push(...chunkClassLike(doc, cfg));
      counts[cfg.key]++;
    }
  }
  return { chunks: out, counts };
}

// ---------------------------------------------------------------- guides (markdown)

function stripFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  let meta = {};
  try {
    meta = YAML.parse(m[1]) ?? {};
  } catch {
    meta = {};
  }
  return { meta, body: src.slice(m[0].length) };
}

// Remove MDX/HTML tags outside fenced code blocks, keep inner text and code fences.
function stripMdx(body) {
  const lines = body.split('\n');
  const out = [];
  let inFence = false;
  for (let line of lines) {
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // drop pure-media/component-only lines, keep text content of wrapper tags
    if (/^\s*<\/?(img|video|iframe|figure|figcaption|Grid|Card|CardContent|CardMedia|Button|Chip|UseStudioButton|BaseAccordion|AccordionSummary|AccordionDetails)\b[^>]*\/?>\s*$/i.test(line)) continue;
    line = line
      .replace(/<[A-Za-z][A-Za-z0-9]*\b[^<>]*\/>/g, '') // self-closing components
      .replace(/<\/?[A-Za-z][A-Za-z0-9]*\b[^<>]*>/g, ''); // open/close tags, keep inner text
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Split a section body into blocks (paragraphs and whole code fences).
function toBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = [];
  let inFence = false;
  const push = () => {
    const b = cur.join('\n').trim();
    if (b) blocks.push(b);
    cur = [];
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) push();
      cur.push(line);
      if (inFence) push();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      cur.push(line);
      continue;
    }
    if (line.trim() === '') push();
    else cur.push(line);
  }
  push();
  return blocks;
}

function packGuideChunks(sections, pageTitle) {
  // sections: [{heading, body}]
  const chunks = []; // {title, text}
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim().length > 0) chunks.push(cur);
    cur = null;
  };
  for (const sec of sections) {
    const crumb = sec.heading ? `${pageTitle} > ${sec.heading}` : pageTitle;
    const blocks = toBlocks(sec.body);
    for (const block of blocks) {
      if (cur && cur.text.length + block.length + 2 > (block.length > GUIDE_TARGET ? GUIDE_HARD_MAX : GUIDE_TARGET) && cur.text.length >= GUIDE_MIN) {
        flush();
      }
      if (!cur) cur = { title: sec.heading ? `${pageTitle} — ${sec.heading}` : pageTitle, text: `${crumb}\n\n` };
      else if (!cur.text.startsWith(crumb) && sec.heading && !cur.text.includes(`\n## ${sec.heading}`)) {
        cur.text += `\n## ${sec.heading}\n`;
      }
      let b = block;
      if (b.length > GUIDE_HARD_MAX * 2) b = b.slice(0, GUIDE_HARD_MAX * 2) + '\n…';
      cur.text += b + '\n\n';
      if (cur.text.length >= GUIDE_TARGET) flush();
    }
  }
  flush();
  // merge a tiny trailing chunk into the previous one
  if (chunks.length >= 2 && chunks[chunks.length - 1].text.length < 300) {
    const last = chunks.pop();
    chunks[chunks.length - 1].text += '\n' + last.text;
  }
  return chunks.map((c) => ({ ...c, text: c.text.replace(/\n{3,}/g, '\n\n').trim() }));
}

function splitByH2(body, pageTitle) {
  const lines = body.split('\n');
  const sections = [];
  let heading = '';
  let cur = [];
  let inFence = false;
  const push = () => {
    const b = cur.join('\n').trim();
    if (b) sections.push({ heading, body: b });
    cur = [];
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      push();
      heading = h[1].replace(/[#*`]/g, '').trim();
      continue;
    }
    cur.push(line);
  }
  push();
  if (sections.length === 0) sections.push({ heading: '', body: '' });
  return sections;
}

function guidePriority(relPath) {
  // priority buckets for the embed budget (lower = embedded first)
  const p = relPath.replace(/\\/g, '/');
  if (p.startsWith('luau/') || p.startsWith('luau-site/')) return 1;
  if (p.startsWith('scripting/')) return 2;
  if (p.startsWith('ui/')) return 3;
  if (p.includes('mechanics')) return 4;
  if (p.startsWith('tutorials/')) return 5;
  return 99; // FTS-only unless budget allows
}

function chunkMarkdownFile({ src, relPath, urlBase, slugPrefix, defaultTitle }) {
  const { meta, body: rawBody } = stripFrontmatter(src);
  const body = stripMdx(cleanRefs(rawBody));
  if (body.trim().length < 400) return []; // not substantive
  const h1 = body.match(/^#\s+(.+?)\s*$/m);
  const pageTitle = (meta.title || h1?.[1] || defaultTitle).toString().trim();
  const noExt = relPath.replace(/\.mdx?$/, '');
  const urlPath = noExt.replace(/\/index$/, '').replace(/\\/g, '/');
  const url = `${urlBase}/${urlPath}`;
  const docSlug = `${slugPrefix}-${slugify(urlPath)}`.slice(0, 96);
  const sections = splitByH2(body.replace(/^#\s+.+$/m, '').trim(), pageTitle);
  const packed = packGuideChunks(sections, pageTitle);
  const idBase = sha8(`${slugPrefix}/${urlPath}`);
  return packed.map((c, i) => ({
    vecId: `g-${idBase}-${i + 1}`,
    docSlug,
    title: c.title.slice(0, 200),
    url,
    kind: 'guide',
    text: c.text,
    embed: false, // decided later by budget
    _priority: guidePriority(slugPrefix === 'luau' ? `luau-site/${urlPath}` : urlPath),
  }));
}

async function buildCreatorGuideChunks() {
  const out = [];
  let files = 0;
  if (!existsSync(CREATOR)) return { chunks: out, files };
  for await (const file of walk(CREATOR)) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(CREATOR, file).replace(/\\/g, '/');
    if (rel.startsWith('reference/') || rel.startsWith('assets/') || rel.startsWith('includes/')) continue;
    const chunks = chunkMarkdownFile({
      src: readFileSync(file, 'utf8'),
      relPath: rel,
      urlBase: 'https://create.roblox.com/docs',
      slugPrefix: 'docs',
      defaultTitle: path.basename(rel, '.md'),
    });
    if (chunks.length > 0) files++;
    out.push(...chunks);
  }
  return { chunks: out, files };
}

async function buildLuauChunks() {
  const out = [];
  let files = 0;
  if (!existsSync(LUAU_SITE)) {
    console.warn('[chunk] luau-site missing — skipping Luau docs.');
    return { chunks: out, files, skipped: 'not fetched' };
  }
  // license gate: fetch.mjs records verification in raw/manifest.json
  try {
    const manifest = JSON.parse(readFileSync(path.join(RAW, 'manifest.json'), 'utf8'));
    const lic = manifest.sources?.['luau-site']?.license;
    if (!lic?.ok) {
      console.warn(`[chunk] luau-site license not verified (${lic?.detail ?? 'unknown'}) — SKIPPING Luau docs.`);
      return { chunks: out, files, skipped: `license ${lic?.detail ?? 'unknown'}` };
    }
  } catch {
    console.warn('[chunk] raw/manifest.json unreadable — SKIPPING Luau docs (license unverified).');
    return { chunks: out, files, skipped: 'manifest missing' };
  }
  for await (const file of walk(LUAU_SITE)) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(LUAU_SITE, file).replace(/\\/g, '/');
    const base = path.basename(rel).toLowerCase();
    if (['readme.md', 'contributing.md', 'code_of_conduct.md', 'security.md'].includes(base)) continue;
    // site sources keep pages under docs/ or _pages/; url path is the filename
    const urlName = path.basename(rel, '.md');
    const chunks = chunkMarkdownFile({
      src: readFileSync(file, 'utf8'),
      relPath: rel,
      urlBase: 'https://luau.org',
      slugPrefix: 'luau',
      defaultTitle: `Luau ${urlName}`,
    }).map((c) => ({ ...c, url: `https://luau.org/${urlName}`, docSlug: `luau-${slugify(urlName)}` }));
    if (chunks.length > 0) files++;
    out.push(...chunks);
  }
  return { chunks: out, files };
}

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(DATA, { recursive: true });

  const api = await buildApiChunks();
  const guides = await buildCreatorGuideChunks();
  const luau = await buildLuauChunks();

  // embed budget: all api first, then guides by priority bucket
  let embedBudget = EMBED_CAP;
  for (const c of api.chunks) {
    c.embed = embedBudget > 0;
    if (c.embed) embedBudget--;
  }
  const guideChunks = [...luau.chunks, ...guides.chunks].sort((a, b) => a._priority - b._priority);
  for (const c of guideChunks) {
    c.embed = c._priority < 99 && embedBudget > 0;
    if (c.embed) embedBudget--;
  }

  const all = [...api.chunks, ...guideChunks];
  // sanity: unique vecIds
  const seen = new Map();
  for (const c of all) {
    if (seen.has(c.vecId)) console.warn(`[chunk] duplicate vecId: ${c.vecId} (${seen.get(c.vecId)} vs ${c.url})`);
    seen.set(c.vecId, c.url);
  }

  const outPath = path.join(DATA, 'chunks.jsonl');
  const jsonl = all
    .map(({ _priority, ...c }) => JSON.stringify(c))
    .join('\n');
  await writeFile(outPath, jsonl + '\n');

  const embedCount = all.filter((c) => c.embed).length;
  const apiCount = api.chunks.length;
  const guideCount = guideChunks.length;
  const bytes = Buffer.byteLength(jsonl);
  console.log('[chunk] --- stats ---');
  console.log(`[chunk] api files: ${JSON.stringify(api.counts)}`);
  console.log(`[chunk] guide files: creator-docs ${guides.files}, luau ${luau.files}${luau.skipped ? ` (luau SKIPPED: ${luau.skipped})` : ''}`);
  console.log(`[chunk] chunks: total ${all.length} (api ${apiCount}, guide ${guideCount})`);
  console.log(`[chunk] embed=true: ${embedCount} / cap ${EMBED_CAP}; FTS-only: ${all.length - embedCount}`);
  console.log(`[chunk] wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('[chunk] fatal:', err);
  process.exit(1);
});
