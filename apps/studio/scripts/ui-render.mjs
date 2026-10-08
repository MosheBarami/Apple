// Renders a compiled build_ui screen (the InstanceSpec tree the worker's compiler emits) as an HTML approximation and
// screenshots it at desktop and phone sizes, so a person can look at a design without Roblox Studio. It approximates
// Roblox layout (UDim2 positions, AnchorPoint, UIListLayout as flexbox, UIGridLayout as grid, AutomaticSize as
// fit-content); the real measurement is the plugin's measure_ui. Usage: node scripts/ui-render.mjs <screen.json> <outPrefix>
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [file, prefix] = process.argv.slice(2);
const root = JSON.parse(readFileSync(file, 'utf8'));
const v = (n, k) => n.props?.[k]?.v;
const kid = (n, cls) => (n.children ?? []).find((c) => c.className === cls);
const rgb = (c, t = 0) => (c ? `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${1 - (t ?? 0)})` : 'transparent');
const fonts = new Set();
const UI = new Set(['UICorner', 'UIStroke', 'UIPadding', 'UIListLayout', 'UIGridLayout', 'UISizeConstraint', 'UIFlexItem', 'UITextSizeConstraint', 'UIGradient', 'UIAspectRatioConstraint']);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const enumName = (e) => (typeof e === 'string' ? e.split('.').pop() : undefined);

