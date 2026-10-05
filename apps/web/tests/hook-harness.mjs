/**
 * RUN A MODULE'S REAL REACT HOOKS UNDER `node --test`, with no DOM.
 *
 * This app has no DOM package, and react-dom/server renders once and never runs an effect, so a hook that fetches
 * after mount (the "Continue with Roblox" status check, the landing page's redeem) could be tested only as source
 * text. This bundles the production module with esbuild against a small stand-in for `react` that implements the
 * three hooks those modules use, and drives it the way React does: render, commit the effects, let the promises
 * they started settle, render again if state changed.
 *
 * What it does NOT do: reconcile, batch or schedule like React (a state change re-renders on the next `settle`),
 * and it implements only useState, useEffect and useRef. A module that needs another hook fails to bundle, loudly.
 * The same precedent, hand-rolled per file, is tests/primitives-focus.test.mjs and tests/unsaved.test.mjs.
 *
 *   const M = await loadWithReact('src/lib/roblox-signin.ts', 'roblox-signin');
 *   const hook = M.mountStub(() => M.useRobloxConfigured());
 *   hook.result            // false: nothing has been committed yet
 *   await hook.settle();   // commit effects, let their promises resolve, re-render
 *   hook.result            // what the hook returned after the answer arrived
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REACT_STUB = String.raw`
let current = null;

export function useState(initial) {
  const inst = current;
  const i = inst.cursor++;
  if (!(i in inst.slots)) inst.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
  const slot = inst.slots[i];
  const set = (next) => {
    const value = typeof next === 'function' ? next(slot.value) : next;
    if (inst.unmounted) { inst.setsAfterUnmount += 1; return; }
    if (!Object.is(value, slot.value)) { slot.value = value; inst.dirty = true; }
  };
  return [slot.value, set];
}

export function useRef(initial) {
  const inst = current;
  const i = inst.cursor++;
  if (!(i in inst.slots)) inst.slots[i] = { value: { current: initial } };
  return inst.slots[i].value;
}

// A page that calls it for an id it never reads in the part under test.
export const useId = () => ':stub:';

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));

export function useEffect(fn, deps) {
  const inst = current;
  const i = inst.cursor++;
  const slot = inst.slots[i];
  if (!slot) {
    inst.slots[i] = { deps, cleanup: undefined };
    inst.queue.push({ i, fn });
  } else if (deps === undefined || !sameDeps(slot.deps, deps)) {
    slot.deps = deps;
    inst.queue.push({ i, fn });
  }
}

export function mountStub(renderFn) {
  const inst = { slots: [], cursor: 0, queue: [], dirty: false, unmounted: false, setsAfterUnmount: 0, renders: 0, result: undefined };
  const render = () => {
    current = inst;
    inst.cursor = 0;
    inst.dirty = false;
    inst.renders += 1;
    try { inst.result = renderFn(); } finally { current = null; }
  };
  render();
  return {
    get result() { return inst.result; },
    get renders() { return inst.renders; },
    get setsAfterUnmount() { return inst.setsAfterUnmount; },
    rerender: render,
    /** Commit the effects the last render queued, let the promises they started settle, and render again while state keeps changing. */
    async settle() {
      for (let round = 0; round < 25; round += 1) {
        const effects = inst.queue;
        inst.queue = [];
        for (const { i, fn } of effects) {
          inst.slots[i].cleanup?.();
          const cleanup = fn();
          inst.slots[i].cleanup = typeof cleanup === 'function' ? cleanup : undefined;
        }
        await new Promise((resolveTick) => setImmediate(resolveTick));
        if (inst.dirty) render();
        else if (!inst.queue.length) return;
      }
      throw new Error('the hook never settled: it keeps changing state');
    },
    unmount() {
      for (const slot of inst.slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup();
      inst.unmounted = true;
    },
  };
}
`;

/** Bundle `entry` (a path under apps/web) with `react` replaced by the stand-in, and import it. `mountStub` is exported beside it. */
export async function loadWithReact(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-hooks-`));
  const stub = join(dir, 'react-stub.mjs');
  writeFileSync(stub, REACT_STUB);
  const wrapper = join(dir, 'entry.mjs');
  writeFileSync(wrapper, `export * from ${JSON.stringify(resolve(WEB, entry))};\nexport { mountStub } from ${JSON.stringify(stub)};\n`);
  const out = join(dir, 'bundle.mjs');
  execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'), [
    wrapper, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module',
    `--alias:react=${stub}`, '--outfile=' + out, '--log-level=error',
  ], { stdio: 'pipe' });
  return import(out);
}
