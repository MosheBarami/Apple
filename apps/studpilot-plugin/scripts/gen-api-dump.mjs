// Generates src/ApiDump.luau from Roblox's public API dump, as published by the Roblox-Client-Tracker
// mirror (https://github.com/MaximumADHD/Roblox-Client-Tracker, file API-Dump.json on the `roblox` branch).
//
//   node apps/studpilot-plugin/scripts/gen-api-dump.mjs                               # fetch the current dump
//   node apps/studpilot-plugin/scripts/gen-api-dump.mjs <API-Dump.json> [version]     # from a local copy
//
// Plugin 2.0 (owner decision 2026-10-08, "i accept the reduced safety"): the plugin no longer keeps a
// hand-written class/property allowlist. It allows every creatable class and every scriptable, writable
// property this dump describes, minus a short deny list in src/Permissions.luau. This script only turns
// the dump into data; every decision lives in Permissions.luau.
//
// Output, one statement per class (keeps any single constructor small for Studio's -O0 compiler):
//   C["Part"]={s="FormFactorPart",t="...",p={Shape="Enum.PartType"},x={Mass="ReadOnly"}}
// s: superclass. t: class tags that matter (NotCreatable, Service, Deprecated, NotBrowsable, NotScriptable).
// p: the class's OWN plugin-writable properties (inheritance is resolved at runtime through s) with their
//    value type; a trailing "!" marks one a snapshot does not capture (an alias of another captured
//    property, transient engine state, or a value type the wire format does not carry).
// x: the class's own properties a plugin cannot write, with the reason (a tag or the security level).
// E: every enum name, comma-separated (the plugin resolves items through Studio's own Enum global).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_DUMP = 'https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json';
const URL_VERSION = 'https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/version.txt';
const OUT = fileURLToPath(new URL('../src/ApiDump.luau', import.meta.url));

const PLUGIN_WRITABLE = new Set(['None', 'PluginSecurity']);
const BLOCKING_TAGS = ['ReadOnly', 'NotScriptable', 'Deprecated'];
// Hidden means "not shown in the Properties widget", not "not writable": BasePart.Position is Hidden in
// current dumps and scripts set it all the time. Writable, but never captured (it aliases a shown one).
const NO_CAPTURE_TAGS = ['Hidden'];
// Writable, but a snapshot must not record them: an alias of another captured property (setting both
// would let the coarser one win), structure the snapshot records itself, or transient engine state.
const NO_CAPTURE = new Set(['Parent', 'Name', 'Source', 'BrickColor', 'Rotation', 'Orientation', 'Position', 'WorldPosition',
  'WorldOrientation', 'WorldCFrame', 'WorldAxis', 'WorldSecondaryAxis', 'Axis', 'SecondaryAxis', 'AssemblyLinearVelocity',
  'AssemblyAngularVelocity', 'Capabilities', 'Sandboxed', 'Archivable', 'ClockTime', 'WorldPivot']);
// Value types the typed {t,v} wire format carries (Commands.luau decodeValue/encodeValue).
const WIRE_TYPES = new Set(['string', 'float', 'double', 'int', 'int64', 'bool', 'Vector2', 'Vector3', 'CFrame', 'Color3',
  'NumberRange', 'NumberSequence', 'ColorSequence', 'BrickColor', 'Font', 'Rect', 'UDim', 'UDim2', 'Axes', 'Faces',
  'PhysicalProperties', 'ContentId', 'Content', 'Instance']);

async function load() {
  const [path, version] = process.argv.slice(2);
  if (path) return { dump: JSON.parse(readFileSync(path, 'utf8')), version: version ?? 'local' };
  const res = await fetch(URL_DUMP);
  if (!res.ok) throw new Error(`API dump fetch failed: ${res.status}`);
  const dump = await res.json();
  const v = await fetch(URL_VERSION).then((r) => (r.ok ? r.text() : 'unknown'), () => 'unknown');
  return { dump, version: v.trim() };
}