function node(n, inLayout) {
  if (UI.has(n.className)) return '';
  const st = [];
  const size = v(n, 'Size') ?? [0, 100, 0, 100];
  const auto = enumName(v(n, 'AutomaticSize')) ?? 'None';
  const autoX = auto === 'X' || auto === 'XY';
  const autoY = auto === 'Y' || auto === 'XY';
  const flex = kid(n, 'UIFlexItem');
  const fill = flex && enumName(v(flex, 'FlexMode')) === 'Fill';
  const w = autoX ? (size[1] ? `max-content` : 'max-content') : `calc(${size[0] * 100}% + ${size[1]}px)`;
  const h = autoY ? 'max-content' : `calc(${size[2] * 100}% + ${size[3]}px)`;
  if (n.className !== 'ScreenGui') {
    if (autoX) st.push(`min-width:${size[1]}px`); else st.push(`width:${w}`);
    if (autoY) st.push(`min-height:${size[3]}px`); else st.push(`height:${h}`);
    if (fill) st.push('flex:1 1 0', inLayout === 'row' ? 'width:auto' : 'height:auto');
    if (!inLayout) {
      const p = v(n, 'Position') ?? [0, 0, 0, 0];
      const a = v(n, 'AnchorPoint') ?? [0, 0];
      st.push('position:absolute', `left:calc(${p[0] * 100}% + ${p[1]}px)`, `top:calc(${p[2] * 100}% + ${p[3]}px)`, `transform:translate(${-a[0] * 100}%,${-a[1] * 100}%)`);
    } else st.push('position:relative', 'flex-shrink:0');
    const t = v(n, 'BackgroundTransparency') ?? 0;
    if (!['TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton'].includes(n.className) || t < 1) st.push(`background:${rgb(v(n, 'BackgroundColor3') ?? [1, 1, 1], t)}`);
    if (v(n, 'ClipsDescendants') || n.className === 'ScrollingFrame') st.push(n.className === 'ScrollingFrame' ? 'overflow:auto' : 'overflow:hidden');
    if (v(n, 'ZIndex')) st.push(`z-index:${v(n, 'ZIndex')}`);
  } else st.push('position:absolute', 'inset:0');
  const corner = kid(n, 'UICorner');
  if (corner) { const r = v(corner, 'CornerRadius') ?? [0, 8]; st.push(`border-radius:${r[0] ? `${r[0] * 100}%` : `${r[1]}px`}`); }
  const stroke = kid(n, 'UIStroke');
  if (stroke) st.push(`box-shadow:inset 0 0 0 ${v(stroke, 'Thickness') ?? 1}px ${rgb(v(stroke, 'Color') ?? [0, 0, 0], v(stroke, 'Transparency') ?? 0)}`);
  const pad = kid(n, 'UIPadding');
  if (pad) st.push(`padding:${['PaddingTop', 'PaddingRight', 'PaddingBottom', 'PaddingLeft'].map((k) => `${(v(pad, k) ?? [0, 0])[1]}px`).join(' ')}`, 'box-sizing:border-box');
  else st.push('box-sizing:border-box');
  const sc = kid(n, 'UISizeConstraint');
  if (sc) { const mn = v(sc, 'MinSize'); const mx = v(sc, 'MaxSize'); if (mn) st.push(`min-width:${mn[0]}px`, `min-height:${mn[1]}px`); if (mx) { if (mx[0] < 1e5) st.push(`max-width:${mx[0]}px`); if (mx[1] < 1e5) st.push(`max-height:${mx[1]}px`); } }
  const list = kid(n, 'UIListLayout');
  const grid = kid(n, 'UIGridLayout');
  let layout = null;
  if (list) {
    const row = enumName(v(list, 'FillDirection')) === 'Horizontal';
    layout = row ? 'row' : 'col';
    const gap = (v(list, 'Padding') ?? [0, 0])[1];
    const ha = { Left: 'flex-start', Center: 'center', Right: 'flex-end' }[enumName(v(list, 'HorizontalAlignment')) ?? 'Left'];
    const va = { Top: 'flex-start', Center: 'center', Bottom: 'flex-end' }[enumName(v(list, 'VerticalAlignment')) ?? 'Top'];
    const flexJ = { SpaceBetween: 'space-between', SpaceAround: 'space-around', SpaceEvenly: 'space-evenly' }[enumName(v(list, 'HorizontalFlex') ?? v(list, 'VerticalFlex')) ?? ''];
    st.push('display:flex', `flex-direction:${row ? 'row' : 'column'}`, `gap:${gap}px`, `justify-content:${flexJ ?? (row ? ha : va)}`, `align-items:${row ? va : ha}`);
    if (v(list, 'Wraps')) st.push('flex-wrap:wrap');
  } else if (grid) {
    layout = 'grid';
    const cell = v(grid, 'CellSize') ?? [0, 100, 0, 100];
    const gp = v(grid, 'CellPadding') ?? [0, 0, 0, 0];
    st.push('display:grid', `grid-template-columns:repeat(auto-fill, calc(${cell[0] * 100}% + ${cell[1]}px))`, `grid-auto-rows:calc(${cell[2] * 100}% + ${cell[3]}px)`, `gap:${gp[3]}px ${gp[1]}px`);
  }
  let inner = '';
  if (['TextLabel', 'TextButton', 'TextBox'].includes(n.className)) {
    const f = v(n, 'FontFace');
    if (f) fonts.add(f[0]);
    const weight = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Heavy: 900 }[f?.[1]] ?? 400;
    const xa = { Left: 'flex-start', Center: 'center', Right: 'flex-end' }[enumName(v(n, 'TextXAlignment')) ?? 'Center'];
    const ya = { Top: 'flex-start', Center: 'center', Bottom: 'flex-end' }[enumName(v(n, 'TextYAlignment')) ?? 'Center'];
    if (!layout) st.push('display:flex', `justify-content:${xa}`, `align-items:${ya}`);
    st.push(`font-family:'${f?.[0] ?? 'Builder Sans'}',sans-serif`, `font-weight:${weight}`, `font-size:${v(n, 'TextSize') ?? 14}px`, `color:${rgb(v(n, 'TextColor3') ?? [0, 0, 0], v(n, 'TextTransparency') ?? 0)}`, `text-align:${enumName(v(n, 'TextXAlignment'))?.toLowerCase() ?? 'center'}`);
    if (enumName(v(n, 'TextTruncate')) === 'AtEnd') st.push('white-space:nowrap', 'text-overflow:ellipsis');
    const text = n.className === 'TextBox' && !v(n, 'Text') ? `<span style="color:${rgb(v(n, 'PlaceholderColor3') ?? [0.5, 0.5, 0.5])}">${esc(v(n, 'PlaceholderText'))}</span>` : esc(v(n, 'Text'));
    inner += `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${text}</span>`;
  }
  const kids = (n.children ?? []).filter((c) => !UI.has(c.className));
  if (list || grid) kids.sort((a, b) => (v(a, 'LayoutOrder') ?? 0) - (v(b, 'LayoutOrder') ?? 0));
  inner += kids.map((c) => node(c, layout)).join('');
  if (v(n, 'Visible') === false) st.push('display:none');
  return `<div title="${esc(n.name)}" style="${st.join(';')}">${inner}</div>`;
}

const body = node(root, null);
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?${[...fonts].map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800;900`).join('&')}&display=swap" rel="stylesheet"><style>html,body{margin:0;height:100%;overflow:hidden;background:#6b7a8f linear-gradient(#87a3c4,#5d7a52)}</style></head><body><div style="position:relative;width:100vw;height:100vh">${body}</div></body></html>`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const [w, h, tag] of [[1366, 768, 'desktop'], [390, 844, 'phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => undefined);
  await page.screenshot({ path: `${prefix}-${tag}.png` });
  await page.close();
}
await browser.close();
console.log(`wrote ${prefix}-desktop.png and ${prefix}-phone.png`);
