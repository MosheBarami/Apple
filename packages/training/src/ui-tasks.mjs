#!/usr/bin/env node
/**
 * SIX ROBLOX UI BUILDS, EACH ASKING FOR SOMETHING A RECTANGLE CAN DISAGREE WITH.
 *
 * THE RULE THIS FILE KEEPS: an eval may only check what its prompt asked for. Scoring a model
 * down for not setting ScreenInsets when the prompt never mentioned the topbar measures the
 * prompt, not the model — and the engine's default is already correct, so a model that says
 * nothing is right. Every check below therefore has a sentence in its prompt that it grades, and
 * the prompt says the REQUIREMENT ("must remain tappable on a phone with a notch"), never the
 * ANSWER ("set ScreenInsets to CoreUISafeInsets"). A prompt that names the property is a lookup
 * test; a prompt that names the requirement is a knowledge test, which is the thing being measured.
 *
 * WHY THESE SIX. Each one isolates a failure that a `contains`/`regex` suite cannot see:
 *
 *   centered-aspect-panel   AnchorPoint arithmetic, and whether the aspect lock is PARENTED
 *   bottom-action-bar       the anchor-at-an-edge failure — wrong anchor renders it off-screen
 *   menu-list-stack         layout containment: do the buttons actually fit inside the panel
 *   shop-grid               a grid of square tiles that stay square when the screen changes
 *   hud-currency-pill       safe area on a phone, for something the player taps
 *   fullscreen-backdrop     the inverse safe-area case, where None is the correct answer
 *
 * The system prompt is shared and deliberately plain. It asks for one fenced block and for code
 * that runs on its own, which is what `run_luau` — the production tool that carries model-written
 * Luau into a place — actually requires. It does NOT coach the model about AnchorPoint, aspect
 * ratios or insets, because coaching would measure the prompt.
 */

import { visibleExtent } from './score-ui.mjs';

export const UI_SYSTEM_PROMPT =
  'You are an expert Roblox UI engineer. Reply with ONE fenced luau code block and nothing else — no '
  + 'explanation before or after it. Write a single self-contained LocalScript that builds the '
  + 'interface by creating instances in code. It must run on its own: no require(), no ModuleScript, '
  + 'no assets, no images. Assume nothing already exists in PlayerGui.';