const lua = (s) => JSON.stringify(s); // JSON string escapes are valid Luau string escapes for this ASCII data
const key = (s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `[${lua(s)}]`);

function valueType(vt) {
  if (vt.Category === 'Enum') return `Enum.${vt.Name}`;
  if (vt.Category === 'Class') return 'Instance';
  return vt.Name;
}

function inheritsProperty(classes, name, prop) {
  for (let c = classes.get(name); c; c = classes.get(c.Superclass)) {
    if (c.Members.some((m) => m.MemberType === 'Property' && m.Name === prop)) return true;
  }
  return false;
}

const { dump, version } = await load();
const classes = new Map(dump.Classes.map((c) => [c.Name, c]));
const lines = [];
let writable = 0;
for (const c of [...dump.Classes].sort((a, b) => a.Name.localeCompare(b.Name))) {
  const p = [];
  const x = [];
  for (const m of [...c.Members].sort((a, b) => a.Name.localeCompare(b.Name))) {
    if (m.MemberType !== 'Property') continue;
    const tags = m.Tags ?? [];
    const sec = typeof m.Security === 'string' ? { Read: m.Security, Write: m.Security } : m.Security;
    const blocked = BLOCKING_TAGS.find((t) => tags.includes(t))
      ?? (!PLUGIN_WRITABLE.has(sec.Write) ? sec.Write : !PLUGIN_WRITABLE.has(sec.Read) ? sec.Read : null);
    if (blocked) { x.push(`${key(m.Name)}=${lua(blocked)}`); continue; }
    const type = valueType(m.ValueType);
    let capture = !NO_CAPTURE.has(m.Name) && !NO_CAPTURE_TAGS.some((t) => tags.includes(t)) && (type.startsWith('Enum.') || WIRE_TYPES.has(type)) && type !== 'Content'
      && !(m.Serialization && m.Serialization.CanLoad === false);
    // A BrickColor is captured only where no Color3 Color stands for it.
    if (m.Name === 'BrickColor' && !tags.includes('Hidden') && !inheritsProperty(classes, c.Name, 'Color')) capture = true;
    // Position/Orientation/Rotation are aliases only beside a CFrame (a GuiObject's Position is the real one).
    if (['Position', 'Orientation', 'Rotation'].includes(m.Name) && !tags.includes('Hidden') && !inheritsProperty(classes, c.Name, 'CFrame')) capture = true;
    p.push(`${key(m.Name)}=${lua(type + (capture ? '' : '!'))}`);
    writable += 1;
  }
  const fields = [];
  if (c.Superclass && c.Superclass !== '<<<ROOT>>>') fields.push(`s=${lua(c.Superclass)}`);
  const tags = (c.Tags ?? []).filter((t) => ['NotCreatable', 'Service', 'Deprecated', 'NotBrowsable', 'NotScriptable'].includes(t));
  if (tags.length) fields.push(`t=${lua(tags.join(','))}`);
  if (p.length) fields.push(`p={${p.join(',')}}`);
  if (x.length) fields.push(`x={${x.join(',')}}`);
  lines.push(`C[${lua(c.Name)}]={${fields.join(',')}}`);
}
const enums = dump.Enums.map((e) => e.Name).sort();

const header = `--!nocheck
-- GENERATED by apps/studpilot-plugin/scripts/gen-api-dump.mjs from Roblox's API dump
-- (Roblox-Client-Tracker, API-Dump.json, client version ${version}). Do not edit by hand; rerun the script.
-- ${dump.Classes.length} classes, ${writable} plugin-writable properties, ${enums.length} enums.
-- Data only: what is allowed is decided in Permissions.luau.
local C = {}
`;
writeFileSync(OUT, `${header}${lines.join('\n')}\nreturn { version = ${lua(version)}, classes = C, enums = ${lua(enums.join(','))} }\n`);
console.log(`wrote ${OUT}: ${dump.Classes.length} classes, ${writable} writable properties, ${enums.length} enums (version ${version})`);
