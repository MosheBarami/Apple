#!/usr/bin/env node
/**
 * TURN THE RENDERED SVGs INTO PNGs THE OWNER CAN OPEN.
 *
 * The owner is not going to open an SVG in a text editor, and a chat window shows him a PNG. This
 * is the only step in the showcase pipeline that adds nothing to the evidence — it is a format
 * change, run by headless Chromium, over an SVG whose every rectangle came from the model's own
 * instance tree. It draws nothing of its own.
 *
 * It is a separate file from generate-ui-showcase.mjs on purpose: generation talks to a paid
 * provider and rasterising does not, so rasterising can be re-run freely while regenerating costs
 * a completion.
 *
 *   node packages/training/src/rasterise-showcase.mjs [--dir docs/evidence/ui-showcase]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};

async function main() {
  const dir = resolve(arg('dir', join(REPO, 'docs/evidence/ui-showcase')));
  const svgs = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  if (!svgs.length) {
    console.error(`no .svg files in ${dir}`);
    process.exit(2);
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  let done = 0;
  try {
    for (const name of svgs) {
      const svg = readFileSync(join(dir, name), 'utf8');
      const m = svg.match(/width="(\d+)"\s+height="(\d+)"/);
      const w = m ? Number(m[1]) : 1600;
      const h = m ? Number(m[2]) : 900;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      // The SVG is inlined rather than loaded from a file: file:// SVG in a page would be a
      // separate document with its own base URL, and there is nothing to fetch anyway.
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#101014}svg{display:block}</style>${svg}`,
        { waitUntil: 'load' },
      );
      const png = await page.screenshot({ type: 'png' });
      writeFileSync(join(dir, name.replace(/\.svg$/, '.png')), png);
      await page.close();
      done += 1;
      console.log(`  ${name} -> ${name.replace(/\.svg$/, '.png')} (${w}x${h} @2x)`);
    }
  } finally {
    await browser.close();
  }
  console.log(`${done} PNG${done === 1 ? '' : 's'} in ${dir}`);
}

await main();
