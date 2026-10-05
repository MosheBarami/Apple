/**
 * RUN A PAGE COMPONENT'S OWN CODE under `node --test`, with no DOM: its hooks, its dependencies and the props it hands its children.
 *
 * tests/hook-harness.mjs runs a module's hooks against a stand-in for React; this goes one step further and runs a COMPONENT in
 * routes/*.tsx the same way, so the wiring a page does by hand (what it passes to its hook, what it hands its view, which
 * router call a button makes) is executed instead of read. A page is bundled for real with five things replaced:
 *
 *   - `react` is the hook stand-in, and `react/jsx-runtime` makes plain `{ type, props }` objects, so calling the component
 *     returns the element tree it would have rendered, unexpanded: a test finds the child it cares about and reads its props
 *     (`state`, `onSwitch`, `onStay`) or calls them;
 *   - `react-router-dom` records every `navigate(to, options)` in `routerControls.navigations`;
 *   - the Supabase client (`lib/supabase`) is `supabaseControls`: a session to be returned, a verifyOtp answer, and a record of
 *     every call made on it;
 *   - every OTHER module the page imports directly is replaced by an inert stand-in that exports the same names as functions
 *     returning null, except the ones the test names in `real` (the logic under test, which stays real and brings its own imports);
 *   - everything the real modules import is the real thing.
 *
 * What it does NOT do: render the children (a child component is never called), reconcile, or run a hook this file's stand-in
 * does not implement. A page that needs more fails to bundle or throws, loudly.
 *
 *   const P = await loadPage({ entry: 'src/routes/auth-pages.tsx', name: 'auth-pages', real: ['lib/roblox-signin.ts'] });
 *   const page = P.mountStub(() => P.RobloxCallbackPage());
 *   await page.settle();                       // effects committed, promises settled, re-rendered
 *   page.result                                // { type, props: { children } }: the element tree
 */
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { REACT_STUB, WEB } from './hook-harness.mjs';

const esbuild = createRequire(join(WEB, '..', 'worker', 'package.json'))('esbuild');

const JSX_STUB = `
export const Fragment = Symbol.for('react.fragment');
export function jsx(type, props, key) { return { type, props: props ?? {}, key: key ?? null }; }
export const jsxs = jsx;
export const jsxDEV = jsx;
`;

const ROUTER_STUB = `
export const controls = { navigations: [] };
export const useNavigate = () => (to, options) => { controls.navigations.push({ to, options }); };
export const useLocation = () => ({ pathname: '/auth/roblox', search: '', hash: '', state: null });
export const Link = 'Link';
export const Navigate = 'Navigate';
`;

const SUPABASE_STUB = `
export const controls = {
  session: null,            // what getSession() returns: null, or { user: { id, email, app_metadata } }
  sessionError: null,
  verifyResult: { data: { user: { id: 'the-new-user' } }, error: null },
  calls: [],                // every call made on the client, in order: { method, args }
};
const record = (method, args) => controls.calls.push({ method, args });
export const supabase = { auth: {
  getSession: async () => { record('getSession', []); return { data: { session: controls.session }, error: controls.sessionError }; },
  verifyOtp: async (args) => { record('verifyOtp', [args]); return controls.verifyResult; },
  signOut: async (options) => { record('signOut', [options]); return { error: null }; },
} };
export async function getAccessToken() { return null; }
`;

/** Exports of a module's source as functions returning null: enough for a page that imports them and never calls them. */
function inertSource(source) {
  const names = new Set();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (piece && !piece.startsWith('type ')) names.add(piece.split(/\s+as\s+/).pop());
    }
  }
  return [...names].map((n) => `export const ${n} = () => null;`).join('\n') + (/^export\s+default\b/m.test(source) ? '\nexport default () => null;' : '') + '\n';
}

/** Bundle `entry` (under apps/web) as described above and import it. `real` lists the modules (paths ending as given) that stay real. */
export async function loadPage({ entry, name, real = [] }) {
  // realpath: on macOS the temp directory is a symlink, and a stub reached by two spellings of its path would be bundled twice.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${name}-page-`)));
  const stubs = {};
  for (const [key, source] of Object.entries({ react: REACT_STUB, jsx: JSX_STUB, router: ROUTER_STUB, supabase: SUPABASE_STUB })) {
    stubs[key] = join(dir, `${key}-stub.mjs`);
    writeFileSync(stubs[key], source);
  }
  const entryPath = resolve(WEB, entry);
  const wrapper = join(dir, 'entry.mjs');
  writeFileSync(wrapper, [
    `export * from ${JSON.stringify(entryPath)};`,
    `export { mountStub } from 'react';`,
    `export { controls as routerControls } from 'react-router-dom';`,
    `export { controls as supabaseControls } from 'virtual:supabase';`,
  ].join('\n'));
  const out = join(dir, 'bundle.mjs');
  const built = await esbuild.build({
    entryPoints: [wrapper], bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: out, logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"test"}' },
    plugins: [{
      name: 'page-harness',
      setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({ path: stubs.react }));
        b.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => ({ path: stubs.jsx }));
        b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: stubs.router }));
        b.onResolve({ filter: /^virtual:supabase$/ }, () => ({ path: stubs.supabase }));
        b.onResolve({ filter: /^\.{1,2}\// }, async (args) => {
          if (args.importer !== entryPath || args.path.endsWith('.css')) return undefined;
          const resolved = await b.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind });
          if (resolved.errors.length) return { errors: resolved.errors };
          if (/\/lib\/supabase\.ts$/.test(resolved.path)) return { path: stubs.supabase };
          if (real.some((r) => resolved.path.endsWith(r))) return { path: resolved.path };
          return { path: resolved.path, namespace: 'inert' };
        });
        b.onLoad({ filter: /.*/, namespace: 'inert' }, (args) => ({ contents: inertSource(readFileSync(args.path, 'utf8')), loader: 'js' }));
      },
    }],
  });
  if (built.errors.length) throw new Error(`page bundle failed: ${JSON.stringify(built.errors)}`);
  return import(out);
}

/** The first element of `type` in an unexpanded element tree (what a stubbed component call returns), or null. */
export function findElement(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}
