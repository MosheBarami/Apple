#!/usr/bin/env node
/**
 * REDRAW THE SHOWCASE FROM THE LUAU ALREADY ON DISK, WITHOUT SPENDING A COMPLETION.
 *
 * The generators do two things: ask the model, and draw the answer. Every fix to the DRAWING half —
 * inherited visibility, surface canvases, wrapped-text clipping — used to mean re-asking the model,
 * which costs money and, worse, changes the artwork, so a renderer fix and a different answer arrive
 * in the same picture and neither can be attributed.
 *
 * This replays the saved `.luau` through the same harness, resolver and renderer, and rewrites the
 * SVGs in place. Same source, new drawing — which is what makes "this changed because the renderer
 * was wrong" a checkable claim instead of an assertion.
 *
 * It updates the render counters in the manifest and touches nothing else in it: the model, the
 * timings and the outcome belong to the run that produced them.
 *
 *   node packages/training/src/rerender-showcase.mjs --dir docs/evidence/ui-showcase
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiTree, indexTree, resolveLayout, guiDescendants, screenGuisInPlayerGui, descendants, unreadableTextNodes } from './score-ui.mjs';
import { renderTreeToSvg, surfaceCanvas } from './render-ui-tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};

function redraw(dir, r) {
  if (r.outcome !== 'built' || !r.files?.luau) return { skipped: 'not a built row' };
  const luauPath = join(dir, r.files.luau);
  if (!existsSync(luauPath)) return { skipped: 'luau missing' };

  const built = buildUiTree(readFileSync(luauPath, 'utf8'));
  if (built.status !== 'ok') return { skipped: `replay ${built.status}: ${String(built.detail).slice(0, 80)}` };

  const tree = indexTree(built.nodes);
  const guis = screenGuisInPlayerGui(tree);
  let root = guis[0] ?? null;
  let viewport = r.viewport ?? { w: 1600, h: 900 };
  if (!root) {
    const world = tree.roots
      .flatMap((n) => descendants(n, [n]))
      .filter((n) => (n.class === 'SurfaceGui' || n.class === 'BillboardGui') && guiDescendants(n).length > 0);
    const hit = world.find((n) => surfaceCanvas(n, n.parentNode));
    if (!hit) return { skipped: 'nothing to draw on replay' };
    const canvas = surfaceCanvas(hit, hit.parentNode);
    root = hit;
    viewport = { id: 'surface', w: Math.min(3000, canvas.w), h: Math.min(3000, canvas.h) };
  }

  const { rects } = resolveLayout(root, viewport);
  const guiNodes = guiDescendants(root);
  const asScripted = renderTreeToSvg({ guiNodes, rects, viewport });
  writeFileSync(join(dir, r.files.svg), asScripted.svg);

  let opened = null;
  if (r.files.openedSvg) {
    opened = renderTreeToSvg({ guiNodes, rects, viewport, forceVisible: true });
    writeFileSync(join(dir, r.files.openedSvg), opened.svg);
  }
  return {
    asScripted: { painted: asScripted.painted, textNodes: asScripted.textNodes, hidden: asScripted.hidden, offscreen: asScripted.offscreen },
    opened: opened ? { painted: opened.painted, textNodes: opened.textNodes, forcedVisible: opened.forcedVisible, offscreen: opened.offscreen } : null,
    scaledText: (opened ?? asScripted).scaledText,
    // A RENDER COUNTER LIKE THE REST, which is why it belongs in this file's contract: it is read
    // off the rectangles the resolver produced, not off the model's answer. Text the model wrote
    // into a box with no area is invisible in the engine too — see unreadableTextNodes, and the
    // racing HUD whose own label helper never set Size, leaving eleven zero-area labels under the
    // stat "written labels 0".
    unreadableText: unreadableTextNodes(guiNodes, rects).length,
    wrappedText: (opened ?? asScripted).wrappedText,
    imagePlaceholders: (opened ?? asScripted).imagePlaceholders,
    // Rich text markup the renderer interpreted rather than drew, and the line breaks inside it
    // that this renderer flattens to a space. Recorded so a caption can say which labels were
    // read as markup, and how many second lines are not laid out.
    richTextNodes: (opened ?? asScripted).richTextNodes,
    richTextBreaks: (opened ?? asScripted).richTextBreaks,
  };
}

function main() {
  const dir = resolve(arg('dir', join(REPO, 'docs/evidence/ui-showcase')));
  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let redrawn = 0;
  for (const r of manifest.results) {
    const out = redraw(dir, r);
    if (out.skipped) {
      console.log(`  ${r.target ?? r.genre} — ${out.skipped}`);
      continue;
    }
    Object.assign(r, out);
    redrawn += 1;
    console.log(`  ${r.target ?? r.genre} — redrawn (${out.wrappedText ?? 0} wrapped labels clipped)`);
  }
  manifest.renderedAt = new Date().toISOString();
  manifest.renderNote = 'SVGs redrawn from the saved Luau by rerender-showcase.mjs; no completion was spent and no answer changed.';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${redrawn} redrawn in ${dir}`);
}

main();
