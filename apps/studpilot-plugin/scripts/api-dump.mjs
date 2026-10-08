// The plugin's 2.0 permission model, read from the shipped Luau so JavaScript checks (worker composers,
// eval harness, tests) answer "can the plugin do this?" the same way Studio will:
//   src/ApiDump.luau     generated from Roblox's API dump (scripts/gen-api-dump.mjs)
//   src/Permissions.luau the deny list and the rule (allow by default)
// Only reads text; it never runs Luau. The rule mirrored here is Permissions.build (creatable/property).
import { readFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);

function parseFields(body) {
  const out = new Map();
  for (const m of body.matchAll(/(?:\["([^"]+)"\]|([A-Za-z_][A-Za-z0-9_]*))="([^"]*)"/g)) out.set(m[1] ?? m[2], m[3]);
  return out;
}

function luaTable(source, name) {
  const start = source.indexOf(`local ${name} = {`);
  if (start < 0) throw new Error(`Permissions.luau has no ${name} table`);
  const end = source.indexOf('\n}', start);
  const body = source.slice(start, end);
  return new Map([...body.matchAll(/^\t([A-Za-z_][A-Za-z0-9_]*) = (?:"([^"]*)"|\{([^}]*)\})/gm)]
    .map((m) => [m[1], m[2] ?? Object.fromEntries([...(m[3] ?? '').matchAll(/([A-Za-z_]\w*) = "([^"]*)"/g)].map((x) => [x[1], x[2]]))]));
}

let cached;
export function pluginPermissions() {
  if (cached) return cached;
  const dump = readFileSync(new URL('ApiDump.luau', SRC), 'utf8');
  const perms = readFileSync(new URL('Permissions.luau', SRC), 'utf8');
  const classes = new Map();
  for (const m of dump.matchAll(/^C\["([^"]+)"\]=\{(.*)\}$/gm)) {
    const body = m[2];
    const s = /(?:^|,)s="([^"]*)"/.exec(body)?.[1];
    const t = (/(?:^|,)t="([^"]*)"/.exec(body)?.[1] ?? '').split(',').filter(Boolean);
    const p = parseFields(/(?:^|,)p=\{([^}]*)\}/.exec(body)?.[1] ?? '');
    const x = parseFields(/(?:^|,)x=\{([^}]*)\}/.exec(body)?.[1] ?? '');
    classes.set(m[1], { s, t, p, x });
  }
  if (classes.size < 500) throw new Error(`only ${classes.size} classes read from ApiDump.luau; the reader is broken`);
  const enums = new Set((/enums = "([^"]*)"/.exec(dump)?.[1] ?? '').split(','));
  const denyProperty = luaTable(perms, 'DENY_PROPERTY');
  const denyClass = luaTable(perms, 'DENY_CLASS');
  const denyClassProperty = luaTable(perms, 'DENY_CLASS_PROPERTY');
  const scriptCreate = luaTable(perms, 'SCRIPT_CREATE');

  const chain = (name) => { const out = []; for (let c = name; c && classes.has(c) && out.length < 64; c = classes.get(c).s) out.push(c); return out; };
  const instantiable = (name) => classes.has(name) && !denyClass.has(name) && !classes.get(name).t.includes('Service') && !classes.get(name).t.includes('NotCreatable');
  const canCreate = (name) => instantiable(name) && !scriptCreate.has(name);
  /** The value type a write may set (without the capture mark), or null. */
  const propertyType = (className, prop) => {
    if (denyProperty.has(prop) || denyClass.has(className)) return null;
    for (const c of chain(className)) {
      const denied = denyClassProperty.get(c);
      if (denied && typeof denied === 'object' && prop in denied) return null;
      const info = classes.get(c);
      if (info.p.has(prop)) return info.p.get(prop).replace(/!$/, '');
      if (info.x.has(prop)) return null;
    }
    return null;
  };
  const creatableNames = new Set([...classes.keys()].filter(canCreate));
  const writableNames = new Set();
  for (const [name, info] of classes) for (const prop of info.p.keys()) if (propertyType(name, prop)) writableNames.add(prop);
  cached = {
    classes, enums, denyProperty, denyClass, scriptCreate, instantiable, canCreate, propertyType, writableNames, creatableNames,
    /** Set-shaped views, for checks written against the 1.x allowlist tables. */
    createClasses: { has: canCreate },
    propertyAllow: { has: (prop) => writableNames.has(prop) },
    enumAllow: { has: (name) => enums.has(name) },
  };
  return cached;
}
