// Write a ledger of OpenGameArt submissions from one advanced-search URL (master plan §4.4 step 1), for art types the
// research ledger counted but did not list one by one (audio-other.jsonl: 1,485 sound submissions). Walks the search
// pages, then reads each submission page once, at most one request a second, and keeps what the page states: title,
// author, post date, licences (the most permissive allowed one first), tags, the direct file links, whether it is in
// OGA's AI-assisted collection, and any attribution notice. Rows have the opengameart-3d.jsonl shape plus `files`, so
// fetch-oga.mjs downloads them without reading the page again. Resumable: URLs already in the ledger are skipped.
//
//   node packages/library/tools/list-oga.mjs <search-url> <source> <category> <ledger.jsonl>
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { classifyLicence } from '../src/licence.mjs';

const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; library ingestion of CC0/CC-BY packs)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const field = (html, name) => (html.match(new RegExp(`field-name-${name}[^>]*>([\\s\\S]*?)</div></div></div>`)) ?? [])[1] ?? '';
const LICENCE_ORDER = ['CC0', 'CC-BY 4.0', 'CC-BY 3.0'];
const LICENCE_URL = { 'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC-BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'CC-BY 3.0': 'https://creativecommons.org/licenses/by/3.0/' };

/** What a submission page states, as a ledger row (or undefined when it has no title). Pure. */
export function rowOf(html, url, source, category, checkedAt) {
  const title = text((html.match(/<title>([^<|]*)/) ?? [])[1] ?? '');
  if (!title) return undefined;
  const author = text((html.match(/field-name-author-submitter[\s\S]*?class='username'>([\s\S]*?)<\/span>/) ?? [])[1] ?? '') || 'unknown';
  const date = text((html.match(/field-name-post-date[\s\S]*?field-item even">([^<]*)</) ?? [])[1] ?? '').match(/(\w+ \d{1,2}, \d{4})/)?.[1];
  const posted = date ? new Date(`${date} UTC`).toISOString().slice(0, 10) : undefined;
  const lics = [...(html.match(/field-name-field-art-licenses[\s\S]*?field-name-collect/) ?? [''])[0].matchAll(/license-name'>([^<]+)</g)].map((x) => x[1].trim());
  const allowed = LICENCE_ORDER.filter((l) => lics.includes(l) && classifyLicence(l).ok);
  const notice = text(field(html, 'field-copyright-notice')).replace(/^Copyright\/Attribution Notice:\s*/, '');
  const tags = [...field(html, 'field-art-tags').matchAll(/>([^<>]+)<\/a>/g)].map((x) => x[1].trim());
  const collections = text((html.match(/Collections:([\s\S]*?)<\/div><\/div><\/div>/) ?? [])[1] ?? '');
  const files = [...new Set([...field(html, 'field-art-files').matchAll(/https?:\/\/opengameart\.org\/sites\/default\/files\/[^"'<>\s]+/g)].map((x) => x[0]))];
  const formats = [...new Set(files.map((f) => decodeURIComponent(f).split('.').pop().toLowerCase()))];
  const ai = /Artificial Intelligence Assisted/i.test(collections);
  return {
    source, pack: title, url, categories: [category], item_count: files.length, count_basis: 'files on the page',
    licence_words: `License(s): ${[...allowed, ...lics.filter((l) => !allowed.includes(l))].join(' | ')}${notice ? ` | Copyright/Attribution Notice: ${notice}` : ''}`,
    licence_url: LICENCE_URL[allowed[0]] ?? '', formats, tags,
    human_made_evidence: `Posted ${posted ?? 'unknown'} by ${author}; ${ai ? "IN OGA's 'Artificial Intelligence Assisted Artwork' collection" : "not in OGA's 'Artificial Intelligence Assisted Artwork' collection"}`,
    ai_assisted: ai, files, checked_at: checkedAt,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [search, source, category, ledger] = process.argv.slice(2);
  if (!search || !source || !category || !ledger) { console.error('usage: list-oga.mjs <search-url> <source> <category> <ledger.jsonl>'); process.exit(2); }
  const have = new Set(existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url) : []);
  const urls = [];
  for (let p = 0; ; p += 1) {
    const html = await (await fetch(`${search}&items_per_page=144&page=${p}`, { headers: UA })).text();
    const found = [...new Set([...html.matchAll(/href="(\/content\/[^"#?]+)"/g)].map((x) => `https://opengameart.org${x[1]}`))].filter((u) => !urls.includes(u));
    await wait(1000);
    if (!found.length) break;
    urls.push(...found);
  }
  console.log(`${urls.length} submissions listed, ${have.size} already in the ledger`);
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const url of urls.filter((u) => !have.has(u))) {
    try {
      const row = rowOf(await (await fetch(url, { headers: UA })).text(), url, source, Number(category), today);
      if (row) { appendFileSync(ledger, JSON.stringify(row) + '\n'); n += 1; }
    } catch (e) { console.log(`${url}: ${e.message}`); }
    if (n % 100 === 0 && n) console.log(`${n} read`);
    await wait(1000);
  }
  console.log(`${n} rows added -> ${ledger}`);
}
