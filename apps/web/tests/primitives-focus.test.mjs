/**
 * Workspace floating-surface focus behavior, driven through the real primitives.
 *
 * There is deliberately no DOM package here. Like unsaved.test.mjs, this bundles the production
 * module against a tiny React hook stub so effects and cleanups can be committed by hand. The
 * element/document doubles implement only the browser operations primitives.tsx actually uses.
 *
 * `react-dom` IS STUBBED FOR THE SAME REASON, added 2026-09-20 when Drawer began rendering through
 * `createPortal`. The real react-dom touches a DOM at import time, so bundling it here does not
 * fail a check — it fails the FILE, before a single assertion runs, which is the loudest possible
 * way to say nothing about focus. The stub returns the children unchanged and records the
 * container, which is exactly as much of a portal as this file is about: where the panel paints is
 * drawer-stacking.test.mjs's question, and the one assertion added below only pins that the
 * container is `document.body` so a portal into the wrong place cannot pass silently here either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'workspace-primitives-focus-'));

const reactStub = join(dir, 'react-stub.mjs');
writeFileSync(reactStub, String.raw`
let cursor = 0;
const slots = [];
let pending = [];

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

globalThis.__beginPrimitiveRender = () => { cursor = 0; pending = []; };
globalThis.__commitPrimitiveEffects = () => {
  for (const { index, fn } of pending) {
    const slot = slots[index];
    slot.cleanup?.();
    slot.cleanup = fn();
  }
  pending = [];
};
globalThis.__resetPrimitiveHooks = () => { cursor = 0; pending = []; slots.length = 0; };
globalThis.__unmountPrimitive = () => {
  for (const slot of slots) slot?.cleanup?.();
  cursor = 0;
  pending = [];
  slots.length = 0;
};

export function useRef(initial) {
  const index = cursor++;
  if (!slots[index]) slots[index] = { kind: 'ref', value: { current: initial } };
  return slots[index].value;
}

export function useEffect(fn, deps) {
  const index = cursor++;
  const previous = slots[index];
  const changed = !previous || !sameDeps(previous.deps, deps);
  if (!previous) slots[index] = { kind: 'effect', deps, cleanup: undefined };
  else previous.deps = deps;
  if (changed) pending.push({ index, fn });
}
`);

const domStub = join(dir, 'react-dom-stub.mjs');
writeFileSync(domStub, String.raw`
export function createPortal(children, container) {
  globalThis.__lastPortalContainer = container;
  return children;
}
`);

const jsxStub = join(dir, 'jsx-stub.mjs');
writeFileSync(jsxStub, String.raw`
export const Fragment = Symbol.for('test.fragment');
export function jsx(type, props, key) { return { type, key, props: props ?? {} }; }
export const jsxs = jsx;
`);

const out = join(dir, 'primitives.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'), [
  join(WEB, 'src', 'components', 'ws', 'primitives.tsx'),
  '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module',
  `--alias:react/jsx-runtime=${jsxStub}`,
  `--alias:react-dom=${domStub}`,
  `--alias:react=${reactStub}`,
  '--outfile=' + out,
], { stdio: 'pipe' });
const P = await import(out);

class FakeElement {
  constructor(name, { visible = true, disabled = false, kind = 'button', children = [],
    tabIndex = 0, explicitTabIndex = false, fieldsetDisabled = false, hiddenAncestor = false,
    inert = false, ariaDisabled = false, visibility = 'visible' } = {}) {
    this.name = name;
    this.visible = visible;
    this.disabled = disabled;
    this.kind = kind;
    this.children = children;
    Object.assign(this, { tabIndex, explicitTabIndex, fieldsetDisabled, hiddenAncestor, inert, ariaDisabled, visibility });
    this.focusCalls = 0;
  }
  focus() {
    this.focusCalls += 1;
    if (this.visible && !this.disabled && !this.fieldsetDisabled && !this.inert
      && !this.hiddenAncestor && this.visibility === 'visible') globalThis.document.activeElement = this;
  }
  contains(node) { return node === this || this.children.includes(node); }
  getClientRects() { return this.visible ? [{}] : []; }
  matches(selector) {
    return (selector.includes(':disabled') && (this.disabled || this.fieldsetDisabled))
      || (selector.includes('[aria-disabled="true"]') && this.ariaDisabled);
  }
  closest(selector) {
    return (selector.includes('[inert]') && this.inert)
      || (selector.includes('[hidden]') && this.hiddenAncestor) ? this : null;
  }
  querySelectorAll(selector) {
    return this.children.filter((child) => {
      // A selector UNION can admit a disabled control through [tabindex], independently of
      // button:not([disabled]). The old double accidentally made that real counterexample vanish.
      if (child.explicitTabIndex && selector.includes('[tabindex]') && child.tabIndex !== -1) return true;
      if (!child.disabled) return true;
      if (child.kind === 'input') return !selector.includes('input:not([disabled])');
      if (child.kind === 'textarea') return !selector.includes('textarea:not([disabled])');
      if (child.kind === 'select') return !selector.includes('select:not([disabled])');
      if (child.kind === 'button') return !selector.includes('button:not([disabled])');
      return true;
    });
  }
}

globalThis.HTMLElement = FakeElement;
globalThis.getComputedStyle = element => ({ visibility: element.visibility });

function fakeDocument() {
  const listeners = new Map();
  return {
    activeElement: null,
    // The portal's container. Named so an assertion can tell "portalled to the body" from
    // "portalled to undefined", which the stub would otherwise accept in silence.
    body: { nodeName: 'BODY' },
    addEventListener(type, fn) {
      const current = listeners.get(type) ?? [];
      current.push(fn);
      listeners.set(type, current);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
    },
    fire(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
  };
}

function findByRole(node, role) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.role === role) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByRole(child, role);
    if (found) return found;
  }
  return null;
}

function render(Component, props, refRole, element) {
  globalThis.__beginPrimitiveRender();
  const tree = Component(props);
  const refNode = findByRole(tree, refRole);
  assert.ok(refNode?.props?.ref, `could not find ${refRole} ref in rendered primitive`);
  refNode.props.ref.current = element;
  globalThis.__commitPrimitiveEffects();
  return tree;
}

function keyEvent(key, shiftKey = false) {
  return {
    key,
    shiftKey,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

test('Drawer renders through a portal into the body, not wherever it was called from', () => {
  // The panel is `aria-modal="true"` and traps Tab, and it used to do both from inside `.gx-ws`
  // — a `z-index:1` stacking context that held its scrim below the navigation rail, so a POINTER
  // could still reach the page the keyboard had been shut out of. Portalling is what fixes that,
  // and `undefined` is what a careless refactor would hand the stub instead.
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  globalThis.__lastPortalContainer = null;
  const panel = new FakeElement('panel', { children: [] });
  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);
  assert.equal(globalThis.__lastPortalContainer, document.body, 'the drawer must be portalled to document.body');
});

test('Drawer parent rerenders do not run close cleanup or recapture focus, and Escape uses the latest onClose', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const field = new FakeElement('field');
  const panel = new FakeElement('panel', { children: [field] });
  document.activeElement = opener;
  let oldCloses = 0;
  let newCloses = 0;

  render(P.Drawer, { open: true, onClose: () => { oldCloses += 1; }, title: 'Files', children: null }, 'dialog', panel);
  assert.equal(document.activeElement, panel, 'opening the drawer should move focus into it');
  field.focus();

  render(P.Drawer, { open: true, onClose: () => { newCloses += 1; }, title: 'Files', children: null }, 'dialog', panel);
  assert.equal(document.activeElement, field, 'an unrelated parent rerender stole focus from the control being used');
  assert.equal(opener.focusCalls, 0, 'an unrelated parent rerender ran the close cleanup');

  document.fire('keydown', keyEvent('Escape'));
  assert.equal(oldCloses, 0, 'Escape called a stale onClose after the rerender');
  assert.equal(newCloses, 1, 'Escape did not call the latest onClose');

  globalThis.__unmountPrimitive();
  assert.equal(document.activeElement, opener, 'closing the drawer must still return focus to its opener');
});

test('Popover parent rerenders do not return focus to the opener, and dismissal uses the latest onClose', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const item = new FakeElement('menu item');
  const outside = new FakeElement('outside');
  const menu = new FakeElement('menu', { children: [item] });
  document.activeElement = opener;
  let oldCloses = 0;
  let newCloses = 0;

  render(P.Popover, { open: true, onClose: () => { oldCloses += 1; }, label: 'Model', children: null }, 'menu', menu);
  item.focus();
  render(P.Popover, { open: true, onClose: () => { newCloses += 1; }, label: 'Model', children: null }, 'menu', menu);
  assert.equal(document.activeElement, item, 'an unrelated parent rerender returned focus to the popover opener');
  assert.equal(opener.focusCalls, 0, 'an unrelated parent rerender ran the popover close cleanup');

  document.fire('mousedown', { target: outside });
  assert.equal(oldCloses, 0, 'outside dismissal called a stale onClose after the rerender');
  assert.equal(newCloses, 1, 'outside dismissal did not call the latest onClose');

  globalThis.__unmountPrimitive();
  assert.equal(document.activeElement, opener, 'closing the popover must still return focus to its opener');
});

test('Drawer Shift+Tab from its initially focused panel lands on the last rendered focus target', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const first = new FakeElement('close');
  const lastVisible = new FakeElement('history');
  // Real drawer children include visually hidden file inputs. querySelectorAll still returns them,
  // but they are not valid endpoints for a keyboard focus loop.
  const hiddenFile = new FakeElement('hidden file input', { visible: false, kind: 'input' });
  const panel = new FakeElement('panel', { children: [first, lastVisible, hiddenFile] });
  document.activeElement = opener;

  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);
  assert.equal(document.activeElement, panel, 'the test must start from the programmatically focused dialog panel');

  const backwards = keyEvent('Tab', true);
  document.fire('keydown', backwards);
  assert.equal(backwards.prevented, true, 'Shift+Tab from the panel escaped the modal focus loop');
  assert.equal(document.activeElement, lastVisible, 'Shift+Tab did not land on the last rendered focus target');
  assert.equal(hiddenFile.focusCalls, 0, 'a hidden file input was treated as a focus-loop endpoint');

  const forwards = keyEvent('Tab');
  document.fire('keydown', forwards);
  assert.equal(forwards.prevented, true, 'Tab from the last visible target escaped the modal focus loop');
  assert.equal(document.activeElement, first, 'forward Tab did not wrap back to the first focus target');

  globalThis.__unmountPrimitive();
});

test('Drawer Tab recovers focus from outside the open modal and skips hidden or disabled controls', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const outside = new FakeElement('Attach a file');
  const first = new FakeElement('close');
  const lastVisible = new FakeElement('download all');
  const disabledFile = new FakeElement('disabled file input', { disabled: true, kind: 'input' });
  const hiddenFile = new FakeElement('hidden file input', { visible: false, kind: 'input' });
  const panel = new FakeElement('panel', { children: [first, lastVisible, disabledFile, hiddenFile] });
  document.activeElement = opener;

  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);

  // Mirrors the served-page receipt: focus has escaped to a background control while the modal is
  // still open. The next keyboard move must recover into the dialog rather than continue outside.
  outside.focus();
  const backwards = keyEvent('Tab', true);
  document.fire('keydown', backwards);
  assert.equal(backwards.prevented, true, 'Shift+Tab from outside the open modal was allowed to stay in the background');
  assert.equal(document.activeElement, lastVisible, 'Shift+Tab recovery did not land on the last eligible drawer control');
  assert.equal(disabledFile.focusCalls, 0, 'a disabled input became the backwards focus endpoint');
  assert.equal(hiddenFile.focusCalls, 0, 'a hidden input became the backwards focus endpoint');

  outside.focus();
  const forwards = keyEvent('Tab');
  document.fire('keydown', forwards);
  assert.equal(forwards.prevented, true, 'Tab from outside the open modal was allowed to stay in the background');
  assert.equal(document.activeElement, first, 'Tab recovery did not land on the first eligible drawer control');

  globalThis.__unmountPrimitive();
});

for (const [name, options] of [
  ['disabled control with tabindex', { disabled: true, explicitTabIndex: true }],
  ['disabled fieldset descendant', { fieldsetDisabled: true }],
  ['hidden ancestor', { hiddenAncestor: true }],
  ['inert subtree', { inert: true }],
  ['CSS-hidden control with a layout box', { visibility: 'hidden' }],
  ['aria-disabled control', { ariaDisabled: true }],
  ['negative-tabindex native control', { tabIndex: -1, explicitTabIndex: true }],
]) test(`Drawer excludes ${name} from its keyboard endpoints`, () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const eligible = new FakeElement('close');
  const excluded = new FakeElement(name, options);
  const panel = new FakeElement('panel', { children: [eligible, excluded] });
  document.activeElement = opener;
  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);
  const event = keyEvent('Tab', true);
  document.fire('keydown', event);
  assert.equal(event.prevented, true);
  assert.equal(excluded.focusCalls, 0, `${name} was attempted as a keyboard endpoint`);
  assert.equal(document.activeElement, eligible);
  globalThis.__unmountPrimitive();
});

test('Drawer keeps focus on its panel when no eligible child remains', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const panel = new FakeElement('panel', { children: [new FakeElement('hidden', { visible: false })] });
  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);
  for (const shift of [false, true]) {
    const event = keyEvent('Tab', shift);
    document.fire('keydown', event);
    assert.equal(event.prevented, true, 'an empty modal must not let browser Tab walk into the background');
    assert.equal(document.activeElement, panel);
  }
  globalThis.__unmountPrimitive();
});

test('Drawer returns focus once on actual open-to-closed transition, not on closed rerenders', () => {
  globalThis.__resetPrimitiveHooks();
  globalThis.document = fakeDocument();
  const opener = new FakeElement('opener');
  const panel = new FakeElement('panel');
  document.activeElement = opener;
  render(P.Drawer, { open: true, onClose: () => {}, title: 'Files', children: null }, 'dialog', panel);
  for (let i = 0; i < 2; i += 1) {
    globalThis.__beginPrimitiveRender();
    assert.equal(P.Drawer({ open: false, onClose: () => {}, title: 'Files', children: null }), null);
    globalThis.__commitPrimitiveEffects();
    assert.equal(document.activeElement, opener);
    assert.equal(opener.focusCalls, 1);
  }
  globalThis.__unmountPrimitive();
  assert.equal(opener.focusCalls, 1);
});
