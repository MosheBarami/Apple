#!/usr/bin/env node
/**
 * The remote twin of generate_eval.py: same held-out rows, same output shape, so score-eval.mjs
 * scores it unchanged — but the answers come from the SERVED models through the live worker's
 * /api/admin/model-test, not from MLX on this machine.
 *
 * Why it exists: an adapter is only worth anything as Workers AI serves it, and bases that do not
 * fit on this Mac (qwen2.5-coder-32b) can only be measured here. Each side is a gateway key plus an
 * optional LoRA name, so "base vs apple-v5" and "llama-3b vs coder-32b" are the same command.
 *
 * Every request is metered by the worker's own spend caps; this script adds a hard request ceiling
 * so a wrong --data path cannot turn into hundreds of calls. Temperature is the gateway's, which is
 * low but not zero — report differences that survive a rerun, not single-row flips.
 *
 * Usage:
 *   GOLEM_ADMIN_KEY=... node src/generate-eval-remote.mjs --data mlxdata-apple-v5/test.jsonl \
 *     --base lab-llama-3b --adapter lab-llama-3b:apple-v5 --out runs/remote-v5.json [--kind game-logic]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = 'https://apple.moshe-barami111.workers.dev';
export const MAX_REQUESTS = 120;

/** "key" or "key:lora" → { model, lora? } */
export function parseSide(spec) {
  const [model, lora] = String(spec ?? '').split(':');
  if (!/^[a-z0-9-]+$/.test(model ?? '')) throw new Error(`bad side spec: ${spec}`);
  return lora ? { model, lora } : { model };
}

export function heldOutRows(text, kind) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const meta = row.meta ?? {};
    const msgs = row.messages ?? [];
    if (msgs.at(-1)?.role !== 'assistant') continue;
    if (kind && meta.kind !== kind) continue;
    const system = msgs.find((m) => m.role === 'system')?.content;
    const user = msgs.filter((m) => m.role === 'user').at(-1)?.content;
    if (!user) continue;
    rows.push({ id: meta.id ?? `row${rows.length}`, family: meta.family, kind: meta.kind ?? 'game-logic', system, user, reference: msgs.at(-1) });
  }
  return rows;
}

async function ask(side, row, key, maxTokens) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/api/admin/model-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
      body: JSON.stringify({ ...side, system: row.system, prompt: row.user, maxTokens, tools: false, rag: false }),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e?.name ?? e) }) }));
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return { text: String(body.text ?? ''), usage: body.usage ?? null, model: body.model };
    // Retry transport faults and 5xx only; a 4xx is a wrong request and repeating it is noise.
    if (res.status && res.status < 500) return { text: '', error: `http_${res.status}` };
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return { text: '', error: 'unavailable' };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  const key = process.env.GOLEM_ADMIN_KEY;
  if (!key) throw new Error('GOLEM_ADMIN_KEY is required');
  if (!args.data || !args.out || !args.base || !args.adapter) throw new Error('usage: --data F --base KEY[:LORA] --adapter KEY[:LORA] --out F [--kind K] [--max-tokens N]');
  const rows = heldOutRows(readFileSync(args.data, 'utf8'), args.kind);
  if (!rows.length) throw new Error('no held-out rows; nothing evaluated');
  if (rows.length * 2 > MAX_REQUESTS) throw new Error(`${rows.length * 2} requests exceeds the ${MAX_REQUESTS} ceiling`);
  const sides = { base: parseSide(args.base), adapter: parseSide(args.adapter) };
  const maxTokens = Number(args['max-tokens'] ?? 900);
  const results = Object.fromEntries(rows.map((r) => [r.id, { family: r.family, kind: r.kind, reference: r.reference }]));
  const usage = { base: { in: 0, out: 0, errors: 0 }, adapter: { in: 0, out: 0, errors: 0 } };
  for (const label of ['base', 'adapter']) {
    // Four at a time: fast enough, and well under the worker's per-admin rate limit.
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(rows.slice(i, i + 4).map(async (row) => {
        const got = await ask(sides[label], row, key, maxTokens);
        results[row.id][label] = got.text;
        if (got.error) { results[row.id][`${label}Error`] = got.error; usage[label].errors++; }
        usage[label].in += got.usage?.inputTokens ?? 0;
        usage[label].out += got.usage?.outputTokens ?? 0;
      }));
      console.error(`  ${label} ${Math.min(i + 4, rows.length)}/${rows.length}`);
    }
  }
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify({ served: true, sides, usage, rows: results }, null, 1));
  console.error(`wrote ${args.out}  usage ${JSON.stringify(usage)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
