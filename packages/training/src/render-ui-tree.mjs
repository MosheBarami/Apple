#!/usr/bin/env node
/**
 * PAINT THE INSTANCE TREE THE MODEL ACTUALLY BUILT.
 *
 * WHAT THIS IS, EXACTLY, because the owner asked to SEE what the model makes and a picture is the
 * easiest thing in this repository to fake. Every rectangle here comes from `resolveLayout` in
 * score-ui.mjs, run over the instance tree that `ui-harness.luau` produced by EXECUTING the model's
 * own Luau. Every colour, every string, every corner radius is read off a property the model set.
 * Nothing is invented to make the picture look finished.
 *
 * WHAT IT IS NOT, and the caption on every output says so: this is not a Roblox Studio screenshot.
 * Studio would apply a font metric, text wrapping, safe-area insets and image decoding that this
 * repository deliberately does not model (see the "DELIBERATELY NOT MODELLED" note in score-ui.mjs).
 * So this is a faithful plan view of the geometry, not a photograph of the running game.
 *
 * THE ONE PLACE A RENDERER IS TEMPTED TO LIE is `Image`. An ImageLabel points at an asset id this
 * process has never fetched and must never fetch on the owner's behalf. Painting a plausible
 * picture there would turn "the model referenced an asset" into "the model produced this artwork",
 * which is the observation failure this repository is built to refuse. Image nodes are therefore
 * drawn as a marked placeholder that prints the asset id, and `imagePlaceholders` counts them so a
 * caller can say out loud how much of the screen is a reference rather than a drawing.
 */

/** Roblox's default UI font is a humanist sans; these are the stacks the SVG asks for. */
const FONT_STACK = "'Gotham SSm','Montserrat','Helvetica Neue',Arial,sans-serif";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A Color3 prop as CSS, or null when the property was never set. */
export function cssColor(node, name) {
  const v = node.props?.[name];
  if (!v || v.k !== 'Color3') return null;
  const to255 = (c) => Math.max(0, Math.min(255, Math.round((Number(c) || 0) * 255)));
  return `rgb(${to255(v.r)},${to255(v.g)},${to255(v.b)})`;
}

const numProp = (node, name, fallback) => {
  const v = node.props?.[name];
  return v && v.k === 'num' && Number.isFinite(v.v) ? v.v : fallback;
};
const strProp = (node, name, fallback = '') => {
  const v = node.props?.[name];
  return v && v.k === 'str' ? v.v : fallback;
};
const boolProp = (node, name, fallback = false) => {
  const v = node.props?.[name];
  return v && v.k === 'bool' ? v.v : fallback;
};
const enumProp = (node, name) => {
  const v = node.props?.[name];
  return v && v.k === 'Enum' ? v.n : null;
};

const childClass = (node, cls) => node.children?.find((c) => c.class === cls) ?? null;

/** UICorner's radius in pixels. Scale radii resolve against the node's smaller side, as Roblox does. */
function cornerRadius(node, rect) {
  const c = childClass(node, 'UICorner');
  if (!c) return 0;
  const v = c.props?.CornerRadius;
  if (!v) return 8; // the harness's own default for an unset UICorner
  if (v.k === 'UDim') return Math.max(0, v.s * Math.min(rect.w, rect.h) + v.o);
  return 8;
}

/**
 * TEXT SIZE, AND WHY IT IS A RANGE RATHER THAN A NUMBER.
 *
 * `TextScaled` tells the engine to grow the text until it fills the box, using a font metric this
 * process does not have. Guessing that metric precisely would be inventing; refusing to draw the
 * text at all would hide what the model wrote. So a scaled label is drawn at a size derived from
 * the box height and clamped, and `scaledText` counts it, so a caller can say which strings are
 * approximated. An explicit TextSize is used verbatim — there is nothing to approximate.
 */
function textSize(node, rect) {
  if (boolProp(node, 'TextScaled', false)) {
    return { size: Math.max(8, Math.min(rect.h * 0.62, rect.h - 4)), approximated: true };
  }
  return { size: numProp(node, 'TextSize', 14), approximated: false };
}

const TEXT_CLASSES = new Set(['TextLabel', 'TextButton', 'TextBox']);

