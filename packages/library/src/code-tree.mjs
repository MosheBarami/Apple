// What insert_library_code needs per code module: its instance tree in Rojo's conventions (a folder with init.luau is a
// ModuleScript holding the init source; .server.luau is a Script, .client.luau a LocalScript; a folder without init is
// a Folder), the name it takes under ReplicatedStorage.Packages, and its dependencies as library ids (from wally.toml),
// so a module goes in with what it requires. A module that needs a string-require loader (Nevermore's require("Name"))
// is not standalone and is never offered for insertion.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const SKIP = /(^|[\\/])(tests?|spec|specs|examples?|benchmarks?|\.github|node_modules|Packages|DevPackages|TestEZ)([\\/]|$)|\.(spec|test|story)\.(lua|luau)$/i;
const LUA = /\.(lua|luau)$/i;

function scriptClass(file) {
  if (/\.server\.(lua|luau)$/i.test(file)) return 'Script';
  if (/\.client\.(lua|luau)$/i.test(file)) return 'LocalScript';
  return 'ModuleScript';
}
const stem = (file) => basename(file).replace(/(\.server|\.client)?\.(lua|luau)$/i, '');

/** The instance tree of a file or folder (Rojo rules). Pure apart from reading files. */
export function buildTree(path, name = stem(path)) {
  const st = statSync(path);
  if (st.isFile()) return LUA.test(path) ? { name, className: scriptClass(path), source: readFileSync(path, 'utf8') } : null;
  const entries = readdirSync(path).filter((e) => !SKIP.test(join(path, e)) && !e.startsWith('.'));
  const init = entries.find((e) => /^init(\.server|\.client)?\.(lua|luau)$/i.test(e));
  const children = entries.filter((e) => e !== init).map((e) => buildTree(join(path, e))).filter(Boolean);
  if (init) return { name, className: scriptClass(init), source: readFileSync(join(path, init), 'utf8'), children };
  return children.length ? { name, className: 'Folder', children } : null;
}

export const countScripts = (t) => (t ? (t.className === 'Folder' ? 0 : 1) + (t.children ?? []).reduce((n, c) => n + countScripts(c), 0) : 0);
export const allSource = (t) => (t ? (t.source ?? '') + '\n' + (t.children ?? []).map(allSource).join('\n') : '');

/** { name, deps: { alias: wallyName } } from the nearest wally.toml at or above the module root (within the repo). */
export function wallyInfo(root, repoDir) {
  for (let d = statSync(root).isDirectory() ? root : dirname(root); d.startsWith(repoDir); d = dirname(d)) {
    const f = join(d, 'wally.toml');
    if (!existsSync(f)) { if (d === repoDir) break; continue; }
    const text = readFileSync(f, 'utf8');
    const name = (text.match(/^\s*name\s*=\s*"([^"]+)"/m) ?? [])[1];
    const deps = {};
    const section = (text.split(/^\[dependencies\]\s*$/m)[1] ?? '').split(/^\[/m)[0];
    for (const m of section.matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"@]+)@/gm)) deps[m[1]] = m[2].toLowerCase();
    return { name: name?.toLowerCase(), deps };
    // (only the nearest file counts)
  }
  return { name: undefined, deps: {} };
}

const GENERIC = /^(src|lib|source|init|main|roblox|module|modules|package|packages)$/i;
const flat = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pascal = (s) => String(s).split(/[-_\s.]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/**
 * The name a package takes in Packages, keeping its authors' casing: the folder or repo name that matches the wally
 * name (ProfileStore, ZonePlus), else the folder unless it is generic (src, lib), else the repo; PascalCase if it has
 * dashes. Pure.
 */
export function packageName(wallyName, folder, repo) {
  const want = flat((wallyName ?? '').split('/').pop());
  const named = [folder, repo].find((c) => c && !GENERIC.test(c) && want && flat(c) === want);
  const pick = named ?? (folder && !GENERIC.test(folder) ? folder : repo ?? folder);
  return /[-_\s.]/.test(pick) ? pascal(pick) : pick[0].toUpperCase() + pick.slice(1);
}

/** A string require (`require("Name")`, Nevermore's loader) cannot resolve in a plain place. */
export const needsLoader = (src) => /\brequire\s*\(\s*["'][A-Za-z]/.test(src);
