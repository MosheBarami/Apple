// The plugin's Luau sources, as rojo bundles them: every src/*.luau, plus every src/<dir>/*.luau
// (a directory is a ModuleScript when it has init.luau, a Folder otherwise). One list, so the parse
// gate, the -O0 compile gate and the build cannot disagree about what ships.
//
// src/ops/ exists because Commands.luau is at the edge of Luau's 200-local limit; a gate that only
// read src/*.luau would build and ship an op family it never parsed or compiled.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function pluginSources(src) {
  const out = [];
  for (const name of readdirSync(src).sort()) {
    const full = join(src, name);
    if (statSync(full).isDirectory()) {
      for (const child of readdirSync(full).sort()) {
        if (child.endsWith('.luau')) out.push(join(full, child));
      }
    } else if (name.endsWith('.luau')) {
      out.push(full);
    }
  }
  return out.map((abs) => ({ abs, rel: relative(src, abs) }));
}

function moduleExists(dir, name) {
  return existsSync(join(dir, `${name}.luau`)) || existsSync(join(dir, name, 'init.luau'));
}

/**
 * Requires in `code` (comments already stripped) that name a module not bundled. `script` is the
 * file's own instance: for src/X.luau its children are nothing and script.Parent is the plugin
 * root (src); for src/dir/init.luau `script` IS the directory; for src/dir/Y.luau script.Parent is.
 */
export function missingRequires(src, rel, code) {
  const fileDir = dirname(join(src, rel));
  const isInit = /(^|\/)init(\.server|\.client)?\.luau$/.test(rel);
  const selfDir = isInit ? fileDir : null;
  const parentDir = isInit ? dirname(fileDir) : fileDir;
  const missing = [];
  for (const match of code.matchAll(/require\(script(\.Parent)?\.([A-Za-z_]\w*)\)/g)) {
    const base = match[1] ? parentDir : selfDir;
    if (base === null || !moduleExists(base, match[2])) missing.push(match[2]);
  }
  return missing;
}