// ---------------------------------------------------------------------------------------------
// RICH TEXT
//
// THE DEFECT THIS EXISTS FOR, measured 2026-09-21 on the generated tycoon social screen. The model
// wrote a chat log the way shipped Roblox games write one:
//
//     t.RichText = true
//     t.Text = '<font color="#78C8FF">[CARTL]</font> <b>ConveyorKing:</b> upgraded my second dropper'
//
// That is correct, idiomatic engine code. This renderer knew nothing about RichText, drew the
// string it found, and produced a chat window full of visible `<font color="#78C8FF">` and `</b>`.
// A reader looking at that picture concludes the model emits broken markup into its labels. It
// does not — in Roblox those four lines render as a blue clan tag and a bold username. The picture
// was the thing that was wrong, and it was the ELEVENTH time in this pipeline that a gap in the
// harness was recorded as a failure of the model.
//
// The tag list below is read off Roblox/creator-docs `content/en-us/ui/rich-text.md`, not
// remembered. Three groups:
//
//   STYLED   b, i, u, s, font(color|size|transparency), uppercase/uc  — change the drawing
//   STRIPPED stroke, mark, smallcaps/sc, font(face|family|weight)     — the tag goes, the words stay
//   DROPPED  <!-- comments -->                                        — the engine removes them
//
// A STRIPPED tag is not modelled and must not be pretended: small caps are drawn as ordinary
// letters and a stroke is not drawn at all. What matters is that the WORDS are right and the
// markup is not visible, because that is the difference between "the model wrote a chat line" and
// "the model wrote garbage".
//
// MALFORMED MARKUP IS RETURNED UNPARSED, ON PURPOSE. The reference requires both tags and reverse
// -order nesting; Studio shows the raw source when that is violated, which is a real and visible
// defect in a model's output. Inventing a repair here would hide it. `parseRichText` returns null
// and the caller draws the raw string, exactly as it did before.
// ---------------------------------------------------------------------------------------------

/** The five documented escape forms, applied to text runs only — never to tag attributes. */
const unescapeEntities = (s) =>
  String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    // LAST, and it has to be: `&amp;lt;` must end as the literal text `&lt;`, so unescaping the
    // ampersand before the others would turn it into a `<` the reader never wrote.
    .replace(/&amp;/g, '&');