export const UI_TASKS = [
  {
    id: 'centered-aspect-panel',
    family: 'responsive-panel',
    what: 'a panel that stays centred and keeps its shape on every screen',
    prompt:
      'Build a settings panel. It must sit exactly in the middle of the screen, take up about half '
      + 'the screen width, and keep a 16:9 shape on every device — the same proportions on a phone '
      + 'as on a desktop monitor, never stretched. Give it rounded corners. Put a title label reading '
      + '"Settings" at the top of the panel.',
    checks: (c, s) => [
      c.screenGui(),
      c.has('Frame'),
      c.has('UICorner'),
      c.parentedUnder('UIAspectRatioConstraint', 'Frame'),
      c.centered(s.topFrame),
      c.aspectStable(s.topFrame),
      c.scalesWithScreen(s.topFrame),
      c.onScreen(s.topFrame, 'the panel'),
      c.noDeprecated(),
    ],
  },

  {
    id: 'bottom-action-bar',
    family: 'edge-anchored',
    what: 'a bar pinned to the bottom edge — the classic AnchorPoint failure',
    prompt:
      'Build an action bar that sits along the BOTTOM edge of the screen, horizontally centred, '
      + 'spanning 60% of the screen width and about 12% of its height. Its bottom edge should touch '
      + 'the bottom of the container with no gap. It holds three TextButtons side by side, labelled '
      + 'Attack, Block and Heal, evenly spaced across the bar. The whole bar must be fully visible on '
      + 'a phone and on a desktop monitor.',
    checks: (c, s) => [
      c.screenGui(),
      c.has('TextButton', 3),
      c.onScreen(s.topFrame, 'the action bar'),
      c.childrenContained(),
      c.scalesWithScreen(s.topFrame),
      {
        id: 'sits_on_bottom_edge',
        run: (ctx) => {
          const bar = s.topFrame(ctx);
          if (!bar) return { ok: false, detail: 'the bar was not built' };
          const bad = [];
          for (const v of ctx.viewports) {
            const r = ctx.frames[v.id].rects.get(bar.id);
            if (!r) return { ok: false, skipped: true, detail: `no rect at ${v.id}` };
            const gap = v.h - (r.y + r.h);
            if (Math.abs(gap) > 0.02 * v.h) {
              bad.push(`${v.id}: bottom edge is ${Math.round(gap)}px from the bottom (${gap < 0 ? 'hanging off the screen' : 'floating above it'})`);
            }
          }
          return bad.length ? { ok: false, detail: bad.join('; ') } : { ok: true, detail: '' };
        },
      },
      c.noDeprecated(),
    ],
  },

  {
    id: 'menu-list-stack',
    family: 'auto-layout',
    what: 'four buttons stacked by a UIListLayout that must fit inside their panel',
    prompt:
      'Build a main menu. A panel occupies the middle of the screen, 40% of the screen width and 60% '
      + 'of its height. Inside it, stack four TextButtons vertically — Play, Shop, Settings, Quit — '
      + 'in that order, using automatic layout rather than positioning each one by hand, with an even '
      + 'gap between them and a margin between the buttons and the panel edge. Every button must stay '
      + 'inside the panel on every screen size.',
    checks: (c, s) => [
      c.screenGui(),
      c.has('TextButton', 4),
      c.parentedUnder('UIListLayout', 'Frame'),
      c.stacked(s.listContainer, 'TextButton', 4),
      c.childrenContained(),
      c.centered(s.topFrame),
      c.onScreen(s.topFrame, 'the menu panel'),
      c.noDeprecated(),
    ],
  },

  {
    id: 'shop-grid',
    family: 'grid',
    what: 'six shop tiles that must stay SQUARE when the screen shape changes',
    prompt:
      'Build a shop window: a panel centred on screen holding a scrolling area with six item tiles '
      + 'laid out in a grid. Each tile must be exactly square — the same width as height — on a tall '
      + 'phone screen and on a wide monitor alike. Each tile shows an item name and a price label. '
      + 'The grid must scroll if the tiles do not fit.',
    checks: (c, s) => [
      c.screenGui(),
      c.has('ScrollingFrame'),
      c.has('UIGridLayout'),
      c.centered(s.topFrame),
      c.onScreen(s.topFrame, 'the shop panel'),
      {
        id: 'tiles_are_square',
        run: (ctx) => {
          const grid = s.gridContainer(ctx);
          if (!grid) return { ok: false, detail: 'nothing owns a UIGridLayout' };
          const tiles = grid.children.filter((k) => ['Frame', 'ImageButton', 'ImageLabel', 'TextButton'].includes(k.class));
          if (tiles.length < 6) return { ok: false, detail: `${tiles.length} tiles under the grid, needed 6` };
          const bad = [];
          for (const v of ctx.viewports) {
            for (const t of tiles.slice(0, 6)) {
              const r = ctx.frames[v.id].rects.get(t.id);
              if (!r || r.h <= 0) { bad.push(`${v.id}: a tile has no measurable size`); continue; }
              const ratio = r.w / r.h;
              if (Math.abs(ratio - 1) > 0.05) bad.push(`${v.id}: a tile is ${ratio.toFixed(2)}:1, not square`);
            }
          }
          return bad.length ? { ok: false, detail: [...new Set(bad)].slice(0, 3).join('; ') } : { ok: true, detail: '6 tiles square at every viewport' };
        },
      },
      c.noDeprecated(),
    ],
  },

  {
    id: 'hud-currency-pill',
    family: 'safe-area',
    what: 'a tappable HUD element in the top-right, which is where the topbar and the notch are',
    prompt:
      'Build a coin counter for the HUD. It sits in the TOP-RIGHT corner of the screen, shows a coin '
      + 'count, and is clickable — tapping it should open the shop, so wire up the click handler (it '
      + 'can just print for now). It must remain fully visible and tappable on a phone that has a '
      + 'camera notch and the Roblox topbar buttons along the top of the screen. It must not be '
      + 'covered by either of them.',
    checks: (c, s) => [
      c.screenGui(),
      c.interactiveSafeArea(),
      c.onScreen(s.topFrame, 'the coin counter'),
      {
        id: 'in_top_right',
        run: (ctx) => {
          const pill = s.topFrame(ctx);
          if (!pill) return { ok: false, detail: 'the counter was not built' };
          const bad = [];
          for (const v of ctx.viewports) {
            // The rendered extent, not the node's own box: a zero-size positioning anchor holding a
            // sized button is ordinary Roblox, and its own rect is a point.
            const r = visibleExtent(ctx, v.id, pill);
            if (!r) return { ok: false, detail: `the counter renders nothing at ${v.id}` };
            const cx = (r.x + r.w / 2) / v.w;
            const cy = (r.y + r.h / 2) / v.h;
            if (cx < 0.5 || cy > 0.5) bad.push(`${v.id}: centre at ${Math.round(cx * 100)}%,${Math.round(cy * 100)}% — not the top-right quadrant`);
          }
          return bad.length ? { ok: false, detail: bad.join('; ') } : { ok: true, detail: '' };
        },
      },
      {
        id: 'click_handler',
        run: ({ source }) => (/(Activated|MouseButton1Click|MouseButton1Down|InputBegan)\s*[:.]?\s*Connect/.test(source)
          ? { ok: true, detail: '' }
          : { ok: false, detail: 'nothing is connected to a click or tap signal' }),
      },
      c.noDeprecated(),
    ],
  },

  {
    id: 'fullscreen-backdrop',
    family: 'safe-area',
    what: 'the inverse case — a decorative layer that SHOULD bleed past the safe area',
    prompt:
      'Build a decorative full-bleed background layer for a loading screen: one dark frame that '
      + 'covers the entire screen edge to edge with no gaps, including the strip behind the Roblox '
      + 'topbar buttons and behind a phone camera notch. Nothing in it is clickable. Put a centred '
      + '"Loading..." label on top of it.',
    checks: (c, s) => [
      c.screenGui(),
      c.fullBleed(s.topFrame),
      c.has('TextLabel'),
      c.centered(s.named('load'), 0.05),
      c.noDeprecated(),
    ],
  },
];

/** Bind the check builders in, so the task list above stays declarative. */
export function buildTasks(check, select) {
  return UI_TASKS.map((t) => ({ ...t, checks: t.checks(check, select) }));
}