/** `#FF7800` or `rgb(255,125,0)` — the two spellings the reference gives for a colour attribute. */
function richColor(value) {
  const v = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (!m) return null;
  const c = m.slice(1, 4).map((n) => Math.max(0, Math.min(255, Number(n))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const STYLED_TAGS = new Set(['b', 'i', 'u', 's', 'font', 'uppercase', 'uc']);
const STRIPPED_TAGS = new Set(['stroke', 'mark', 'smallcaps', 'sc']);

/**
 * Rich text markup as a flat list of styled runs, or null when the markup does not parse.
 *
 * @returns {{runs:{text:string,bold:boolean,italic:boolean,underline:boolean,strike:boolean,
 *            color:string|null,size:number|null,transparency:number|null}[], breaks:number}|null}
 */
export function parseRichText(source) {
  const src = String(source ?? '');
  if (!/[<&]/.test(src)) return null; // nothing to interpret; the caller's plain path is correct
  const runs = [];
  const stack = [];
  let breaks = 0;
  let i = 0;
  let plain = '';

  const style = () => {
    const s = { bold: false, italic: false, underline: false, strike: false, color: null, size: null, transparency: null };
    for (const f of stack) {
      if (f.tag === 'b') s.bold = true;
      else if (f.tag === 'i') s.italic = true;
      else if (f.tag === 'u') s.underline = true;
      else if (f.tag === 's') s.strike = true;
      else if (f.tag === 'font') {
        if (f.color) s.color = f.color;
        if (f.size != null) s.size = f.size;
        if (f.transparency != null) s.transparency = f.transparency;
      }
    }
    return s;
  };
  const upper = () => stack.some((f) => f.tag === 'uppercase' || f.tag === 'uc');
  const flush = () => {
    if (!plain) return;
    const text = unescapeEntities(plain);
    runs.push({ text: upper() ? text.toUpperCase() : text, ...style() });
    plain = '';
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { plain += src.slice(i); break; }
    plain += src.slice(i, lt);

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) return null; // an unterminated comment is malformed markup
      i = end + 3;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt === -1) return null; // `<` with no `>`: the engine treats the whole string as literal
    const inner = src.slice(lt + 1, gt).trim();
    const closing = inner.startsWith('/');
    const body = closing ? inner.slice(1).trim() : inner.replace(/\/$/, '').trim();
    const name = (body.split(/[\s=]/, 1)[0] ?? '').toLowerCase();

    if (name === 'br') { flush(); breaks += 1; plain = ' '; i = gt + 1; continue; }
    if (!STYLED_TAGS.has(name) && !STRIPPED_TAGS.has(name)) return null; // not a tag: literal text

    flush();
    if (closing) {
      if (stack.pop()?.tag !== name) return null; // closed out of order — malformed
    } else if (!inner.endsWith('/')) {
      const frame = { tag: name };
      if (name === 'font') {
        const attrs = [...body.matchAll(/([a-zA-Z]+)\s*=\s*"([^"]*)"/g)];
        for (const [, k, v] of attrs) {
          const key = k.toLowerCase();
          if (key === 'color') frame.color = richColor(v);
          else if (key === 'size') frame.size = Number(v) || null;
          else if (key === 'transparency') frame.transparency = Number(v);
        }
      }
      stack.push(frame);
    }
    i = gt + 1;
  }
  flush();
  if (stack.length) return null; // a tag left open — malformed
  return runs.length ? { runs, breaks } : null;
}
const IMAGE_CLASSES = new Set(['ImageLabel', 'ImageButton']);

/**
 * VISIBILITY IS INHERITED, AND GETTING THIS WRONG INVENTS A SCREEN.
 *
 * THE DEFECT THIS ANSWERS, measured on the first real run (tycoon shop, 2026-09-20). The model
 * wrote a correct closed-state shop: `Backdrop.Visible = false`, and the sheet and the confirm
 * dialog inside it were false too, opened later by a click handler. This renderer checked `Visible`
 * on each node in a FLAT list, so the backdrop was skipped and its descendants — which never set
 * `Visible` at all, and therefore default to true — were drawn anyway. The picture showed a shop
 * standing open with its confirm dialog on top of the product grid, and it showed them overlapping,
 * which looked exactly like a layout bug the model had not made.
 *
 * That is this repository's named failure in its worst direction: a failure to observe rendering as
 * an observation, and the observation blaming the model for the renderer's mistake. In Roblox a
 * GuiObject is drawn only when it and EVERY GuiObject ancestor up to the ScreenGui is visible, and
 * only when the ScreenGui itself is Enabled.
 *
 * `forceVisible` exists because the honest closed-state picture of a modal screen is a single
 * button, which tells the owner nothing about the shop the model built. It ignores `Visible`
 * entirely and the caller MUST label the result as a forced open state — the count comes back as
 * `forcedVisible` so a caption cannot claim the script opened it by itself.
 */
function isVisible(node, { forceVisible }) {
  if (forceVisible) return true;
  let cur = node;
  while (cur) {
    if (cur.class === 'ScreenGui') return boolProp(cur, 'Enabled', true);
    if (!boolProp(cur, 'Visible', true)) return false;
    cur = cur.parentNode;
  }
  return true;
}

/**
 * THE CANVAS OF A UI THAT LIVES IN THE WORLD, NOT ON THE SCREEN.
 *
 * MEASURED, 2026-09-20. Asked for a tycoon leaderboard, the model built the RIGHT thing: a physical
 * board beside spawn — a Part in workspace carrying a SurfaceGui. The showcase looked only for a
 * ScreenGui under PlayerGui, found none, and recorded `no_screengui_in_playergui`. The sentence was
 * true and the verdict was false: a correct world leaderboard was filed as a failed screen. In a
 * tycoon the leaderboard is USUALLY a board on a wall, so this was not an edge case, it was the
 * common case being marked wrong.
 *
 * A SurfaceGui's canvas is its part's face, in studs, times PixelsPerStud. Which face depends on
 * `Face`, and the engine's default is Front — the part's X by Y. Everything here is read off
 * properties the model set; when the part has no Size there is nothing to derive and the function
 * says so rather than picking a number.
 */
export function surfaceCanvas(gui, part) {
  if (!part) return null;
  const size = part.props?.Size;
  if (!size || size.k !== 'Vector3') return null;
  const face = enumProp(gui, 'Face') ?? 'Front';
  const studs =
    face === 'Left' || face === 'Right'
      ? { w: size.z, h: size.y }
      : face === 'Top' || face === 'Bottom'
        ? { w: size.x, h: size.z }
        : { w: size.x, h: size.y };
  const pps = numProp(gui, 'PixelsPerStud', 50);
  const w = Math.round(studs.w * pps);
  const h = Math.round(studs.h * pps);
  if (!(w > 0 && h > 0)) return null;
  return { w, h, face, pixelsPerStud: pps, studs: { w: studs.w, h: studs.h } };
}

/**
 * Paint order. Roblox draws siblings by ZIndex then by the order they were parented; `nodes` from
 * the harness is already in creation order, so a stable sort on ZIndex alone reproduces it.
 */
function paintOrder(nodes) {
  return nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => numProp(a.n, 'ZIndex', 1) - numProp(b.n, 'ZIndex', 1) || a.i - b.i)
    .map((e) => e.n);
}

/**
 * Render one resolved ScreenGui to an SVG string.
 *
 * @param {object} args
 * @param {object[]} args.guiNodes   GUI descendants of the ScreenGui, in creation order.
 * @param {Map} args.rects           node.id -> {x,y,w,h}, from resolveLayout.
 * @param {{w:number,h:number}} args.viewport
 * @param {string} [args.background] Painted behind everything, so a transparent UI is still legible.
 * @param {boolean} [args.forceVisible] Draw nodes the script left hidden. See isVisible.
 * @returns {{svg:string, painted:number, offscreen:number, imagePlaceholders:number, scaledText:number, textNodes:number, hidden:number, forcedVisible:number}}
 */
export function renderTreeToSvg({ guiNodes, rects, viewport, background = '#101014', forceVisible = false }) {
  const parts = [];
  let painted = 0;
  let offscreen = 0;
  let imagePlaceholders = 0;
  let scaledText = 0;
  let textNodes = 0;
  let hidden = 0;
  let forcedVisible = 0;
  let wrappedText = 0;
  let richTextNodes = 0;
  let richTextBreaks = 0;

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.w}" height="${viewport.h}" ` +
      `viewBox="0 0 ${viewport.w} ${viewport.h}" font-family="${FONT_STACK}">`,
  );
  parts.push(
    `<defs><pattern id="apple-unfetched" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="12" height="12" fill="#1b1b22"/><line x1="0" y1="0" x2="0" y2="12" stroke="#3a3a46" stroke-width="3"/>` +
      `</pattern></defs>`,
  );
  parts.push(`<rect width="${viewport.w}" height="${viewport.h}" fill="${background}"/>`);

  for (const node of paintOrder(guiNodes)) {
    const rect = rects.get(node.id);
    if (!rect) continue;
    if (!isVisible(node, { forceVisible: false })) {
      hidden += 1;
      if (!forceVisible) continue;
      forcedVisible += 1;
    }
    if (rect.w <= 0 || rect.h <= 0) continue;

    // Wholly outside the viewport. Counted rather than dropped silently: a panel positioned off
    // screen is one of the four failures score-ui.mjs exists to catch, and the picture should not
    // quietly become the picture of a screen that has no such bug.
    if (rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= viewport.w || rect.y >= viewport.h) {
      offscreen += 1;
      continue;
    }

    const r = cornerRadius(node, rect);
    const rAttr = r > 0 ? ` rx="${r.toFixed(2)}" ry="${r.toFixed(2)}"` : '';
    const x = rect.x.toFixed(2);
    const y = rect.y.toFixed(2);
    const w = rect.w.toFixed(2);
    const h = rect.h.toFixed(2);

    const bgTrans = numProp(node, 'BackgroundTransparency', 0);
    const bg = cssColor(node, 'BackgroundColor3') ?? '#ffffff';
    if (bgTrans < 1) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rAttr} fill="${bg}" fill-opacity="${(1 - bgTrans).toFixed(3)}"/>`,
      );
      painted += 1;
    }

    // UIStroke is a child, and its colour defaults to black in the engine.
    const stroke = childClass(node, 'UIStroke');
    if (stroke) {
      const sc = cssColor(stroke, 'Color') ?? '#000000';
      const st = numProp(stroke, 'Thickness', 1);
      const sTrans = numProp(stroke, 'Transparency', 0);
      if (sTrans < 1 && st > 0) {
        parts.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rAttr} fill="none" stroke="${sc}" ` +
            `stroke-width="${st}" stroke-opacity="${(1 - sTrans).toFixed(3)}"/>`,
        );
      }
    }

    if (IMAGE_CLASSES.has(node.class)) {
      const asset = strProp(node, 'Image', '');
      const imgTrans = numProp(node, 'ImageTransparency', 0);
      if (asset && imgTrans < 1) {
        // NEVER a picture. A hatch plus the id the model asked for, so the reference is visible as
        // a reference. See the header note.
        imagePlaceholders += 1;
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${rAttr} fill="url(#apple-unfetched)"/>`);
        const label = asset.length > 34 ? `${asset.slice(0, 31)}...` : asset;
        if (rect.h >= 16 && rect.w >= 60) {
          parts.push(
            `<text x="${(rect.x + rect.w / 2).toFixed(2)}" y="${(rect.y + rect.h / 2 + 4).toFixed(2)}" ` +
              `text-anchor="middle" font-size="11" fill="#8a8a99">${esc(label)}</text>`,
          );
        }
      }
    }

    if (TEXT_CLASSES.has(node.class)) {
      const text = strProp(node, 'Text', '');
      const tTrans = numProp(node, 'TextTransparency', 0);
      if (text && tTrans < 1) {
        textNodes += 1;
        const { size, approximated } = textSize(node, rect);
        if (approximated) scaledText += 1;
        const color = cssColor(node, 'TextColor3') ?? '#ffffff';
        const xAlign = enumProp(node, 'TextXAlignment') ?? 'Center';
        const yAlign = enumProp(node, 'TextYAlignment') ?? 'Center';
        const pad = 6;
        const tx =
          xAlign === 'Left' ? rect.x + pad : xAlign === 'Right' ? rect.x + rect.w - pad : rect.x + rect.w / 2;
        const anchor = xAlign === 'Left' ? 'start' : xAlign === 'Right' ? 'end' : 'middle';
        const ty =
          yAlign === 'Top'
            ? rect.y + size * 0.95
            : yAlign === 'Bottom'
              ? rect.y + rect.h - size * 0.25
              : rect.y + rect.h / 2 + size * 0.35;
        //[[ RICH TEXT IS MARKUP OR IT IS CHARACTERS, AND ONLY THE NODE SAYS WHICH.
        //
        //   `RichText = false` means the angle brackets ARE the label — drawing them is correct,
        //   and that is the unchanged path below. `RichText = true` means they are instructions,
        //   and drawing them libels the model. See the RICH TEXT note above TEXT_CLASSES for the
        //   chat screen this was measured on. Markup that does not parse falls back to the raw
        //   string, because Studio shows the raw string too and hiding that would be a repair
        //   nobody asked for. ]]
        const rich = boolProp(node, 'RichText', false) ? parseRichText(text) : null;
        if (rich) {
          richTextNodes += 1;
          richTextBreaks += rich.breaks;
        }
        const body = rich
          ? rich.runs
              .map((r) => {
                const a = [];
                if (r.bold) a.push('font-weight="bold"');
                if (r.italic) a.push('font-style="italic"');
                if (r.underline && r.strike) a.push('text-decoration="underline line-through"');
                else if (r.underline) a.push('text-decoration="underline"');
                else if (r.strike) a.push('text-decoration="line-through"');
                if (r.color) a.push(`fill="${r.color}"`);
                if (r.size) a.push(`font-size="${r.size.toFixed(1)}"`);
                if (r.transparency != null && Number.isFinite(r.transparency)) {
                  a.push(`fill-opacity="${Math.max(0, Math.min(1, 1 - r.transparency)).toFixed(3)}"`);
                }
                // xml:space keeps the single spaces BETWEEN runs, which is where a chat line's
                // "tag name: message" spacing lives.
                return `<tspan xml:space="preserve"${a.length ? ` ${a.join(' ')}` : ''}>${esc(r.text)}</tspan>`;
              })
              .join('')
          : esc(text);
        const el =
          `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" text-anchor="${anchor}" ` +
          `font-size="${size.toFixed(1)}" fill="${color}" fill-opacity="${(1 - tTrans).toFixed(3)}">${body}</text>`;

        //[[ A WRAPPED LABEL STAYS IN ITS BOX, AND DRAWING IT SPILLING OUT LIBELS THE MODEL.
        //
        //   MEASURED, 2026-09-20, on a generated tycoon inventory. Its item description set
        //   `TextWrapped = true` and the renderer, which lays out no line breaks, drew the whole
        //   string on one line — straight through the right edge of the detail panel and off the
        //   card. It read as a text-overflow bug in the model's layout. In Roblox that label wraps
        //   and stays inside its rectangle, so the picture was wrong and the model was right.
        //
        //   Laying the line breaks out properly needs a font metric this process does not have, and
        //   score-ui.mjs refuses to invent one ("a frame that sizes itself from its text cannot be
        //   resolved without a font metric"). Clipping to the node's own rect invents nothing: it
        //   asserts only what the engine guarantees, that wrapped text does not leave its box.
        //   `wrappedText` counts them so a caption can say which strings are drawn unbroken.
        //
        //   TextWrapped = false is the opposite case and is deliberately NOT clipped: such a label
        //   really does run past its edge in Roblox, and that overflow is a finding worth seeing. ]]
        if (boolProp(node, 'TextWrapped', false)) {
          wrappedText += 1;
          const cid = `wrap-${node.id}`;
          parts.push(
            `<clipPath id="${cid}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>` +
              `<g clip-path="url(#${cid})">${el}</g>`,
          );
        } else {
          parts.push(el);
        }
      }
    }
  }

  parts.push('</svg>');
  return { svg: parts.join('\n'), painted, offscreen, imagePlaceholders, scaledText, textNodes, hidden, forcedVisible, wrappedText, richTextNodes, richTextBreaks };
}
